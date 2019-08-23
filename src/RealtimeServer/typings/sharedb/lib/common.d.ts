export type Path = ReadonlyArray<string | number | symbol>;
export interface Snapshot {
  id: string;
  v: number;
  type: string | null;
  data?: any;
  m: SnapshotMeta | null;
}

export interface SnapshotMeta {
  ctime: number;
  mtime: number;
  // Users can use server middleware to add additional metadata to snapshots.
  [key: string]: any;
}

export interface AddNumOp {
  p: Path;
  na: number;
}

export interface ListInsertOp {
  p: Path;
  li: any;
}
export interface ListDeleteOp {
  p: Path;
  ld: any;
}
export interface ListReplaceOp {
  p: Path;
  li: any;
  ld: any;
}
export interface ListMoveOp {
  p: Path;
  lm: any;
}

export interface ObjectInsertOp {
  p: Path;
  oi: any;
}
export interface ObjectDeleteOp {
  p: Path;
  od: any;
}
export interface ObjectReplaceOp {
  p: Path;
  oi: any;
  od: any;
}

export interface StringInsertOp {
  p: Path;
  si: string;
}
export interface StringDeleteOp {
  p: Path;
  sd: string;
}

export interface SubtypeOp {
  p: Path;
  t: string;
  o: any;
}

export type Op =
  | AddNumOp
  | ListInsertOp
  | ListDeleteOp
  | ListReplaceOp
  | ListMoveOp
  | ObjectInsertOp
  | ObjectDeleteOp
  | ObjectReplaceOp
  | StringInsertOp
  | StringDeleteOp
  | SubtypeOp;

export interface RawOp {
  src?: string;
  seq?: number;
  v?: number;
  op?: Op[];
  m?: any;
  c?: string;
  d?: string;
  create?: any;
  del?: true;

  [key: string]: any;
}

export type RequestAction = 'qf' | 'qs' | 'qu' | 'bf' | 'bs' | 'bu' | 'f' | 's' | 'u' | 'op' | 'nf' | 'nt';

export interface ClientRequest {
  /** Short name of the request's action */
  a: RequestAction;

  [propertyName: string]: any;
}
