import {
  NoteThread,
  NOTE_THREAD_COLLECTION,
  NOTE_THREAD_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';
import { Note } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { clone } from 'lodash-es';

export interface NoteThreadIcon {
  var: string;
  url: string;
}

export class NoteThreadDoc extends ProjectDataDoc<NoteThread> {
  static readonly COLLECTION = NOTE_THREAD_COLLECTION;
  static readonly INDEX_PATHS = NOTE_THREAD_INDEX_PATHS;

  get icon(): NoteThreadIcon {
    if (this.data == null) {
      return { var: '', url: '' };
    }
    const notes: Note[] = clone(this.data.notes).sort((a, b) => Date.parse(a.dateCreated) - Date.parse(b.dateCreated));
    const iconDefinedNotes = notes.filter(n => n.tagIcon != null);
    let icon: string =
      iconDefinedNotes.length === 0 ? this.data.tagIcon : iconDefinedNotes[iconDefinedNotes.length - 1].tagIcon!;
    if (icon === '') {
      icon = '01flag1';
    }
    const iconUrl = `/assets/icons/TagIcons/${icon}.png`;
    return { var: `--icon-file: url(${iconUrl});`, url: iconUrl };
  }
}
