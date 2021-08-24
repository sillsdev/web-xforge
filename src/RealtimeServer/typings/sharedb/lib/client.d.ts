/* eslint-disable import/no-unresolved */
import { EventEmitter } from 'events';
import WS from 'ws';
import { ClientRequest, Op, RawOp, Snapshot } from './common';

export {
  Op,
  AddNumOp,
  ListMoveOp,
  ListInsertOp,
  ListDeleteOp,
  ListReplaceOp,
  StringInsertOp,
  StringDeleteOp,
  ObjectInsertOp,
  ObjectDeleteOp,
  ObjectReplaceOp,
  SubtypeOp,
  RawOp,
  Path
} from './common';

export class Connection {
  constructor(ws: WebSocket | WS);
  get(collectionName: string, documentID: string): Doc;
  createFetchQuery(
    collectionName: string,
    query: any,
    options: { results?: Query[] },
    callback: (err: Error, results: any) => any
  ): Query;
  createSubscribeQuery(
    collectionName: string,
    query: any,
    options: { results?: Query[] },
    callback: (err: Error, results: any) => any
  ): Query;
  fetchSnapshot(
    collectionName: string,
    documentID: string,
    version: number | null,
    callback: (err: Error, snapshot: Snapshot) => void
  ): void;
  fetchSnapshotByTimestamp(
    collectionName: string,
    documentID: string,
    timestamp: number | null,
    callback: (err: Error, snapshot: Snapshot) => void
  ): void;

  sendOp(doc: Doc, op: RawOp): void;
  _addDoc(doc: Doc): void;
  send(message: ClientRequest): void;
}

export type OTType = 'ot-text' | 'ot-json0' | 'ot-text-tp2' | 'rich-text';
export interface Error {
  code: number;
  message: string;
}

export interface ShareDBSourceOptions {
  source?: boolean;
}

export class Doc extends EventEmitter {
  type: any;
  id: string;
  data: any;
  version: number;
  collection: string;
  fetch: (callback: (err: Error) => void) => void;
  subscribe: (callback: (err: Error) => void) => void;

  on(event: 'load' | 'no write pending' | 'nothing pending', callback: () => void): this;
  on(event: 'create', callback: (source: boolean) => void): this;
  on(event: 'op' | 'before op', callback: (ops: Op[], source: boolean) => void): this;
  on(event: 'del', callback: (data: any, source: boolean) => void): this;
  on(event: 'error', callback: (err: Error) => void): this;

  addListener(event: 'load' | 'no write pending' | 'nothing pending', callback: () => void): this;
  addListener(event: 'create', callback: (source: boolean) => void): this;
  addListener(event: 'op' | 'before op', callback: (ops: Op[], source: boolean) => void): this;
  addListener(event: 'del', callback: (data: any, source: boolean) => void): this;
  addListener(event: 'error', callback: (err: Error) => void): this;

  ingestSnapshot(snapshot: Snapshot, callback: (err: Error) => void): void;
  destroy(): void;
  create(data: any, callback?: (err: Error) => void): void;
  create(data: any, type?: OTType, callback?: (err: Error) => void): void;
  create(data: any, type?: OTType, options?: ShareDBSourceOptions, callback?: (err: Error) => void): void;
  submitOp(data: ReadonlyArray<Op>, options?: ShareDBSourceOptions, callback?: (err: Error) => void): void;
  del(options: ShareDBSourceOptions, callback: (err: Error) => void): void;
  whenNothingPending(callback: (err: Error) => void): void;

  _submit(op: RawOp, source: any, callback: (err: Error) => void): void;
}

export type QueryEvent = 'ready' | 'error' | 'changed' | 'insert' | 'move' | 'remove' | 'extra';
export class Query extends EventEmitter {
  ready: boolean;
  results: Doc[];
  extra: any;
  on(event: QueryEvent, callback: (...args: any[]) => any): this;
  addListener(event: QueryEvent, callback: (...args: any[]) => any): this;
  removeListener(event: QueryEvent, listener: (...args: any[]) => any): this;
  destroy(): void;
}
