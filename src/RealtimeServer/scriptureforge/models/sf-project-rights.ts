import { Operation, ProjectRight, ProjectRights } from '../../common/models/project-rights';
import rightsByRole from '../rightsByRole.json';
import { SFProjectRole } from './sf-project-role';

export enum SFProjectDomain {
  Texts = 'texts',
  Project = 'project',
  ProjectUserConfigs = 'project_user_configs',
  Questions = 'questions',
  Answers = 'answers',
  AnswerComments = 'answer_comments',
  AnswerStatus = 'answer_status',
  Likes = 'likes',
  BiblicalTerms = 'biblical_terms',
  PTNoteThreads = 'pt_note_threads',
  SFNoteThreads = 'sf_note_threads',
  Notes = 'notes',
  TextAudio = 'text_audio',
  TextDocuments = 'text_documents',
  TrainingData = 'training_data',
  Drafts = 'drafts',
  UserInvites = 'user_invites'
}

export class SFProjectRights extends ProjectRights {
  constructor() {
    super();

    // See https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html
    // Domain is marked optional because each role does not need to list the domains exhaustively
    for (const [role, rights] of Object.entries(
      rightsByRole as Record<SFProjectRole, { [domain in `${SFProjectDomain}`]?: `${Operation}`[] }>
    )) {
      const rightsForRole: ProjectRight[] = [];
      for (const [domain, operations] of Object.entries(rights)) {
        for (const operation of operations) rightsForRole.push([domain, operation]);
      }
      this.addRights(role, rightsForRole);
    }
  }
}

export const SF_PROJECT_RIGHTS = new SFProjectRights();
