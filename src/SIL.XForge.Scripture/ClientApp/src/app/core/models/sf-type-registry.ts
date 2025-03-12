import { FileType } from 'xforge-common/models/file-offline-data';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { TypeRegistry } from 'xforge-common/type-registry';
import { BiblicalTermDoc } from './biblical-term-doc';
import { EDITED_SEGMENTS } from './edited-segment-data';
import { NoteThreadDoc } from './note-thread-doc';
import { QuestionDoc } from './question-doc';
import { SFProjectDoc } from './sf-project-doc';
import { SFProjectProfileDoc } from './sf-project-profile-doc';
import { SFProjectUserConfigDoc } from './sf-project-user-config-doc';
import { TextAudioDoc } from './text-audio-doc';
import { TextDoc } from './text-doc';
import { TextDocumentDoc } from './text-document-doc';
import { TrainingDataDoc } from './training-data-doc';

export const SF_TYPE_REGISTRY = new TypeRegistry(
  [
    UserDoc,
    UserProfileDoc,
    SFProjectDoc,
    SFProjectProfileDoc,
    SFProjectUserConfigDoc,
    BiblicalTermDoc,
    QuestionDoc,
    TextDoc,
    NoteThreadDoc,
    TextAudioDoc,
    TextDocumentDoc,
    TrainingDataDoc
  ],
  [FileType.Audio, FileType.TrainingData],
  [EDITED_SEGMENTS]
);
