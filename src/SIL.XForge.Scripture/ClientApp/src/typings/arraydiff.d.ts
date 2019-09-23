declare module 'arraydiff' {
  export interface InsertDiff<T = any> {
    type: 'insert';
    index: number;
    values: T[];
  }

  export interface RemoveDiff {
    type: 'remove';
    index: number;
    howMany: number;
  }

  export interface MoveDiff {
    type: 'move';
    from: number;
    to: number;
    howMany: number;
  }

  export type Diff<T = any> = InsertDiff<T> | RemoveDiff | MoveDiff;

  export default function arrayDiff<T = any>(before: T[], after: T[], equalFn?: (a: T, b: T) => boolean): Diff<T>[];
}
