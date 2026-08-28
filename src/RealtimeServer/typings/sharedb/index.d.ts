// Type definitions for sharedb 5.1.1
// Project: https://github.com/share/sharedb
// Definitions by: Steve Oney <https://github.com/soney>
//                 Eric Hwang <https://github.com/ericyhwang>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.1

import { ConnectSession } from '../../common/connect-session';
import { Connection, Query } from './lib/client';
import * as common from './lib/common';

interface PubSubOptions {
  prefix?: string;
}
interface Stream {
  id: string;
}
type ErrorFunction = (error: any) => void;

export = ShareDB;

declare class ShareDB {
  static types: {
    register: (type: { name?: string; uri?: string; [key: string]: any }) => void;
    map: { [key: string]: any };
  };
  static logger: {
    setMethods: (override: { info?: ErrorFunction; warn?: ErrorFunction; error?: ErrorFunction }) => void;
  };
  constructor(options?: {
    db?: any;
    pubsub?: ShareDB.PubSub;
    milestoneDb?: ShareDB.MilestoneDB;
    presence?: boolean;
    disableDocAction?: boolean;
    disableSpaceDelimitedActions?: boolean;
    doNotForwardSendPresenceErrorsToClient?: boolean;
  });
  connect(connection?: Connection, req?: any): Connection;
  /**
   * Registers a projection that can be used from clients just like a normal collection.
   *
   * @param name name of the projection
   * @param collection name of the backing collection
   * @param fields field whitelist for the projection
   */
  addProjection(name: string, collection: string, fields: ShareDB.ProjectionFields): void;
  listen(stream: any, req?: any): void;
  close(callback?: (err?: Error) => any): void;
  /**
   * Reports how long a piece of work took. `action` names it: eg 'queryEmitter.poll'.
   *
   * Monitoring the 'timing' event can give us additional insight into the activity of ShareDB that might otherwise be
   * hidden, such as when a subscription is being re-polled (those polls reach the database directly and no middleware
   * runs for them).
   */
  on(event: 'timing', listener: (action: string, durationMs: number, context: ShareDB.TimingContext) => void): this;
  /**
   * Rebuilds a document by replaying operations onto a milestone snapshot. ShareDB calls this when a document is asked
   * for at a past version or timestamp rather than at its current version. Declared here so that it can be overridden;
   * it is not part of ShareDB's public API.
   *
   * startingSnapshot comes from the MilestoneDB, and is undefined when there is no milestone to start from. That is a
   * convention every implementation follows rather than something ShareDB enforces.
   */
  _buildSnapshotFromOps(
    id: string,
    startingSnapshot: common.Snapshot | undefined,
    ops: common.Op[],
    callback: (err: Error, snapshot: common.Snapshot) => void
  ): void;
  /**
   * Registers a server middleware function.
   *
   * @param action name of an action from https://github.com/share/sharedb#middlewares
   * @param fn listener invoked when the specified action occurs
   */
  use<A extends keyof ShareDB.middleware.ActionContextMap>(
    action: A,
    fn: (context: ShareDB.middleware.ActionContextMap[A], callback: (err?: any) => void) => void
  ): void;

  trigger<A extends keyof ShareDB.middleware.ActionContextMap>(
    action: A,
    agent: ShareDB.Agent,
    request: ShareDB.middleware.ActionContextMap[A],
    callback: (err?: any) => void
  ): void;
}

declare namespace ShareDB {
  abstract class DB {
    projectsSnapshots: boolean;
    disableSubscribe: boolean;
    close(callback?: () => void): void;
    commit(
      collection: string,
      id: string,
      op: Op,
      snapshot: any,
      options: any,
      callback: (...args: any[]) => any
    ): void;
    getSnapshot(collection: string, id: string, fields: any, options: any, callback: (...args: any[]) => any): void;
    getSnapshotBulk(
      collection: string,
      ids: string,
      fields: any,
      options: any,
      callback: (...args: any[]) => any
    ): void;
    getOps(
      collection: string,
      id: string,
      from: number,
      to: number | null,
      options: any,
      callback: (...args: any[]) => any
    ): void;
    getOpsToSnapshot(
      collection: string,
      id: string,
      from: number,
      snapshot: number,
      options: any,
      callback: (...args: any[]) => any
    ): void;
    getOpsBulk(collection: string, fromMap: any, toMap: any, options: any, callback: (...args: any[]) => any): void;
    getCommittedOpVersion(
      collection: string,
      id: string,
      snapshot: any,
      op: any,
      options: any,
      callback: (...args: any[]) => any
    ): void;
    query(collection: string, query: Query, fields: any, options: any, callback: (...args: any[]) => any): void;
    queryPoll(collection: string, query: Query, options: any, callback: (...args: any[]) => any): void;
    queryPollDoc(collection: string, id: string, query: Query, options: any, callback: (...args: any[]) => any): void;
    canPollDoc(): boolean;
    skipPoll(): boolean;
  }

  class MemoryDB extends DB {}

  /**
   * The third value a 'timing' event carries, being whichever object was doing the work: a QueryEmitter for the
   * queryEmitter.* actions (which pass their own `this`), a request object for the others.
   *
   * Both name the collection, and both carry the agent when one asked for the work. A poll set off by another client's
   * change carries the agent that subscribed, not the one that caused the change.
   */
  interface TimingContext {
    collection?: string;
    agent?: Agent;
  }

  class Agent {
    constructor(backend: ShareDB, stream: any);

    /** Identifies this connection. ShareDB gives every agent one when it is created. */
    clientId: string;
    /** Map of collection -> document id -> stream. */
    subscribedDocs: Record<string, Record<string, unknown>>;
    /** Map of query id -> emitter. */
    subscribedQueries: Record<string, { query: unknown | undefined; streams: unknown }>;
    /** Map of channel -> stream. */
    subscribedPresences: Record<string, unknown>;
    /**
     * This property is not a ShareDB property. This application attaches it in RealtimeServer.setConnectSession, once a
     * connection's claims are known, and so it is absent on an agent whose connect middleware has not finished.
     */
    connectSession?: ConnectSession;

    close(err: any): void;
    _open(): void;
    _handleMessage(request: any, callback: (...args: any[]) => any): void;
    _checkRequest(request: any): string | undefined;
    _submit(collection: string, id: string, op: any, callback: (...args: any[]) => any): void;
    _src(): string;
  }

  abstract class PubSub {
    private static shallowCopy(obj: any): any;
    protected prefix?: string;
    protected nextStreamId: number;
    protected streamsCount: number;
    protected streams: {
      [channel: string]: Stream;
    };
    protected subscribed: {
      [channel: string]: boolean;
    };
    protected constructor(options?: PubSubOptions);
    close(callback?: (err: Error | null) => void): void;
    publish(channels: string[], data: { [k: string]: any }, callback: (err: Error | null) => void): void;
    subscribe(channel: string, callback: (err: Error | null, stream?: Stream) => void): void;
    protected abstract _subscribe(channel: string, callback: (err: Error | null) => void): void;
    protected abstract _unsubscribe(channel: string, callback: (err: Error | null) => void): void;
    protected abstract _publish(channels: string[], data: any, callback: (err: Error | null) => void): void;
    protected _emit(channel: string, data: { [k: string]: any }): void;
    private _createStream(channel): void;
    private _removeStream(channel, stream): void;
  }

  abstract class MilestoneDB {
    close(callback: (err: Error | null) => void): void;
    getMilestoneSnapshot(collection: string, id: string, version: number, callback: (err: Error | null) => void): void;
    saveMilestoneSnapshot(collection: string, snapshot: Snapshot, callback: (err: Error | null) => void): void;
    getMilestoneSnapshotAtOrBeforeTime(
      collection: string,
      id: string,
      timestamp: number,
      callback: (err: Error | null) => void
    ): void;
    getMilestoneSnapshotAtOrAfterTime(
      collection: string,
      id: string,
      timestamp: number,
      callback: (err: Error | null) => void
    ): void;
  }

  type Op = common.Op;
  type AddNumOp = common.AddNumOp;
  type ListMoveOp = common.ListMoveOp;
  type ListInsertOp = common.ListInsertOp;
  type ListDeleteOp = common.ListDeleteOp;
  type ListReplaceOp = common.ListReplaceOp;
  type StringInsertOp = common.StringInsertOp;
  type StringDeleteOp = common.StringDeleteOp;
  type ObjectInsertOp = common.ObjectInsertOp;
  type ObjectDeleteOp = common.ObjectDeleteOp;
  type ObjectReplaceOp = common.ObjectReplaceOp;
  type SubtypeOp = common.SubtypeOp;
  type RawOp = common.RawOp;
  type Path = common.Path;
  type Snapshot = common.Snapshot;

  interface Projection {
    target: string;
    fields: ProjectionFields;
  }

  interface ProjectionFields {
    [propertyName: string]: true;
  }

  namespace ot {
    function transform(type: string, op: common.RawOp, appliedOp: common.RawOp): any;
  }

  namespace middleware {
    interface ActionContextMap {
      afterWrite: SubmitContext;
      apply: ApplyContext;
      commit: CommitContext;
      connect: ConnectContext;
      doc: DocContext; // Deprecated, use 'readSnapshots' instead.
      op: OpContext;
      query: QueryContext;
      readSnapshots: ReadSnapshotsContext;
      receive: ReceiveContext;
      reply: ReplyContext;
      submit: SubmitContext;
    }

    interface BaseContext {
      action?: keyof ActionContextMap;
      // AI gave a lot of push-back on agent being optional. This may benefit from further investigation.
      agent?: Agent;
      backend?: ShareDB;
    }

    interface ApplyContext extends BaseContext, SubmitRequest {}

    interface CommitContext extends BaseContext, SubmitRequest {}

    interface ConnectContext extends BaseContext {
      stream: any;
      req: any; // Property always exists, value may be undefined
    }

    interface DocContext extends BaseContext {
      collection: string;
      id: string;
      snapshot: common.Snapshot;
    }

    interface OpContext extends BaseContext {
      collection: string;
      id: string;
      op: common.Op;
    }

    interface QueryContext extends BaseContext {
      index: string;
      collection: string;
      projection: Projection | undefined;
      fields: ProjectionFields | undefined;
      channel: string;
      query: any;
      options?: { [key: string]: any };
      db: DB | null;
      snapshotProjection: Projection | null;
    }

    interface ReadSnapshotsContext extends BaseContext {
      collection: string;
      snapshots: common.Snapshot[];
      snapshotType: SnapshotType;
    }

    interface ReceiveContext extends BaseContext {
      data: { [key: string]: any }; // ClientRequest, but before any validation
    }

    interface ReplyContext extends BaseContext {
      request: common.ClientRequest;
      reply: { [key: string]: any };
    }

    type SnapshotType = 'current' | 'byVersion' | 'byTimestamp';

    interface SubmitContext extends BaseContext, SubmitRequest {}
  }
}

interface SubmitRequest {
  index: string;
  projection: ShareDB.Projection | undefined;
  collection: string;
  extra: any | null;
  id: string;
  op: common.RawOp;
  options: any;
  start: number;

  saveMilestoneSnapshot: boolean | null;
  suppressPublish: boolean | null;
  maxRetries: number | null;
  retries: number;

  snapshot: common.Snapshot | null;
  ops: common.RawOp[];
  channels: string[] | null;
}
