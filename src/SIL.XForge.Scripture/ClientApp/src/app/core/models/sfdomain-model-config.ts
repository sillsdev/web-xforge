import { DomainModelConfig } from 'xforge-common/models/domain-model';
import { CommentListDoc } from './comment-list-doc';
import { QuestionListDoc } from './question-list-doc';
import { SFProjectDoc } from './sfproject-doc';
import { SFProjectUserConfigDoc } from './sfproject-user-config-doc';
import { TextDoc } from './text-doc';

// All resource, resource ref, and realtime doc types that should be added to schema
export const SFDOMAIN_MODEL_CONFIG: DomainModelConfig = {
  realtimeDocTypes: [SFProjectDoc, SFProjectUserConfigDoc, QuestionListDoc, TextDoc, CommentListDoc]
};
