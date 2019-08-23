import { PathTemplate } from '../../common/path-template';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { CommentList } from '../models/comment-list';
import { SFProjectDomain } from '../models/sf-project-rights';
import { COMMENT_LIST_MIGRATIONS } from './comment-list-migrations';
import { SFProjectDataService } from './sf-project-data-service';

/**
 * This class manages comment list docs.
 */
export class CommentListService extends SFProjectDataService<CommentList> {
  readonly collection = 'comments';

  protected readonly immutableProps: PathTemplate[] = [this.createPathTemplate(cl => cl.comments[-1].syncUserRef!)];

  constructor() {
    super(COMMENT_LIST_MIGRATIONS);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [{ projectDomain: SFProjectDomain.Comments, pathTemplate: this.createPathTemplate(cl => cl.comments[-1]) }];
  }
}
