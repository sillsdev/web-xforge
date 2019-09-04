import { ProjectData } from '../../common/models/project-data';
import { ProjectDataService } from '../../common/services/project-data-service';
import { SF_PROJECT_RIGHTS } from '../models/sf-project-rights';

/**
 * This is the abstract base class for all SF doc services that manage project data.
 */
export abstract class SFProjectDataService<T extends ProjectData> extends ProjectDataService<T> {
  protected readonly projectRights = SF_PROJECT_RIGHTS;
}
