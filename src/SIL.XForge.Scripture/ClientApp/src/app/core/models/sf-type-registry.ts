import { FileType } from 'xforge-common/models/file-offline-data';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { TypeRegistry } from 'xforge-common/type-registry';
import { EDITED_SEGMENTS } from './edited-segment-data';
import { NoteThreadDoc } from './note-thread-doc';
import { QuestionDoc } from './question-doc';
import { SFProjectDoc } from './sf-project-doc';
import { SFProjectUserConfigDoc } from './sf-project-user-config-doc';
import { TextDoc } from './text-doc';

export const SF_TYPE_REGISTRY = new TypeRegistry(
  [UserDoc, UserProfileDoc, SFProjectDoc, SFProjectUserConfigDoc, QuestionDoc, TextDoc, NoteThreadDoc],
  [FileType.Audio],
  [EDITED_SEGMENTS]
);
