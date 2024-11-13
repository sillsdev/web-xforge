import { Operation, ProjectRight, ProjectRights } from '../../common/models/project-rights';
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
  TrainingData = 'training_data',
  Drafts = 'drafts',
  UserInvites = 'user_invites'
}

// See https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html
// Domain is marked optional because each role does not need to list the domains exhaustively
const rightsByRole: Record<SFProjectRole, { [domain in `${SFProjectDomain}`]?: `${Operation}`[] }> = {
  sf_observer: {
    project_user_configs: ['view_own', 'edit_own'],
    texts: ['view'],
    sf_note_threads: ['view'],
    notes: ['view'],
    text_audio: ['view']
  },
  pt_observer: {
    project_user_configs: ['view_own', 'edit_own'],
    project: ['view'],
    texts: ['view'],
    questions: ['view'],
    answers: ['view'],
    answer_status: ['view'],
    answer_comments: ['view'],
    likes: ['view'],
    biblical_terms: ['view'],
    pt_note_threads: ['view'],
    sf_note_threads: ['view'],
    notes: ['view'],
    text_audio: ['view']
  },
  sf_commenter: {
    project_user_configs: ['view_own', 'edit_own'],
    texts: ['view'],
    sf_note_threads: ['view', 'create', 'delete_own'],
    notes: ['view', 'create', 'edit_own', 'delete_own'],
    text_audio: ['view']
  },
  sf_community_checker: {
    project_user_configs: ['view_own', 'edit_own'],
    texts: ['view'],
    questions: ['view'],
    answers: ['view', 'create', 'edit_own', 'delete_own'],
    answer_status: ['view'],
    answer_comments: ['view', 'create', 'edit_own', 'delete_own'],
    likes: ['view', 'create', 'delete_own'],
    text_audio: ['view']
  },
  pt_consultant: {
    project_user_configs: ['view_own', 'edit_own'],
    project: ['view'],
    texts: ['view'],
    questions: ['view'],
    answers: ['view'],
    answer_status: ['view'],
    answer_comments: ['view'],
    likes: ['view'],
    biblical_terms: ['view'],
    pt_note_threads: ['view', 'create', 'edit', 'delete_own'],
    sf_note_threads: ['view', 'create', 'edit', 'delete_own'],
    notes: ['view', 'create', 'edit_own', 'delete_own'],
    text_audio: ['view']
  },
  pt_translator: {
    project_user_configs: ['view_own', 'edit_own'],
    project: ['view'],
    texts: ['view', 'edit'],
    questions: ['view'],
    answers: ['view', 'create', 'edit_own', 'delete_own'],
    answer_comments: ['view', 'create', 'edit_own', 'delete_own'],
    answer_status: ['view'],
    likes: ['view', 'create', 'delete_own'],
    biblical_terms: ['view', 'edit'],
    pt_note_threads: ['view', 'create', 'edit', 'delete_own'],
    sf_note_threads: ['view', 'create', 'edit', 'delete_own'],
    notes: ['view', 'create', 'edit_own', 'delete_own'],
    text_audio: ['view'],
    training_data: ['view', 'create', 'edit_own', 'delete_own'],
    drafts: ['view']
  },
  pt_administrator: {
    project_user_configs: ['view_own', 'edit_own'],
    project: ['view'],
    texts: ['view', 'edit'],
    questions: ['view', 'create', 'edit', 'delete'],
    answers: ['view', 'create', 'delete', 'edit_own'],
    answer_comments: ['view', 'create', 'edit_own', 'delete'],
    answer_status: ['view', 'edit'],
    likes: ['view', 'create', 'delete_own'],
    biblical_terms: ['view', 'edit'],
    pt_note_threads: ['view', 'create', 'edit', 'delete'],
    sf_note_threads: ['view', 'create', 'edit', 'delete'],
    notes: ['view', 'create', 'edit_own', 'delete'],
    text_audio: ['view', 'edit', 'create', 'delete'],
    training_data: ['view', 'create', 'edit', 'delete'],
    drafts: ['view'],
    user_invites: ['create']
  },
  none: {}
};

export class SFProjectRights extends ProjectRights {
  constructor() {
    super();

    for (const [role, rights] of Object.entries(rightsByRole)) {
      const rightsForRole: ProjectRight[] = [];
      for (const [domain, operations] of Object.entries(rights)) {
        for (const operation of operations) rightsForRole.push([domain, operation]);
      }
      this.addRights(role, rightsForRole);
    }
  }
}

export const SF_PROJECT_RIGHTS = new SFProjectRights();
