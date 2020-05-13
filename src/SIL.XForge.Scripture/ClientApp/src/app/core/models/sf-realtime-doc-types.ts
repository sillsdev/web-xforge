import { AudioData } from 'xforge-common/models/audio-data';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { OfflineDataTypes, RealtimeDocTypes } from 'xforge-common/realtime-doc-types';
import { QuestionDoc } from './question-doc';
import { SFProjectDoc } from './sf-project-doc';
import { SFProjectUserConfigDoc } from './sf-project-user-config-doc';
import { TextDoc } from './text-doc';

export const SF_REALTIME_DOC_TYPES = new RealtimeDocTypes([
  UserDoc,
  UserProfileDoc,
  SFProjectDoc,
  SFProjectUserConfigDoc,
  QuestionDoc,
  TextDoc
]);

export const SF_OFFLINE_DATA_TYPES = new OfflineDataTypes([AudioData]);
