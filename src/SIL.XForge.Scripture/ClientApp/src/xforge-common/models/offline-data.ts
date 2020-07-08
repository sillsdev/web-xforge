/**
 * This is the base class for all offline data that is a component of the data in a RealtimeDoc that cannot be
 * represented as a string.
 */
export abstract class OfflineData {
  abstract get collection(): string;

  constructor(
    public dataCollection: string,
    public id: string,
    public projectRef?: string,
    public realtimeDocRef?: string
  ) {}
}

export interface OfflineDataConstructor {
  readonly COLLECTION: string;

  new (dataCollection: string, id: string, projectRef?: string, realtimeDocRef?: string): OfflineData;
}
