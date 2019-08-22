import { Doc, RawOp } from 'sharedb/lib/client';

export interface MigrationConstructor {
  readonly VERSION: number;

  new (): Migration;
}

/**
 * This interface represents a data migration for a particular collection.
 */
export interface Migration {
  migrateDoc(doc: Doc): Promise<void>;
  migrateOp(op: RawOp): void;
}
