import { Operation, ProjectRight, ProjectRights } from '../../common/models/project-rights';
import { SFProjectRole } from './sf-project-role';

export enum SFProjectDomain {
  Texts = 'texts',
  ProjectUserConfigs = 'project_user_configs',
  Questions = 'questions',
  Answers = 'answers',
  AnswerComments = 'answer_comments',
  Likes = 'likes',
  ParatextNoteThreads = 'note_threads',
  Notes = 'notes'
}

export class SFProjectRights extends ProjectRights {
  constructor() {
    super();

    const observerRights: ProjectRight[] = [
      { projectDomain: SFProjectDomain.ProjectUserConfigs, operation: Operation.ViewOwn },
      { projectDomain: SFProjectDomain.ProjectUserConfigs, operation: Operation.EditOwn },

      { projectDomain: SFProjectDomain.Texts, operation: Operation.View },

      { projectDomain: SFProjectDomain.Questions, operation: Operation.View },

      { projectDomain: SFProjectDomain.Answers, operation: Operation.View },

      { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.View },

      { projectDomain: SFProjectDomain.Likes, operation: Operation.View },

      { projectDomain: SFProjectDomain.ParatextNoteThreads, operation: Operation.View },

      { projectDomain: SFProjectDomain.Notes, operation: Operation.View }
    ];
    this.addRights(SFProjectRole.ParatextObserver, observerRights);
    this.addRights(SFProjectRole.Observer, observerRights);

    const reviewerRights: ProjectRight[] = observerRights.concat([
      { projectDomain: SFProjectDomain.Answers, operation: Operation.Create },
      { projectDomain: SFProjectDomain.Answers, operation: Operation.EditOwn },
      { projectDomain: SFProjectDomain.Answers, operation: Operation.DeleteOwn },

      { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.Create },
      { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.EditOwn },
      { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.DeleteOwn },

      { projectDomain: SFProjectDomain.Likes, operation: Operation.Create },
      { projectDomain: SFProjectDomain.Likes, operation: Operation.DeleteOwn },

      { projectDomain: SFProjectDomain.Notes, operation: Operation.Create },
      { projectDomain: SFProjectDomain.Notes, operation: Operation.EditOwn },
      { projectDomain: SFProjectDomain.Notes, operation: Operation.DeleteOwn }
    ]);
    this.addRights(SFProjectRole.Reviewer, reviewerRights);
    this.addRights(SFProjectRole.ParatextConsultant, reviewerRights);
    this.addRights(SFProjectRole.CommunityChecker, reviewerRights);

    const translatorRights: ProjectRight[] = reviewerRights.concat([
      { projectDomain: SFProjectDomain.Texts, operation: Operation.Edit },

      { projectDomain: SFProjectDomain.ParatextNoteThreads, operation: Operation.Create },
      { projectDomain: SFProjectDomain.ParatextNoteThreads, operation: Operation.Edit },
      { projectDomain: SFProjectDomain.ParatextNoteThreads, operation: Operation.Delete },

      { projectDomain: SFProjectDomain.Notes, operation: Operation.Create },
      { projectDomain: SFProjectDomain.Notes, operation: Operation.EditOwn },
      { projectDomain: SFProjectDomain.Notes, operation: Operation.DeleteOwn }
    ]);
    this.addRights(SFProjectRole.ParatextTranslator, translatorRights);

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
      { projectDomain: SFProjectDomain.Likes, operation: Operation.DeleteOwn },

      { projectDomain: SFProjectDomain.ParatextNoteThreads, operation: Operation.Create },
      { projectDomain: SFProjectDomain.ParatextNoteThreads, operation: Operation.Edit },
      { projectDomain: SFProjectDomain.ParatextNoteThreads, operation: Operation.Delete },

      { projectDomain: SFProjectDomain.Notes, operation: Operation.Create },
      { projectDomain: SFProjectDomain.Notes, operation: Operation.EditOwn },
      { projectDomain: SFProjectDomain.Notes, operation: Operation.Delete }
    ]);
    this.addRights(SFProjectRole.ParatextAdministrator, administratorRights);
  }
}

export const SF_PROJECT_RIGHTS = new SFProjectRights();
