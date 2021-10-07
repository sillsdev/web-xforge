import {
  NoteThread,
  NOTE_THREAD_COLLECTION,
  NOTE_THREAD_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';

export interface NoteThreadIcon {
  var: string;
  url: string;
}

export class NoteThreadDoc extends ProjectDataDoc<NoteThread> {
  static readonly COLLECTION = NOTE_THREAD_COLLECTION;
  static readonly INDEX_PATHS = NOTE_THREAD_INDEX_PATHS;
}
