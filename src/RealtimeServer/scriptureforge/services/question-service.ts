import { ANY_INDEX } from '../../common/path-template';
import { ProjectDomainConfig } from '../../common/services/project-data-service';
import { Question, QUESTIONS_COLLECTION } from '../models/question';
import { SFProjectDomain } from '../models/sf-project-rights';
import { QUESTION_MIGRATIONS } from './question-migrations';
import { SFProjectDataService } from './sf-project-data-service';

/**
 * This class manages question list docs.
 */
export class QuestionService extends SFProjectDataService<Question> {
  readonly collection = QUESTIONS_COLLECTION;

  constructor() {
    super(QUESTION_MIGRATIONS);

    const immutableProps = [
      this.createPathTemplate(q => q.dataId),
      this.createPathTemplate(q => q.dateCreated),
      this.createPathTemplate(q => q.answers[ANY_INDEX].dataId),
      this.createPathTemplate(q => q.answers[ANY_INDEX].ownerRef),
      this.createPathTemplate(q => q.answers[ANY_INDEX].syncUserRef!),
      this.createPathTemplate(q => q.answers[ANY_INDEX].dateCreated),
      this.createPathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].dataId),
      this.createPathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].ownerRef),
      this.createPathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].syncUserRef!),
      this.createPathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX].dateCreated),
      this.createPathTemplate(q => q.answers[ANY_INDEX].likes[ANY_INDEX].ownerRef)
    ];
    this.immutableProps.push(...immutableProps);
  }

  protected setupDomains(): ProjectDomainConfig[] {
    return [
      {
        projectDomain: SFProjectDomain.Questions,
        pathTemplate: this.createPathTemplate()
      },
      {
        projectDomain: SFProjectDomain.Answers,
        pathTemplate: this.createPathTemplate(q => q.answers[ANY_INDEX])
      },
      {
        projectDomain: SFProjectDomain.AnswerComments,
        pathTemplate: this.createPathTemplate(q => q.answers[ANY_INDEX].comments[ANY_INDEX])
      },
      {
        projectDomain: SFProjectDomain.Likes,
        pathTemplate: this.createPathTemplate(q => q.answers[ANY_INDEX].likes[ANY_INDEX])
      }
    ];
  }
}
