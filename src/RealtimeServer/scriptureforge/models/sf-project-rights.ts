import { ProjectRights } from '../../common/models/project-rights';
import { SF_PROJECT_RIGHTS_MAPPING } from './sf-project-rights-mapping';

export { SFProjectDomain } from './sf-project-rights-mapping';

export class SFProjectRights extends ProjectRights {
  constructor() {
    super();
    for (const [projectRole, projectRights] of SF_PROJECT_RIGHTS_MAPPING) {
      this.addRights(projectRole, projectRights);
    }
  }
}

export const SF_PROJECT_RIGHTS = new SFProjectRights();
