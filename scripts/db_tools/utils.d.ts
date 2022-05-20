// Type definitions for utils

import { Snapshot } from 'sharedb';
import { Connection, Doc } from 'sharedb/lib/client';
import WebSocket from 'ws';

export function visualizeOps(ops: any, showAttributes: boolean): void;
export function fetchSnapshotByVersion(
  conn: Connection,
  collection: string,
  docId: string,
  version: number
): Promise<Snapshot>;
export function fetchDoc(doc: Doc): Promise<void>;
export function submitDocOp(doc: Doc, op: any): Promise<void>;
export function colored(colorCode: number, textToColor: string): string;
export type ConnectionSettings = { dbLocation: string; wsConnectionString: string; origin: string };
export function createWS(connectionConfig: ConnectionSettings): WebSocket;
export var databaseConfigs: Map<string, ConnectionSettings>;
export var devConfig: { dbLocation: string; wsConnectionString: string };
export function useColor(ifUseColor: boolean): void;
export var colors: any;
