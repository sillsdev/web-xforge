import { Operation, ProjectRight, ProjectRights } from '../../common/models/project-rights';
import { SFProjectRole } from './sf-project-role';

export enum SFProjectDomain {
  Texts = 1000,
  ProjectUserConfigs = 1100,
  Questions = 1200,
  Answers = 1300,
  AnswerComments = 1400,
  Likes = 1500,
  ParatextNoteThreads = 1600,
  ParatextNote = 1700
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

      { projectDomain: SFProjectDomain.ParatextNote, operation: Operation.View }
    ];
    this.addRights(SFProjectRole.ParatextObserver, observerRights);

    const reviewerRights: ProjectRight[] = observerRights.concat([
      { projectDomain: SFProjectDomain.Answers, operation: Operation.Create },
      { projectDomain: SFProjectDomain.Answers, operation: Operation.EditOwn },
      { projectDomain: SFProjectDomain.Answers, operation: Operation.DeleteOwn },

      { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.Create },
      { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.EditOwn },
      { projectDomain: SFProjectDomain.AnswerComments, operation: Operation.DeleteOwn },

      { projectDomain: SFProjectDomain.Likes, operation: Operation.Create },
      { projectDomain: SFProjectDomain.Likes, operation: Operation.DeleteOwn },

      { projectDomain: SFProjectDomain.ParatextNote, operation: Operation.Create },
      { projectDomain: SFProjectDomain.ParatextNote, operation: Operation.EditOwn },
      { projectDomain: SFProjectDomain.ParatextNote, operation: Operation.DeleteOwn }
    ]);
    this.addRights(SFProjectRole.Reviewer, reviewerRights);
    this.addRights(SFProjectRole.ParatextConsultant, reviewerRights);
    this.addRights(SFProjectRole.CommunityChecker, reviewerRights);

    const translatorRights: ProjectRight[] = reviewerRights.concat([
      { projectDomain: SFProjectDomain.Texts, operation: Operation.Edit }
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
      { projectDomain: SFProjectDomain.ParatextNoteThreads, operation: Operation.Delete },

      { projectDomain: SFProjectDomain.ParatextNote, operation: Operation.Create },
      { projectDomain: SFProjectDomain.ParatextNote, operation: Operation.Edit },
      { projectDomain: SFProjectDomain.ParatextNote, operation: Operation.Delete }
    ]);
    this.addRights(SFProjectRole.ParatextAdministrator, administratorRights);
  }
}

export const SF_PROJECT_RIGHTS = new SFProjectRights();
