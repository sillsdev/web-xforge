import { SFProjectUserConfig } from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';

export class SFProjectUserConfigDoc extends JsonRealtimeDoc<SFProjectUserConfig> {
  static readonly TYPE = 'sf-project-user-configs';

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(SFProjectUserConfigDoc.TYPE, adapter, store);
  }
}
