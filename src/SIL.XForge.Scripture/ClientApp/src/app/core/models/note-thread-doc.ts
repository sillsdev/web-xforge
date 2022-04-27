import {
  NoteThread,
  NOTE_THREAD_COLLECTION,
  NOTE_THREAD_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';
import { Note, REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { clone } from 'lodash-es';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { toVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { AssignedUsers } from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';

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
    const iconTag = this.getResolvedTag(this.getTag());
    return this.iconProperties(iconTag);
  }

  get iconReattached(): NoteThreadIcon {
    return this.iconProperties('ReattachNote');
  }

  get iconGrayed(): NoteThreadIcon {
    const iconTag = this.getGrayedOutTag(this.getTag());
    return this.iconProperties(iconTag);
  }

  getNoteIcon(note: Note): NoteThreadIcon {
    return this.iconProperties(note.tagIcon ? note.tagIcon : '');
  }

  getNoteResolvedIcon(note: Note): NoteThreadIcon {
    const iconTag = this.getResolvedTag(note.tagIcon ? note.tagIcon : '');
    return this.iconProperties(iconTag);
  }

  currentVerseRef(): VerseRef | undefined {
    if (this.data == null) {
      return;
    }
    const lastReattach: Note | undefined = this.notesInOrderClone(this.data.notes)
      .reverse()
      .find(note => note.reattached != null);
    if (lastReattach == null || lastReattach.reattached == null) {
      return toVerseRef(this.data.verseRef);
    }

    const verseStr: string = lastReattach.reattached.split(REATTACH_SEPARATOR)[0];
    return VerseRef.parse(verseStr);
  }

  isAssignedToOtherUser(currentUserId: string, paratextProjectUsers: ParatextUserProfile[]): boolean {
    switch (this.data?.assignment) {
      case AssignedUsers.TeamUser:
      case AssignedUsers.Unspecified:
      case undefined:
        return false;
    }
    const ptUser: ParatextUserProfile | undefined = paratextProjectUsers?.find(
      user => user.opaqueUserId === this.data?.assignment
    );
    return ptUser?.sfUserId !== currentUserId;
  }

  notesInOrderClone(notes: Note[]): Note[] {
    return clone(notes).sort((a, b) => Date.parse(a.dateCreated) - Date.parse(b.dateCreated));
  }

  private getTag(): string {
    if (this.data == null) {
      return '';
    }

    const iconDefinedNotes = this.notesInOrderClone(this.data.notes).filter(n => n.tagIcon != null);
    let iconTag: string =
      iconDefinedNotes.length === 0 ? this.data.tagIcon : iconDefinedNotes[iconDefinedNotes.length - 1].tagIcon!;
    if (iconTag === '') {
      iconTag = '01flag1';
    }
    return iconTag;
  }

  private getResolvedTag(iconTag: string = ''): string {
    if (iconTag !== '') {
      // Resolved tags use 5 in the filename instead of the current number suffix
      iconTag = iconTag.slice(0, iconTag.length - 1) + '5';
    }
    return iconTag;
  }

  private getGrayedOutTag(iconTag: string): string {
    if (iconTag !== '') {
      // Grayed out tags use 4 in the filename instead of the current number suffix
      iconTag = iconTag.slice(0, iconTag.length - 1) + '4';
    }
    return iconTag;
  }

  private iconProperties(iconTag: string): NoteThreadIcon {
    if (iconTag === '') {
      return { cssVar: '', url: '' };
    }
    const iconUrl = `/assets/icons/TagIcons/${iconTag}.png`;
    return { cssVar: `--icon-file: url(${iconUrl});`, url: iconUrl };
  }
}
