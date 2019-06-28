import IndexedDBSource from '@orbit/indexeddb';

export class XForgeIndexedDBSource extends IndexedDBSource {
  private openDBPromise: Promise<IDBDatabase>;

  openDB(): Promise<IDBDatabase> {
    if (this.openDBPromise == null) {
      this.openDBPromise = super.openDB().then((db: IDBDatabase) => {
        // close on version change so we don't block the deletion of the database from a different tab/window
        db.onversionchange = () => this.closeDB();
        return db;
      });
    }
    return this.openDBPromise;
  }

  closeDB(): void {
    super.closeDB();
    this.openDBPromise = undefined;
  }

  async reopenDB(): Promise<IDBDatabase> {
    if (this.openDBPromise != null) {
      await this.openDBPromise;
    }
    return await super.reopenDB();
  }

  async deleteDB(): Promise<void> {
    if (this.openDBPromise != null) {
      await this.openDBPromise;
    }
    await super.deleteDB();
  }
}
