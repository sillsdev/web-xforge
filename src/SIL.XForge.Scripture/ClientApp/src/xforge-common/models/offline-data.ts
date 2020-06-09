/**
 * This is the base class for all offline data that is a component of the data in a RealtimeDoc that cannot be
 * represented as a string.
 */
export abstract class OfflineData {
  abstract get collection(): string;

  constructor(public dataId: string, public projectRef: string) {}
}

export interface OfflineDataConstructor {
  readonly COLLECTION: string;

  new (dataId: string, projectRef: string): OfflineData;
}
