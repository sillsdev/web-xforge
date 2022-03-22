// Type definitions for utils
//
// Copyright 2021 SIL International. MIT License.

import { Snapshot } from 'sharedb';
import { Connection } from 'sharedb/lib/client';

export function visualizeOps(ops: any, showAttributes: boolean): void;
export function fetchSnapshotByVersion(
  conn: Connection,
  collection: string,
  docId: string,
  version: number
): Promise<Snapshot>;
export function colored(colorCode: number, textToColor: string): string;
export type ConnectionSettings = { dbLocation: string; wsConnectionString: string };
export var databaseConfigs: Map<string, ConnectionSettings>;
export var devConfig: { dbLocation: string; wsConnectionString: string };
export function useColor(ifUseColor: boolean): void;
export var colors: any;
