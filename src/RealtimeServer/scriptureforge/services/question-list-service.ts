import { ANY_INDEX, PathTemplate } from '../../common/path-template';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { QuestionList, QUESTIONS_COLLECTION } from '../models/question-list';
import { SFProjectDomain } from '../models/sf-project-rights';
import { QUESTION_LIST_MIGRATIONS } from './question-list-migrations';
import { SFProjectDataService } from './sf-project-data-service';

/**
 * This class manages question list docs.
 */
export class QuestionListService extends SFProjectDataService<QuestionList> {
  readonly collection = QUESTIONS_COLLECTION;

  protected readonly immutableProps: PathTemplate[] = [
    this.createPathTemplate(ql => ql.questions[ANY_INDEX].answers[ANY_INDEX].syncUserRef!),
    this.createPathTemplate(ql => ql.questions[ANY_INDEX].answers[ANY_INDEX].comments[ANY_INDEX].syncUserRef!)
  ];

  constructor() {
    super(QUESTION_LIST_MIGRATIONS);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      {
        projectDomain: SFProjectDomain.Questions,
        pathTemplate: this.createPathTemplate(ql => ql.questions[ANY_INDEX])
      },
      {
        projectDomain: SFProjectDomain.Answers,
        pathTemplate: this.createPathTemplate(ql => ql.questions[ANY_INDEX].answers[ANY_INDEX])
      },
      {
        projectDomain: SFProjectDomain.AnswerComments,
        pathTemplate: this.createPathTemplate(ql => ql.questions[ANY_INDEX].answers[ANY_INDEX].comments[ANY_INDEX])
      },
      {
        projectDomain: SFProjectDomain.Likes,
        pathTemplate: this.createPathTemplate(ql => ql.questions[ANY_INDEX].answers[ANY_INDEX].likes[ANY_INDEX])
      }
    ];
  }
}
