import {
  ParatextNoteThread,
  PARATEXT_NOTE_THREAD_COLLECTION,
  PARATEXT_NOTE_THREAD_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/paratext-note-thread';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';

export class ParatextNoteThreadDoc extends ProjectDataDoc<ParatextNoteThread> {
  static readonly COLLECTION = PARATEXT_NOTE_THREAD_COLLECTION;
  static readonly INDEX_PATHS = PARATEXT_NOTE_THREAD_INDEX_PATHS;
}
