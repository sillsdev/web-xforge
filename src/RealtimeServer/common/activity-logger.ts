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
const MAX_QUEUED_ENTRIES = 10_000;

/**
 * A single entry describing something the RealtimeServer did. Every entry shares a timestamp and an event name;
 * callers of ActivityLogger.log supply additional fields describing that particular event.
 */
export interface ActivityLogEntry {
  timestamp: string;
  event: string;
  /** Which RealtimeServer process wrote the entry. Processes and restarts share one log file. */
  pid: number;
}

/**
 * Logs a description of activity performed by the RealtimeServer. This is to give context for the resource usage
 * reports produced by ResourceMonitor. Logging is controlled by the SF_RTS_LOG_LEVEL environment variable.
 */
export class ActivityLogger {
  private static _instance: ActivityLogger | undefined;
  private readonly logLevel: RtsLogLevel;
  private readonly logPath: string;
  private readonly pendingEntries: ActivityLogEntry[] = [];
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
    if (this.pendingEntries.length >= MAX_QUEUED_ENTRIES) {
      this.droppedEntryCount++;
      return;
    }
    this.pendingEntries.push(entry);
    // If a flush is already running, it will pick up the pending entry.
    if (!this.isFlushing) {
      void this.flushQueue();
    }
  }

  /**
   * Write pendingEntries to disk. May write more than once if more entries come in while running.
   */
  private async flushQueue(): Promise<void> {
    this.isFlushing = true;
    try {
      if (!this.directoryEnsured) {
        const dirPath: string = path.dirname(this.logPath);
        await mkdir(dirPath, { recursive: true });
        this.directoryEnsured = true;
      }
      while (this.pendingEntries.length > 0) {
        const batchSize: number = this.pendingEntries.length;
        const lines: string = this.pendingEntries
          .slice(0, batchSize)
          .map(batchEntry => JSON.stringify(batchEntry) + '\n')
          .join('');
        await appendFile(this.logPath, lines, { flag: 'a' });
        // Only remove the batch after a successful write without throwing.
        this.pendingEntries.splice(0, batchSize);
      }
      if (this.droppedEntryCount > 0) {
        console.error(`ActivityLogger dropped ${this.droppedEntryCount} entries because its write queue was full.`);
        this.droppedEntryCount = 0;
      }
    } catch (error) {
      // Ignore rather than throw. Don't cause a problem to RealtimeServer.
      console.error(`Ignoring error writing to ${this.logPath}:`, error);
    } finally {
      this.isFlushing = false;
    }
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
