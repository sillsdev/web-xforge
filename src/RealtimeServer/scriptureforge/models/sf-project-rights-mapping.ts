import { Operation, ProjectRight } from '../../common/models/project-rights';
import { SFProjectRole } from './sf-project-role';

export enum SFProjectDomain {
  Texts = 'texts',
  ProjectUserConfigs = 'project_user_configs',
  Questions = 'questions',
  Answers = 'answers',
  AnswerComments = 'answer_comments',
  Likes = 'likes'
}

export const SF_PROJECT_RIGHTS_MAPPING = new Map<SFProjectRole, ProjectRight[]>();

const observerRights: ProjectRight[] = [
  { projectDomain: SFProjectDomain.ProjectUserConfigs, operation: Operation.ViewOwn },
  { projectDomain: SFProjectDomain.ProjectUserConfigs, operation: Operation.EditOwn },

  { projectDomain: SFProjectDomain.Texts, operation: Operation.View },

  { projectDomain: SFProjectDomain.Questions, operation: Operation.View },

  { projectDomain: SFProjectDomain.Answers, operation: Operation.View },

  { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.View },

  { projectDomain: SFProjectDomain.Likes, operation: Operation.View }
];
SF_PROJECT_RIGHTS_MAPPING.set(SFProjectRole.ParatextObserver, observerRights);
SF_PROJECT_RIGHTS_MAPPING.set(SFProjectRole.Observer, observerRights);

const reviewerRights: ProjectRight[] = observerRights.concat([
  { projectDomain: SFProjectDomain.Answers, operation: Operation.Create },
  { projectDomain: SFProjectDomain.Answers, operation: Operation.EditOwn },
  { projectDomain: SFProjectDomain.Answers, operation: Operation.DeleteOwn },

  { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.Create },
  { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.EditOwn },
  { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.DeleteOwn },

  { projectDomain: SFProjectDomain.Likes, operation: Operation.Create },
  { projectDomain: SFProjectDomain.Likes, operation: Operation.DeleteOwn }
]);
SF_PROJECT_RIGHTS_MAPPING.set(SFProjectRole.Reviewer, reviewerRights);
SF_PROJECT_RIGHTS_MAPPING.set(SFProjectRole.ParatextConsultant, reviewerRights);
SF_PROJECT_RIGHTS_MAPPING.set(SFProjectRole.CommunityChecker, reviewerRights);

const translatorRights: ProjectRight[] = reviewerRights.concat([
  { projectDomain: SFProjectDomain.Texts, operation: Operation.Edit }
]);
SF_PROJECT_RIGHTS_MAPPING.set(SFProjectRole.ParatextTranslator, translatorRights);

const administratorRights: ProjectRight[] = observerRights.concat([
  { projectDomain: SFProjectDomain.Texts, operation: Operation.Edit },

  { projectDomain: SFProjectDomain.Questions, operation: Operation.Create },
  { projectDomain: SFProjectDomain.Questions, operation: Operation.Edit },
  { projectDomain: SFProjectDomain.Questions, operation: Operation.Delete },

  { projectDomain: SFProjectDomain.Answers, operation: Operation.EditOwn },
  { projectDomain: SFProjectDomain.Answers, operation: Operation.Delete },

  { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.Create },
  { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.EditOwn },
  { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.Delete },

  { projectDomain: SFProjectDomain.Likes, operation: Operation.Create },
  { projectDomain: SFProjectDomain.Likes, operation: Operation.DeleteOwn }
]);
SF_PROJECT_RIGHTS_MAPPING.set(SFProjectRole.ParatextAdministrator, administratorRights);
