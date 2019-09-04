import {
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';

export function getSFProjectUserConfigDocId(projectId: string, userId: string): string {
  return `${projectId}:${userId}`;
}

export class SFProjectUserConfigDoc extends JsonRealtimeDoc<SFProjectUserConfig> {
  static readonly COLLECTION = SF_PROJECT_USER_CONFIGS_COLLECTION;
}
