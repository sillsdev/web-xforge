import { Doc, Op, RawOp } from 'sharedb/lib/client';

export interface MigrationConstructor {
  readonly VERSION: number;

  new (): Migration;
}

/**
 * This interface represents a data migration for a schema change. A migration can only be applied to one collection.
 */
export interface Migration {
  /**
   * Migrates the specified doc to a new schema version. Any data migration changes to the doc MUST be submitted with
   * the "submitMigrationOp" method of DocMigration.
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

export abstract class DocMigration implements Migration {
  abstract migrateDoc(doc: Doc): Promise<void>;

  migrateOp(_op: RawOp): void {
    // do nothing
  }

  /**
   * Submits ops to the doc, marked as coming from this migration. The version comes from the migration class itself,
   * so a migration cannot mark its ops with another migration's version.
   */
  protected submitMigrationOp(doc: Doc, ops: Op[]): Promise<void> {
    if (ops.length === 0) {
      return Promise.resolve();
    }
    const version: number = (this.constructor as MigrationConstructor).VERSION;
    return new Promise<void>((resolve, reject) => {
      const op: RawOp = { op: ops, mv: version };
      doc._submit(op, undefined, err => {
        if (err != null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * Verifies that the specified migrations are have version numbers monotonically increasing by 1 and that the class
 * names include the version number. Throws an error if any of the migrations violate this rule. Otherwise, returns the
 * migrations.
 */
export function monotonicallyIncreasingMigrationList(migrations: MigrationConstructor[]): MigrationConstructor[] {
  for (const [index, migration] of migrations.entries()) {
    const expectedVersion = index + 1;
    if (migration.VERSION !== expectedVersion) {
      throw new Error(`Migration version mismatch: expected ${expectedVersion}, got ${migration.VERSION}`);
    }
    if (!migration.name.includes(migration.VERSION.toString())) {
      throw new Error(`Migration class name must include the version number: ${migration.name}`);
    }
  }
  return migrations;
}
