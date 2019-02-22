import { DomainModelConfig } from 'xforge-common/models/domain-model';
import { TranscriberProject, TranscriberProjectRef } from './transcriber-project';
import { TranscriberProjectUser, TranscriberProjectUserRef } from './transcriber-project-user';

// All resource, resource ref, and realtime doc types should be added to schema and generated into this config
export const TRANSCRIBER_DOMAIN_MODEL_CONFIG: DomainModelConfig = {
  resourceTypes: [TranscriberProject, TranscriberProjectUser],
  resourceRefTypes: [TranscriberProjectRef, TranscriberProjectUserRef],
  realtimeDataTypes: []
};
