import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { SFProjectDomain } from '../models/sf-project-rights-mapping';
import {
  SF_PROJECT_USER_CONFIG_INDEX_PATHS,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from '../models/sf-project-user-config';
import { SFProjectDataService } from './sf-project-data-service';
import { SF_PROJECT_USER_CONFIG_MIGRATIONS } from './sf-project-user-config-migrations';

/**
 * This class manages project-user configuration docs.
 */
export class SFProjectUserConfigService extends SFProjectDataService<SFProjectUserConfig> {
  readonly collection = SF_PROJECT_USER_CONFIGS_COLLECTION;

  protected readonly indexPaths = SF_PROJECT_USER_CONFIG_INDEX_PATHS;

  constructor() {
    super(SF_PROJECT_USER_CONFIG_MIGRATIONS);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [{ projectDomain: SFProjectDomain.ProjectUserConfigs, pathTemplate: this.pathTemplate() }];
  }
}
