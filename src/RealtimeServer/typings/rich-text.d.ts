declare module 'rich-text' {
  export const type: { name: string };

  export interface StringMap {
    [key: string]: any;
  }

  export interface DeltaOperation {
    insert?: any;
    delete?: number;
    retain?: number;
    attributes?: StringMap;
  }

  export class Delta {
    ops?: DeltaOperation[];

    constructor(ops?: DeltaOperation[] | { ops: DeltaOperation[] });

    retain(length: number, attributes?: StringMap): Delta;
    delete(length: number): Delta;
    filter(predicate: (op: DeltaOperation) => boolean): DeltaOperation[];
    forEach(predicate: (op: DeltaOperation) => void): void;
    insert(text: any, attributes?: StringMap): Delta;
    map<T>(predicate: (op: DeltaOperation) => T): T[];
    partition(predicate: (op: DeltaOperation) => boolean): [DeltaOperation[], DeltaOperation[]];
    reduce<T>(predicate: (acc: T, curr: DeltaOperation, idx: number, arr: DeltaOperation[]) => T, initial: T): T;
    chop(): Delta;
    length(): number;
    slice(start?: number, end?: number): Delta;
    compose(other: Delta): Delta;
    concat(other: Delta): Delta;
    diff(other: Delta, index?: number): Delta;
    eachLine(predicate: (line: Delta, attributes: StringMap, idx: number) => any, newline?: string): Delta;
    transform(index: number): number;
    transform(other: Delta, priority: boolean): Delta;
    transformPosition(index: number): number;
  }
}
