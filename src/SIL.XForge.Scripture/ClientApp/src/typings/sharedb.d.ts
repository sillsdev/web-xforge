declare module 'sharedb/lib/client' {
  import { EventEmitter } from 'events';
  import { Presence } from 'sharedb/lib/sharedb';

  export type OTTypeName = 'text' | 'json0' | 'rich-text';

  export interface OTType {
    name: OTTypeName;
    uri: string;

    create(initial: any): any;
    apply(snapshot: any, op: any): any;
    transform(op1: any, op2: any, side: 'left' | 'right'): any;
    compose(op1: any, op2: any): any;

    invert?(op: any): any;
    normalize?(op: any): any;
    transformCursor?(cursor: any, op: any, isOwnOp: boolean): any;
    serialize?(snapshot: any): any;
    deserialize?(data: any): any;
  }

  export interface Snapshot {
    v?: number;
    data: any;
    type: string;
  }

  export namespace types {
    const defaultType: OTType;
    const map: { [id: string]: OTType };
    function register(type: OTType): void;
  }

  export interface Error {
    code: number;
    message: string;
  }

  export type Callback = (err: Error) => void;

  export interface Connection {
    get(collection: string, id: string): Doc;
    createFetchQuery(
      collection: string,
      query: any,
      options?: any,
      callback?: (err: Error, results: Doc[]) => void
    ): Query;
    createSubscribeQuery(
      collection: string,
      query: any,
      options?: any,
      callback?: (err: Error, results: Doc[]) => void
    ): Query;
    fetchSnapshot(
      collectionName: string,
      documentID: string,
      version: number | null,
      callback?: (err: Error, snapshot: Snapshot) => void
    ): Snapshot;
    getPresence(channel: string): Presence;
    getDocPresence(collection: string, id: string): Presence;
    close(): void;
  }

  export const Connection: {
    prototype: Connection;
    new (socket: any): Connection;
  };

  export interface Doc extends EventEmitter {
    readonly type: OTType;
    readonly id: string;
    readonly data: any;
    readonly version: number;
    readonly collection: string;
    readonly connection: Connection;

    readonly subscribed: boolean;
    readonly wantSubscribe: boolean;

    readonly inflightOp: any;
    readonly pendingOps: any[];

    on(event: 'load' | 'no write pending' | 'nothing pending', callback: () => void): this;
    on(event: 'create', callback: (source: any) => void): this;
    on(event: 'op' | 'before op', callback: (ops: any, source: any) => void): this;
    on(event: 'del', callback: (data: any, source: any) => void): this;
    on(event: 'error', callback: Callback): this;
    on(event: string, handler: Function): this;

    off(event: 'load' | 'no write pending' | 'nothing pending', callback: () => void): this;
    off(event: 'create', callback: (source: any) => void): this;
    off(event: 'op' | 'before op', callback: (ops: any, source: any) => void): this;
    off(event: 'del', callback: (data: any, source: any) => void): this;
    off(event: 'error' | string, callback: Callback): this;
    off(event: string, handler: Function): this;

    addListener(event: 'load' | 'no write pending' | 'nothing pending', callback: () => void): this;
    addListener(event: 'create', callback: (source: any) => void): this;
    addListener(event: 'op' | 'before op', callback: (ops: any, source: any) => void): this;
    addListener(event: 'del', callback: (data: any, source: any) => void): this;
    addListener(event: 'error', callback: Callback): this;

    removeListener(event: 'load' | 'no write pending' | 'nothing pending', callback: () => void): this;
    removeListener(event: 'create', callback: (source: any) => void): this;
    removeListener(event: 'op' | 'before op', callback: (ops: any, source: any) => void): this;
    removeListener(event: 'del', callback: (data: any, source: any) => void): this;
    removeListener(event: 'error', callback: Callback): this;

    fetch(callback: Callback): void;
    subscribe(callback: Callback): void;
    unsubscribe(callback: Callback): void;
    ingestSnapshot(snapshot: Snapshot, callback: Callback): void;
    destroy(callback: Callback): void;
    create(data: any, type?: OTType | string, options?: any, callback?: Callback): void;
    submitOp(data: any, options?: any, callback?: Callback): void;
    del(options: any, callback: Callback): void;
    whenNothingPending(callback: Callback): void;
    hasWritePending(): boolean;
    flush(): void;
    previousSnapshot(): Snapshot;
  }

  export interface Query extends EventEmitter {
    readonly action: 'qs' | 'qf';
    readonly collection: string;
    readonly connection: Connection;
    readonly query: any;
    readonly ready: boolean;
    readonly results: Doc[];
    readonly extra: any;

    on(event: 'ready' | 'extra', callback: () => void): this;
    on(event: 'error', callback: Callback): this;
    on(event: 'changed', callback: (results: Doc[]) => void): this;
    on(event: 'insert' | 'remove', callback: (docs: Doc[], atIndex: number) => void): this;
    on(event: 'move', callback: (docs: Doc[], from: number, to: number) => void): this;

    off(event: 'ready' | 'extra', callback: () => void): this;
    off(event: 'error', callback: Callback): this;
    off(event: 'changed', callback: (results: Doc[]) => void): this;
    off(event: 'insert' | 'remove', callback: (docs: Doc[], atIndex: number) => void): this;
    off(event: 'move', callback: (docs: Doc[], from: number, to: number) => void): this;

    addListener(event: 'ready' | 'extra', callback: () => void): this;
    addListener(event: 'error', callback: Callback): this;
    addListener(event: 'changed', callback: (results: Doc[]) => void): this;
    addListener(event: 'insert' | 'remove', callback: (docs: Doc[], atIndex: number) => void): this;
    addListener(event: 'move', callback: (docs: Doc[], from: number, to: number) => void): this;

    removeListener(event: 'ready' | 'extra', callback: () => void): this;
    removeListener(event: 'error', callback: Callback): this;
    removeListener(event: 'changed', callback: (results: Doc[]) => void): this;
    removeListener(event: 'insert' | 'remove', callback: (docs: Doc[], atIndex: number) => void): this;
    removeListener(event: 'move', callback: (docs: Doc[], from: number, to: number) => void): this;

    destroy(): void;
  }
}
