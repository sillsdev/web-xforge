import { ProjectService } from '../../common/services/project-service';
import { SFProject } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';

/**
 * This class manages SF project docs.
 */
export class SFProjectService extends ProjectService<SFProject> {
  readonly collection = 'sf_projects';

  protected readonly projectAdminRole = SFProjectRole.ParatextAdministrator;

  constructor() {
    super();

    const immutableProps = [
      this.createPathTemplate(p => p.sourceParatextId!),
      this.createPathTemplate(p => p.sourceInputSystem!),
      this.createPathTemplate(p => p.sync!),
      this.createPathTemplate(p => p.inputSystem!),
      this.createPathTemplate(p => p.paratextId!),
      this.createPathTemplate(p => p.texts!),
      this.createPathTemplate(p => p.checkingEnabled),
      this.createPathTemplate(p => p.translateEnabled),
      this.createPathTemplate(p => p.usersSeeEachOthersResponses)
    ];
    this.immutableProps.push(...immutableProps);
  }
}
