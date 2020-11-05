import { FileType } from 'xforge-common/models/file-offline-data';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { TypeRegistry } from 'xforge-common/type-registry';
import { QuestionDoc } from './question-doc';
import { SFProjectDoc } from './sf-project-doc';
import { SFProjectUserConfigDoc } from './sf-project-user-config-doc';
import { TextDoc } from './text-doc';
import { FEATURE_TRANSLATION } from './translation-suggestions-data';

export const SF_TYPE_REGISTRY = new TypeRegistry(
  [UserDoc, UserProfileDoc, SFProjectDoc, SFProjectUserConfigDoc, QuestionDoc, TextDoc],
  [FileType.Audio],
  [FEATURE_TRANSLATION]
);
