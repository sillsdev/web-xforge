import { DomainModelConfig } from 'xforge-common/models/domain-model';
import { CommentsDoc } from './comments-doc';
import { QuestionsDoc } from './questions-doc';
import { SFProject, SFProjectRef } from './sfproject';
import { SFProjectDataDoc } from './sfproject-data-doc';
import { SFProjectUser, SFProjectUserRef } from './sfproject-user';
import { TextDoc } from './text-doc';

// All resource, resource ref, and realtime doc types that should be added to schema
export const SFDOMAIN_MODEL_CONFIG: DomainModelConfig = {
  resourceTypes: [SFProject, SFProjectUser],
  resourceRefTypes: [SFProjectRef, SFProjectUserRef],
  realtimeDocTypes: [QuestionsDoc, TextDoc, CommentsDoc, SFProjectDataDoc]
};
