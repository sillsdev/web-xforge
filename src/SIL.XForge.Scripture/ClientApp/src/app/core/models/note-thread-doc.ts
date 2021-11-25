import {
  NoteThread,
  NOTE_THREAD_COLLECTION,
  NOTE_THREAD_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';
import { Note } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { clone } from 'lodash-es';

export interface NoteThreadIcon {
  cssVar: string;
  url: string;
}

export class NoteThreadDoc extends ProjectDataDoc<NoteThread> {
  static readonly COLLECTION = NOTE_THREAD_COLLECTION;
  static readonly INDEX_PATHS = NOTE_THREAD_INDEX_PATHS;

  get icon(): NoteThreadIcon {
    return this.iconProperties(this.getTag());
  }

  get iconResolved(): NoteThreadIcon {
    let iconTag = this.getTag();
    if (iconTag !== '') {
      // Resolved tags use 5 in the filename instead of the current number suffix
      iconTag = iconTag.slice(0, iconTag.length - 1) + '5';
    }
    return this.iconProperties(iconTag);
  }

  private getTag(): string {
    if (this.data == null) {
      return '';
    }
    const notes: Note[] = clone(this.data.notes).sort((a, b) => Date.parse(a.dateCreated) - Date.parse(b.dateCreated));
    const iconDefinedNotes = notes.filter(n => n.tagIcon != null);
    let iconTag: string =
      iconDefinedNotes.length === 0 ? this.data.tagIcon : iconDefinedNotes[iconDefinedNotes.length - 1].tagIcon!;
    if (iconTag === '') {
      iconTag = '01flag1';
    }
    return iconTag;
  }

  private iconProperties(iconTag: string): NoteThreadIcon {
    const iconUrl = `/assets/icons/TagIcons/${iconTag}.png`;
    return { cssVar: `--icon-file: url(${iconUrl});`, url: iconUrl };
  }
}
