import { appendFile, mkdir } from 'fs/promises';
import * as path from 'path';
import { resolveLogPath } from './utils/utils';

/**
 * Controls how much RealtimeServer activity is logged.
 */
export type RtsLogLevel = 'none' | 'all';
function isRtsLogLevel(value: string): value is RtsLogLevel {
  switch (value) {
    case 'none':
    case 'all':
      return true;
    default:
      return false;
  }
}

const DEFAULT_LOG_LEVEL: RtsLogLevel = 'none';
const DEFAULT_LOG_DIR_NAME = 'sf-rts-activity-log';
const DEFAULT_LOG_FILE_NAME = 'realtimeserver-log.jsonl';
// If disk writes can't keep up with log() calls past this limit, new entries are dropped.
export const MAX_QUEUED_ENTRIES = 10_000;

/**
 * A single entry describing something the RealtimeServer did. Every entry shares a timestamp and an event name;
 * callers of ActivityLogger.log supply additional fields describing that particular event.
 */
export interface ActivityLogEntry {
  timestamp: string;
  event: string;
  /** Which RealtimeServer process wrote the entry. Processes and restarts share one log file. */
  pid: number;
  /** Whatever else describes this particular event. What these are depends entirely on the event. */
  [detail: string]: unknown;
}

/**
 * Logs a description of activity performed by the RealtimeServer. This is to give context for the resource usage
 * reports produced by ResourceMonitor. Logging is controlled by the SF_RTS_LOG_LEVEL environment variable.
 */
export class ActivityLogger {
  private static _instance: ActivityLogger | undefined;
  private readonly logLevel: RtsLogLevel;
  private readonly logPath: string;
  /** Log entries waiting to be written. */
  private readonly pendingLines: string[] = [];
  private isFlushing = false;
  private droppedEntryCount = 0;
  private directoryEnsured = false;

  private constructor() {
    this.logLevel = this.determineLogLevel();
    this.logPath = this.determineLogPath();
  }

  /** Singleton. */
  public static get instance(): ActivityLogger {
    return (ActivityLogger._instance ??= new ActivityLogger());
  }

  public get enabled(): boolean {
    return this.logLevel !== 'none';
  }

  /** Log a description of something the RealtimeServer did, if logging is enabled. */
  public log(event: string, details: Record<string, unknown> = {}): void {
    if (!this.enabled) return;
    const timestamp: string = new Date().toISOString();
    const entry: ActivityLogEntry = {
      timestamp: timestamp,
      event: event,
      pid: process.pid,
      ...details
    };
    // Re-assign after the spread as well in case details overwrote them.
    entry.timestamp = timestamp;
    entry.event = event;
    entry.pid = process.pid;
    this.enqueue(entry);
  }

  /**
   * Queues an entry to be written and, if a write isn't already in progress, starts one.
   */
  private enqueue(entry: ActivityLogEntry): void {
    let line: string;
    try {
      line = JSON.stringify(entry) + '\n';
    } catch {
      this.droppedEntryCount++;
      return;
    }
    if (this.pendingLines.length >= MAX_QUEUED_ENTRIES) {
      this.droppedEntryCount++;
    } else {
      this.pendingLines.push(line);
    }
    // Started even when the line was dropped: writing may have been failing, and this is what tries it again.
    if (!this.isFlushing) {
      void this.flushQueue();
    }
  }

  /**
   * Write pending log entries to disk. May write more than once if more entries come in while running.
   */
  private async flushQueue(): Promise<void> {
    this.isFlushing = true;
    try {
      if (!this.directoryEnsured) {
        const dirPath: string = path.dirname(this.logPath);
        await mkdir(dirPath, { recursive: true });
        this.directoryEnsured = true;
      }
      while (this.pendingLines.length > 0 || this.droppedEntryCount > 0) {
        this.queueDroppedEntriesNotice();
        const batchSize: number = this.pendingLines.length;
        await appendFile(this.logPath, this.pendingLines.slice(0, batchSize).join(''), { flag: 'a' });
        // Only remove the batch after a successful write without throwing.
        this.pendingLines.splice(0, batchSize);
      }
    } catch (error) {
      // Ignore rather than throw. Don't cause a problem to RealtimeServer.
      console.error(`Ignoring error writing to ${this.logPath}:`, error);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * If entries have been dropped, queue an entry saying so. It goes into the same queue as everything else so that a
   * failed write is retried rather than losing the record that entries were lost.
   */
  private queueDroppedEntriesNotice(): void {
    if (this.droppedEntryCount === 0) return;
    const notice: ActivityLogEntry = {
      timestamp: new Date().toISOString(),
      event: 'logEntriesDropped',
      pid: process.pid,
      droppedCount: this.droppedEntryCount
    };
    this.pendingLines.push(JSON.stringify(notice) + '\n');
    this.droppedEntryCount = 0;
  }

  private determineLogLevel(): RtsLogLevel {
    const requestedLevel: string | undefined = process.env['SF_RTS_LOG_LEVEL'];
    if (requestedLevel != null && isRtsLogLevel(requestedLevel)) {
      return requestedLevel;
    }
    return DEFAULT_LOG_LEVEL;
  }

  private determineLogPath(): string {
    return resolveLogPath('SF_RTS_LOG_PATH', path.join(DEFAULT_LOG_DIR_NAME, DEFAULT_LOG_FILE_NAME));
  }
}
