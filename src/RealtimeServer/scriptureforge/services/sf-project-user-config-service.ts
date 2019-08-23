import { PathTemplate } from '../../common/path-template';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { SFProjectDomain } from '../models/sf-project-rights';
import { SFProjectUserConfig } from '../models/sf-project-user-config';
import { SFProjectDataService } from './sf-project-data-service';

/**
 * This class manages project-user configuration docs.
 */
export class SFProjectUserConfigService extends SFProjectDataService<SFProjectUserConfig> {
  readonly collection = 'sf_project_user_configs';

  protected setupDomains(): ProjectDomainConfig[] {
    return [{ projectDomain: SFProjectDomain.ProjectUserConfigs, pathTemplate: new PathTemplate() }];
  }
}
