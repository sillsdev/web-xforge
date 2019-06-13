import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { SFProject } from './sfproject';
import { SFProjectData } from './sfproject-data';

export class SFProjectDataDoc extends JsonRealtimeDoc<SFProjectData> {
  static readonly TYPE = SFProject.TYPE;

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(SFProjectDataDoc.TYPE, adapter, store);
  }
}
