import { Db } from 'mongodb';
import { ActivityLogger } from '../activity-logger';
import {
  ConnectionEventLog,
  GATEWAY_EVENT_TTL_SECONDS,
  GATEWAY_EVENTS_COLLECTION,
  GatewayEvent,
  GatewayEventLog,
  GatewayEventSink,
  MAX_FIELD_LENGTH,
  MAX_REASON_LENGTH,
  MemoryGatewayEventSink,
  MongoGatewayEventSink,
  TRUNCATION_MARK,
  truncate
} from './gateway-event-log';

describe('GatewayEventLog', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores an event with the connection details', () => {
    const env = new EventLogTestEnvironment();
    env.connectionLog.log('refused', { reason: 'no read right', action: 'f', collection: 'texts', docId: 'p1:MAT:1' });

    expect(env.sink.events).toEqual([
      {
        timestamp: new Date(env.time),
        kind: 'refused',
        userId: 'user01',
        src: 'src1',
        remoteAddress: '10.0.0.1',
        origin: 'https://example.org',
        reason: 'no read right',
        action: 'f',
        collection: 'texts',
        docId: 'p1:MAT:1'
      }
    ]);
  });

  it('logs log-cap-reached once after the per-connection cap, then drops the connection events', () => {
    const env = new EventLogTestEnvironment({ perConnectionCap: 3 });
    const otherConnection: ConnectionEventLog = env.log.forConnection(env.connectionDetails('user02'));

    // SUT
    for (let n = 0; n < 10; n++) {
      env.connectionLog.log('refused', { reason: `refusal ${n}` });
    }
    otherConnection.log('refused', { reason: 'other connection' });

    expect(env.sink.events.map(event => [event.userId, event.kind, event.reason])).toEqual([
      ['user01', 'refused', 'refusal 0'],
      ['user01', 'refused', 'refusal 1'],
      ['user01', 'refused', 'refusal 2'],
      ['user01', 'log-cap-reached', expect.stringContaining('3 events')],
      ['user02', 'refused', 'other connection']
    ]);
  });

  it('drops events beyond the global rate and reports how many were dropped', () => {
    const env = new EventLogTestEnvironment({ globalRatePerSecond: 2, globalBurst: 3 });
    for (let n = 0; n < 5; n++) {
      env.connectionLog.log('refused', { reason: `burst ${n}` });
    }
    expect(env.sink.events.map(event => event.reason)).toEqual(['burst 0', 'burst 1', 'burst 2']);
    expect(env.sink.events.every(event => event.droppedEvents === undefined)).toBe(true);

    // Half a second at 2 per second gives one more token.
    env.time += 500;

    // SUT
    env.connectionLog.log('refused', { reason: 'after wait' });
    env.connectionLog.log('refused', { reason: 'too soon' });

    expect(env.sink.events.length).toBe(4);
    expect(env.sink.events[3]).toEqual(expect.objectContaining({ reason: 'after wait', droppedEvents: 2 }));

    // A long quiet period refills the bucket only up to the burst size.
    env.time += 60_000;
    for (let n = 0; n < 5; n++) {
      env.connectionLog.log('refused', { reason: `second burst ${n}` });
    }
    expect(env.sink.events.length).toBe(7);
    expect(env.sink.events[4].droppedEvents).toBe(1);
    expect(env.sink.events[5].droppedEvents).toBeUndefined();
  });

  it("limits each user's connections together, so that one user cannot use up the global rate", () => {
    const env = new EventLogTestEnvironment({ perUserRatePerSecond: 1, perUserBurst: 2, globalBurst: 3 });
    const sameUserConnections: ConnectionEventLog[] = [0, 1, 2].map(() =>
      env.log.forConnection(env.connectionDetails('user01'))
    );
    const otherUser: ConnectionEventLog = env.log.forConnection(env.connectionDetails('user02'));

    // SUT
    for (const connection of sameUserConnections) {
      connection.log('refused', { reason: 'one' });
      connection.log('refused', { reason: 'two' });
    }
    otherUser.log('protocol-violation', { reason: 'other user' });
    env.time += 1000;
    sameUserConnections[0].log('refused', { reason: 'after wait' });

    expect(env.sink.events.map(event => [event.userId, event.reason, event.droppedUserEvents])).toEqual([
      ['user01', 'one', undefined],
      ['user01', 'two', undefined],
      ['user02', 'other user', undefined],
      ['user01', 'after wait', 4]
    ]);
    expect(env.sink.events.every(event => event.droppedEvents === undefined)).toBe(true);
  });

  it('swallows a sink that throws or rejects, and reports failures to the console at most once a minute', async () => {
    const consoleError: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation(() => {});
    const throwing = new EventLogTestEnvironment({
      sink: {
        write: () => {
          throw new Error('sync failure');
        }
      }
    });
    const rejecting = new EventLogTestEnvironment({
      sink: { write: () => Promise.reject(new Error('async failure')) }
    });

    // SUT
    expect(() => throwing.connectionLog.log('refused', { reason: 'a' })).not.toThrow();
    expect(() => throwing.connectionLog.log('refused', { reason: 'b' })).not.toThrow();
    expect(() => rejecting.connectionLog.log('refused', { reason: 'a' })).not.toThrow();
    expect(() => rejecting.connectionLog.log('refused', { reason: 'b' })).not.toThrow();
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(consoleError).toHaveBeenCalledTimes(2);
    rejecting.time += 60_000;
    rejecting.connectionLog.log('refused', { reason: 'c' });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(consoleError).toHaveBeenCalledTimes(3);
    expect(consoleError.mock.calls[2][0]).toContain('1 earlier failures were not reported');
  });

  it('truncates long text', () => {
    const env = new EventLogTestEnvironment({
      userId: 'u'.repeat(1000),
      origin: 'o'.repeat(1000)
    });
    env.connectionLog.log('protocol-violation', {
      reason: 'r'.repeat(5000),
      docId: 'd'.repeat(5000),
      channel: 'c'.repeat(5000)
    });

    const event: GatewayEvent = env.sink.events[0];
    expect(event.reason.length).toBe(MAX_REASON_LENGTH);
    expect(event.reason.endsWith(TRUNCATION_MARK)).toBe(true);
    expect(event.userId.length).toBe(MAX_FIELD_LENGTH);
    expect(event.origin?.length).toBe(MAX_FIELD_LENGTH);
    expect(event.docId?.length).toBe(MAX_FIELD_LENGTH);
    expect(event.channel?.length).toBe(MAX_FIELD_LENGTH);
    expect(event.remoteAddress).toBe('10.0.0.1');
  });

  it('carries the src set after the handshake', () => {
    const env = new EventLogTestEnvironment();
    env.connectionLog.log('refused', { reason: 'before' });
    env.connectionLog.setSrc('src2');
    env.connectionLog.log('refused', { reason: 'after' });

    expect(env.sink.events.map(event => event.src)).toEqual(['src1', 'src2']);
  });

  it('mirrors stored events to ActivityLogger', () => {
    const activityLog: jest.SpyInstance = jest.spyOn(ActivityLogger.instance, 'log').mockImplementation(() => {});
    const env = new EventLogTestEnvironment({ perConnectionCap: 1 });
    env.connectionLog.log('withheld', { reason: 'no read right', queryId: 7 });
    env.connectionLog.log('withheld', { reason: 'over the cap' });

    expect(activityLog).toHaveBeenCalledTimes(2);
    expect(activityLog).toHaveBeenCalledWith(
      'gatewayEvent',
      expect.objectContaining({ kind: 'withheld', reason: 'no read right', queryId: 7, userId: 'user01' })
    );
    expect(activityLog).toHaveBeenCalledWith('gatewayEvent', expect.objectContaining({ kind: 'log-cap-reached' }));
  });

  it('refuses options that are not positive', () => {
    const sink = new MemoryGatewayEventSink();
    expect(() => new GatewayEventLog(sink, { perConnectionCap: 0 })).toThrow();
    expect(() => new GatewayEventLog(sink, { globalRatePerSecond: -1 })).toThrow();
    expect(() => new GatewayEventLog(sink, { globalBurst: Number.NaN })).toThrow();
    expect(() => new GatewayEventLog(sink, { perUserBurst: 0 })).toThrow();
  });
});

describe('truncate', () => {
  it('does not split a surrogate pair', () => {
    const text: string = 'a' + '😀'.repeat(10);
    const truncated: string = truncate(text, 5);
    // 'a', then one emoji (2 code units) fits before the mark; a second would be split, so it is dropped.
    expect(truncated).toBe('a😀' + TRUNCATION_MARK);
    expect(truncate('short', 5)).toBe('short');
  });
});

describe('MongoGatewayEventSink', () => {
  it('creates a 90-day TTL index on timestamp and inserts a copy of each event', async () => {
    const createIndex: jest.Mock = jest.fn(async () => 'timestamp_ttl');
    const insertOne: jest.Mock = jest.fn(async (document: Record<string, unknown>) => {
      document._id = 'generated';
    });
    const collectionNames: string[] = [];
    const db = {
      collection: (name: string) => {
        collectionNames.push(name);
        return { createIndex: createIndex, insertOne: insertOne };
      }
    } as unknown as Db;
    const sink = new MongoGatewayEventSink(db);
    const event: GatewayEvent = {
      timestamp: new Date(0),
      kind: 'closed',
      userId: 'user01',
      src: 'src1',
      remoteAddress: null,
      origin: null,
      reason: 'client closed'
    };

    // SUT
    await sink.createIndexes();
    await sink.write(event);

    expect(GATEWAY_EVENT_TTL_SECONDS).toBe(90 * 24 * 60 * 60);
    expect(createIndex).toHaveBeenCalledWith(
      { timestamp: 1 },
      expect.objectContaining({ expireAfterSeconds: GATEWAY_EVENT_TTL_SECONDS })
    );
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({ kind: 'closed' }), { ignoreUndefined: true });
    expect(event).not.toHaveProperty('_id');
    expect(collectionNames.every(name => name === GATEWAY_EVENTS_COLLECTION)).toBe(true);
  });
});

/** A GatewayEventLog on an in-memory sink with a clock the test moves, and one connection's log. */
class EventLogTestEnvironment {
  time: number = 1_000_000;
  readonly sink: MemoryGatewayEventSink = new MemoryGatewayEventSink();
  readonly log: GatewayEventLog;
  readonly connectionLog: ConnectionEventLog;

  constructor({
    perConnectionCap,
    globalRatePerSecond,
    globalBurst,
    perUserRatePerSecond,
    perUserBurst,
    sink,
    userId = 'user01',
    origin = 'https://example.org'
  }: {
    perConnectionCap?: number;
    globalRatePerSecond?: number;
    globalBurst?: number;
    perUserRatePerSecond?: number;
    perUserBurst?: number;
    sink?: GatewayEventSink;
    userId?: string;
    origin?: string;
  } = {}) {
    this.log = new GatewayEventLog(sink ?? this.sink, {
      perConnectionCap: perConnectionCap,
      globalRatePerSecond: globalRatePerSecond,
      globalBurst: globalBurst,
      perUserRatePerSecond: perUserRatePerSecond,
      perUserBurst: perUserBurst,
      now: () => this.time
    });
    this.connectionLog = this.log.forConnection({ ...this.connectionDetails(userId), origin: origin });
  }

  connectionDetails(userId: string): { userId: string; src: string; remoteAddress: string; origin: string } {
    return { userId: userId, src: 'src1', remoteAddress: '10.0.0.1', origin: 'https://example.org' };
  }
}
