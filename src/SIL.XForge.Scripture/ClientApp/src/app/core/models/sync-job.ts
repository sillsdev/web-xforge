import { SyncJobBase } from './sfdomain-model.generated';

export enum SyncJobState {
  PENDING = 'PENDING',
  SYNCING = 'SYNCING',
  IDLE = 'IDLE',
  ERROR = 'ERROR',
  CANCELED = 'CANCELED'
}

export class SyncJob extends SyncJobBase {
  state?: SyncJobState;

  constructor(init?: Partial<SyncJob>) {
    super(init);
  }

  get isActive(): boolean {
    return this.state === SyncJobState.PENDING || this.state === SyncJobState.SYNCING;
  }
}

export { SyncJobRef } from './sfdomain-model.generated';
