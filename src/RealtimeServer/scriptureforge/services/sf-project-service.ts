import { ProjectService } from '../../common/services/project-service';
import { SF_PROJECTS_COLLECTION, SFProject } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import { SF_PROJECT_MIGRATIONS } from './sf-project-migrations';

/**
 * This class manages SF project docs.
 */
export class SFProjectService extends ProjectService<SFProject> {
  readonly collection = SF_PROJECTS_COLLECTION;

  protected readonly projectAdminRole = SFProjectRole.ParatextAdministrator;

  constructor() {
    super(SF_PROJECT_MIGRATIONS);

    const immutableProps = [
      this.createPathTemplate(p => p.sourceParatextId!),
      this.createPathTemplate(p => p.sourceInputSystem!),
      this.createPathTemplate(p => p.sync!),
      this.createPathTemplate(p => p.inputSystem!),
      this.createPathTemplate(p => p.paratextId!),
      this.createPathTemplate(p => p.texts!),
      this.createPathTemplate(p => p.checkingEnabled),
      this.createPathTemplate(p => p.translationSuggestionsEnabled),
      this.createPathTemplate(p => p.usersSeeEachOthersResponses)
    ];
    this.immutableProps.push(...immutableProps);
  }
}
