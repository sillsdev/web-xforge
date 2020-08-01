import {
  SF_PROJECT_USER_CONFIG_INDEX_PATHS,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';

export class SFProjectUserConfigDoc extends ProjectDataDoc<SFProjectUserConfig> {
  static readonly COLLECTION = SF_PROJECT_USER_CONFIGS_COLLECTION;
  static readonly INDEX_PATHS = SF_PROJECT_USER_CONFIG_INDEX_PATHS;
}
