import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { BiblicalTerm, BIBLICAL_TERM_COLLECTION, BIBLICAL_TERM_INDEX_PATHS } from '../models/biblical-term';
import { SFProjectDomain } from '../models/sf-project-rights';
import { BIBLICAL_TERM_MIGRATIONS } from './biblical-term-migrations';
import { SFProjectDataService } from './sf-project-data-service';

export class BiblicalTermService extends SFProjectDataService<BiblicalTerm> {
  readonly collection = BIBLICAL_TERM_COLLECTION;

  protected readonly indexPaths = BIBLICAL_TERM_INDEX_PATHS;
  protected readonly listenForUpdates = true;

  constructor() {
    super(BIBLICAL_TERM_MIGRATIONS);

    // Only renderings and description are user updatable
    const immutableProps = [
      this.pathTemplate(t => t.projectRef),
      this.pathTemplate(t => t.dataId),
      this.pathTemplate(t => t.termId),
      this.pathTemplate(t => t.transliteration),
      this.pathTemplate(t => t.language),
      this.pathTemplate(t => t.links),
      this.pathTemplate(t => t.references),
      this.pathTemplate(t => t.definitions)
    ];
    this.immutableProps.push(...immutableProps);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      {
        projectDomain: SFProjectDomain.BiblicalTerms,
        pathTemplate: this.pathTemplate()
      }
    ];
  }
}
