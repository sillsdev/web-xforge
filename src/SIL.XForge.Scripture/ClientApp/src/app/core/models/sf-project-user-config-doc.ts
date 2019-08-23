import {
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';

export class SFProjectUserConfigDoc extends JsonRealtimeDoc<SFProjectUserConfig> {
  static readonly COLLECTION = SF_PROJECT_USER_CONFIGS_COLLECTION;

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(SFProjectUserConfigDoc.COLLECTION, adapter, store);
  }
}
