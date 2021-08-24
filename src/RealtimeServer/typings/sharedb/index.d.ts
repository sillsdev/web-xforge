// Type definitions for sharedb 1.0
// Project: https://github.com/share/sharedb
// Definitions by: Steve Oney <https://github.com/soney>
//                 Eric Hwang <https://github.com/ericyhwang>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.1

// eslint-disable-next-line import/no-unresolved
import { Connection, Query } from './lib/client';
// eslint-disable-next-line import/no-unresolved
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
    disableDocAction?: boolean;
    disableSpaceDelimitedActions?: boolean;
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
      to: number,
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

  class Agent {
    constructor(backend: ShareDB, stream: any);

    protected clientId: string;

    close(err: any): void;
    _open(): void;
    _handleMessage(request: any, callback: (...args: any[]) => any): void;
    _checkRequest(request: any): string | undefined;
    _submit(collection: string, id: string, op: any, callback: (...args: any[]) => any): void;
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
      agent?: any;
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
