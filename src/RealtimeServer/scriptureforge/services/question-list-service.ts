import { PathTemplate } from '../../common/path-template';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { QuestionList } from '../models/question-list';
import { SFProjectDomain } from '../models/sf-project-rights';
import { SFProjectDataService } from './sf-project-data-service';

/**
 * This class manages question list docs.
 */
export class QuestionListService extends SFProjectDataService<QuestionList> {
  readonly collection = 'questions';

  protected readonly immutableProps: PathTemplate[] = [
    this.createPathTemplate(ql => ql.questions[-1].answers![-1].syncUserRef!)
  ];

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      { projectDomain: SFProjectDomain.Questions, pathTemplate: this.createPathTemplate(ql => ql.questions[-1]) },
      {
        projectDomain: SFProjectDomain.Answers,
        pathTemplate: this.createPathTemplate(ql => ql.questions[-1].answers![-1])
      },
      {
        projectDomain: SFProjectDomain.Likes,
        pathTemplate: this.createPathTemplate(ql => ql.questions[-1].answers![-1].likes[-1])
      }
    ];
  }
}
