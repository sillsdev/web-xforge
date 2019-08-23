import { Doc, RawOp } from 'sharedb/lib/client';

export interface MigrationConstructor {
  readonly VERSION: number;

  new (): Migration;
}

/**
 * This interface represents a data migration for a schema change. A migration can only be applied to one collection.
 */
export interface Migration {
  /**
   * Migrates the specified doc to a new schema version. The "submitMigrationOp" function MUST be used to submit any
   * data migration changes to the doc.
   *
   * @param {Doc} doc The doc to migrate.
   */
  migrateDoc(doc: Doc): Promise<void>;

  /**
   * Migrates the specified op to a new schema version.
   *
   * @param {RawOp} op The op to migrate.
   */
  migrateOp(op: RawOp): void;
}
