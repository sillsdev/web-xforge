import { Collection, Db } from 'mongodb';
import { ActivityLogger } from '../activity-logger';

/**
 * The gateway's record of what it refused, withheld or closed, and why. Events go to a Mongo collection that expires
 * them after 90 days, and are mirrored to ActivityLogger. Clients control how often the gateway logs (every bad message
 * is an event), so logging is bounded: each connection logs at most a fixed number of events, a token bucket per user
 * limits the rate of each user's connections together, so that one user cannot use up what is left, another token
 * bucket limits the rate across all connections, and the text in an event is truncated. Events the limits drop are
 * counted, and the counts are stored with later events. Logging never throws into message handling.
 */

/** What happened. */
export type GatewayEventKind =
  | 'protocol-violation'
  | 'unsupported-query'
  | 'refused'
  | 'withheld'
  | 'closed'
  | 'token-expired'
  | 'unexpected-outbound'
  | 'internal-error'
  | 'overflow'
  | 'log-cap-reached';

/** Who an event's connection belongs to and where it comes from. */
export interface GatewayConnectionDetails {
  readonly userId: string;
  readonly src: string;
  readonly remoteAddress: string | null;
  readonly origin: string | null;
}

/** What a caller says about an event: why, and which message and doc it concerns. Never a whole payload. */
export interface GatewayEventDetails {
  readonly reason: string;
  readonly action?: string;
  readonly collection?: string;
  readonly docId?: string;
  readonly queryId?: number;
  readonly channel?: string;
}

/** An event as it is stored. */
export interface GatewayEvent extends GatewayEventDetails {
  readonly timestamp: Date;
  readonly kind: GatewayEventKind;
  readonly userId: string;
  readonly src: string;
  readonly remoteAddress: string | null;
  readonly origin: string | null;
  /**
   * How many events (of any connection) the global rate limit dropped since the previous event that was stored.
   * Absent when none were dropped.
   */
  readonly droppedEvents?: number;
  /**
   * How many of this user's events the per-user rate limit dropped since the user's previous event that was stored.
   * Absent when none were dropped.
   */
  readonly droppedUserEvents?: number;
}

/** Where events are stored. */
export interface GatewayEventSink {
  write(event: GatewayEvent): Promise<void>;
}

/** The Mongo collection that holds gateway events. ShareDB does not serve it. */
export const GATEWAY_EVENTS_COLLECTION = 'realtime_gateway_events';

/** How long Mongo keeps a gateway event. */
export const GATEWAY_EVENT_TTL_SECONDS = 90 * 24 * 60 * 60;

/** The most events one connection logs before it logs 'log-cap-reached' and then nothing more. */
export const DEFAULT_PER_CONNECTION_CAP = 50;
/** How many events per second, across all connections, are stored on average. */
export const DEFAULT_GLOBAL_RATE_PER_SECOND = 20;
/** How many events can be stored at once after a quiet period, before the rate limit applies. */
export const DEFAULT_GLOBAL_BURST = 200;
/** How many events per second the connections of one user store on average, together. */
export const DEFAULT_PER_USER_RATE_PER_SECOND = 1;
/** How many events the connections of one user can store at once after a quiet period. */
export const DEFAULT_PER_USER_BURST = 50;
/**
 * The most users whose rate limits are remembered. The user who logged least recently is forgotten first, and starts
 * with a full bucket when they log again.
 */
export const MAX_RATE_LIMITED_USERS = 10_000;

/** The longest reason stored, in UTF-16 code units. Longer reasons are cut and end with TRUNCATION_MARK. */
export const MAX_REASON_LENGTH = 1000;
/** The longest value stored in any other text field, such as a doc id or origin. */
export const MAX_FIELD_LENGTH = 200;
export const TRUNCATION_MARK = '…';

/** The least time between two console reports of failed event writes. Failures in between are counted. */
const SINK_FAILURE_REPORT_INTERVAL_MS = 60_000;
const MILLISECONDS_PER_SECOND = 1000;

/** Stores gateway events in GATEWAY_EVENTS_COLLECTION. */
export class MongoGatewayEventSink implements GatewayEventSink {
  constructor(private readonly db: Db) {}

  private get collection(): Collection<GatewayEvent> {
    return this.db.collection<GatewayEvent>(GATEWAY_EVENTS_COLLECTION);
  }

  /** Makes Mongo delete events GATEWAY_EVENT_TTL_SECONDS after their timestamp. */
  async createIndexes(): Promise<void> {
    await this.collection.createIndex(
      { timestamp: 1 },
      { name: 'timestamp_ttl', expireAfterSeconds: GATEWAY_EVENT_TTL_SECONDS }
    );
  }

  async write(event: GatewayEvent): Promise<void> {
    // A copy, because insertOne adds an _id to the object it is given. Fields left undefined are not stored.
    await this.collection.insertOne({ ...event }, { ignoreUndefined: true });
  }
}

/** Keeps gateway events in memory, for tests. */
export class MemoryGatewayEventSink implements GatewayEventSink {
  readonly events: GatewayEvent[] = [];

  async write(event: GatewayEvent): Promise<void> {
    this.events.push(event);
  }
}

/** Options for GatewayEventLog. */
export interface GatewayEventLogOptions {
  readonly perConnectionCap?: number;
  readonly globalRatePerSecond?: number;
  readonly globalBurst?: number;
  readonly perUserRatePerSecond?: number;
  readonly perUserBurst?: number;
  /** The current time in milliseconds, as Date.now gives it. Tests replace it. */
  readonly now?: () => number;
}

/** The event log of one connection (see GatewayEventLog.forConnection). */
export interface ConnectionEventLog {
  /**
   * Logs an event of this connection. Never throws, never rejects, and returns nothing. After the per-connection cap,
   * logs one 'log-cap-reached' and then drops this connection's events. Events beyond the user's or the global rate
   * limit are dropped and counted, and the counts are stored with the next event that is stored (see
   * GatewayEvent.droppedEvents and droppedUserEvents).
   * Each stored event is also logged to ActivityLogger.
   */
  log(kind: GatewayEventKind, details: GatewayEventDetails): void;
  /** Sets the src that later events carry. The src can change after the handshake. */
  setSrc(src: string): void;
}

/** An event before the shared log stamps the counts of dropped events on it. */
type UnstampedGatewayEvent = Omit<GatewayEvent, 'droppedEvents' | 'droppedUserEvents'>;

/** A token bucket: on average `ratePerSecond` tokens a second, and at most `burst` at once. */
class TokenBucket {
  private availableTokens: number;
  private lastRefillTime: number;
  /** How many takes failed since the last one that succeeded. */
  dropped: number = 0;

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
    now: number
  ) {
    this.availableTokens = burst;
    this.lastRefillTime = now;
  }

  /** Takes one token, if one is available, after refilling the bucket for the time passed. */
  take(now: number): boolean {
    // A clock that goes backwards adds nothing.
    const elapsedMs: number = Math.max(0, now - this.lastRefillTime);
    this.lastRefillTime = now;
    this.availableTokens = Math.min(
      this.burst,
      this.availableTokens + (elapsedMs * this.ratePerSecond) / MILLISECONDS_PER_SECOND
    );
    if (this.availableTokens < 1) {
      this.dropped++;
      return false;
    }
    this.availableTokens -= 1;
    return true;
  }

  /** The count of failed takes, which is then reset. */
  takeDropped(): number {
    const dropped: number = this.dropped;
    this.dropped = 0;
    return dropped;
  }
}

/**
 * Applies the per-user and global rate limits and writes events to the sink and ActivityLogger. One per process; each
 * connection logs through its own ConnectionEventLog from forConnection.
 */
export class GatewayEventLog {
  private readonly perConnectionCap: number;
  private readonly perUserRatePerSecond: number;
  private readonly perUserBurst: number;
  private readonly now: () => number;
  private readonly globalBucket: TokenBucket;
  /** The rate limit of each user, in the order they last logged (least recent first). */
  private readonly userBuckets = new Map<string, TokenBucket>();
  private lastSinkFailureReportTime: number | undefined;
  private unreportedSinkFailures: number = 0;

  /** Throws if an option is not a positive number. This happens at startup, never while handling a message. */
  constructor(
    private readonly sink: GatewayEventSink,
    options: GatewayEventLogOptions = {}
  ) {
    this.perConnectionCap = positiveOption('perConnectionCap', options.perConnectionCap, DEFAULT_PER_CONNECTION_CAP);
    this.perUserRatePerSecond = positiveOption(
      'perUserRatePerSecond',
      options.perUserRatePerSecond,
      DEFAULT_PER_USER_RATE_PER_SECOND
    );
    this.perUserBurst = positiveOption('perUserBurst', options.perUserBurst, DEFAULT_PER_USER_BURST);
    this.now = options.now ?? Date.now;
    this.globalBucket = new TokenBucket(
      positiveOption('globalRatePerSecond', options.globalRatePerSecond, DEFAULT_GLOBAL_RATE_PER_SECOND),
      positiveOption('globalBurst', options.globalBurst, DEFAULT_GLOBAL_BURST),
      this.now()
    );
  }

  forConnection(details: GatewayConnectionDetails): ConnectionEventLog {
    return new CappedConnectionEventLog(details, this.perConnectionCap, this.now, (event: UnstampedGatewayEvent) =>
      this.write(event)
    );
  }

  /** Stores an event if the user's and the global rate limits allow it. Never throws. */
  private write(unstamped: UnstampedGatewayEvent): void {
    try {
      const currentTime: number = this.now();
      // The user's limit comes first, so that events it drops do not use up the global limit.
      const userBucket: TokenBucket = this.userBucket(unstamped.userId, currentTime);
      if (!userBucket.take(currentTime) || !this.globalBucket.take(currentTime)) {
        return;
      }
      const droppedEvents: number = this.globalBucket.takeDropped();
      const droppedUserEvents: number = userBucket.takeDropped();
      const event: GatewayEvent = {
        ...unstamped,
        droppedEvents: droppedEvents > 0 ? droppedEvents : undefined,
        droppedUserEvents: droppedUserEvents > 0 ? droppedUserEvents : undefined
      } satisfies GatewayEvent;
      this.mirrorToActivityLog(event);
      this.writeToSink(event);
    } catch (error) {
      this.reportSinkFailure(error);
    }
  }

  /** The user's rate limit, made when the user first logs, and moved to the end of the least recently used order. */
  private userBucket(userId: string, currentTime: number): TokenBucket {
    let bucket: TokenBucket | undefined = this.userBuckets.get(userId);
    if (bucket == null) {
      bucket = new TokenBucket(this.perUserRatePerSecond, this.perUserBurst, currentTime);
    } else {
      this.userBuckets.delete(userId);
    }
    this.userBuckets.set(userId, bucket);
    while (this.userBuckets.size > MAX_RATE_LIMITED_USERS) {
      const leastRecent: string | undefined = this.userBuckets.keys().next().value;
      if (leastRecent == null) {
        break;
      }
      this.userBuckets.delete(leastRecent);
    }
    return bucket;
  }

  private mirrorToActivityLog(event: GatewayEvent): void {
    ActivityLogger.instance.log('gatewayEvent', {
      kind: event.kind,
      reason: event.reason,
      userId: event.userId,
      src: event.src,
      remoteAddress: event.remoteAddress,
      origin: event.origin,
      action: event.action,
      collection: event.collection,
      docId: event.docId,
      queryId: event.queryId,
      channel: event.channel,
      droppedEvents: event.droppedEvents,
      droppedUserEvents: event.droppedUserEvents
    });
  }

  private writeToSink(event: GatewayEvent): void {
    let pending: Promise<void>;
    try {
      pending = this.sink.write(event);
    } catch (error) {
      this.reportSinkFailure(error);
      return;
    }
    // Promise.resolve also copes with a sink that returns something other than a promise.
    Promise.resolve(pending).catch((error: unknown) => this.reportSinkFailure(error));
  }

  /** Reports a failed write to the console, at most once per SINK_FAILURE_REPORT_INTERVAL_MS. Never throws. */
  private reportSinkFailure(error: unknown): void {
    try {
      const currentTime: number = this.now();
      if (
        this.lastSinkFailureReportTime != null &&
        currentTime - this.lastSinkFailureReportTime < SINK_FAILURE_REPORT_INTERVAL_MS
      ) {
        this.unreportedSinkFailures++;
        return;
      }
      const unreported: string =
        this.unreportedSinkFailures > 0 ? ` (${this.unreportedSinkFailures} earlier failures were not reported)` : '';
      console.error(`Gateway event log: could not write an event${unreported}`, error);
      this.lastSinkFailureReportTime = currentTime;
      this.unreportedSinkFailures = 0;
    } catch {
      // Nothing more can be done; logging must not disturb message handling.
    }
  }
}

/**
 * The ConnectionEventLog of one connection. It applies the per-connection cap and fills in the connection's details,
 * then hands each event to the shared GatewayEventLog.
 */
class CappedConnectionEventLog implements ConnectionEventLog {
  private src: string;
  private loggedCount: number = 0;
  private capReached: boolean = false;

  constructor(
    private readonly connection: GatewayConnectionDetails,
    private readonly cap: number,
    private readonly now: () => number,
    private readonly write: (event: UnstampedGatewayEvent) => void
  ) {
    this.src = connection.src;
  }

  log(kind: GatewayEventKind, details: GatewayEventDetails): void {
    try {
      if (this.loggedCount < this.cap) {
        this.loggedCount++;
        this.write(this.buildEvent(kind, details));
      } else if (!this.capReached) {
        this.capReached = true;
        this.write(
          this.buildEvent('log-cap-reached', {
            reason: `this connection logged ${this.cap} events; its later events are not logged`
          })
        );
      }
    } catch (error) {
      console.error('Gateway event log: could not log an event', error);
    }
  }

  setSrc(src: string): void {
    this.src = src;
  }

  private buildEvent(kind: GatewayEventKind, details: GatewayEventDetails): UnstampedGatewayEvent {
    return {
      timestamp: new Date(this.now()),
      kind: kind,
      userId: truncate(this.connection.userId, MAX_FIELD_LENGTH),
      src: truncate(this.src, MAX_FIELD_LENGTH),
      remoteAddress: truncateNullable(this.connection.remoteAddress),
      origin: truncateNullable(this.connection.origin),
      reason: truncate(details.reason, MAX_REASON_LENGTH),
      action: truncateOptional(details.action),
      collection: truncateOptional(details.collection),
      docId: truncateOptional(details.docId),
      queryId: details.queryId,
      channel: truncateOptional(details.channel)
    };
  }
}

/**
 * Cuts text longer than maxLength, ending it with TRUNCATION_MARK so that the result is maxLength long. A surrogate
 * pair is not split.
 */
export function truncate(text: string, maxLength: number): string {
  // String() guards against a caller that passes a non-string despite the type.
  const value: string = String(text);
  if (value.length <= maxLength) {
    return value;
  }
  let end: number = maxLength - TRUNCATION_MARK.length;
  const lastKept: number = value.charCodeAt(end - 1);
  const isHighSurrogate: boolean = lastKept >= 0xd800 && lastKept <= 0xdbff;
  if (isHighSurrogate) {
    end--;
  }
  return value.slice(0, end) + TRUNCATION_MARK;
}

function truncateOptional(text: string | undefined): string | undefined {
  return text == null ? undefined : truncate(text, MAX_FIELD_LENGTH);
}

function truncateNullable(text: string | null): string | null {
  return text == null ? null : truncate(text, MAX_FIELD_LENGTH);
}

function positiveOption(name: string, value: number | undefined, defaultValue: number): number {
  const result: number = value ?? defaultValue;
  if (!Number.isFinite(result) || result <= 0) {
    throw new Error(`GatewayEventLog option ${name} must be a positive number, but it is ${result}`);
  }
  return result;
}
