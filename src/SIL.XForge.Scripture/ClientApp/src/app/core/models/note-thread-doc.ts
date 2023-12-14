import {
  NoteTag,
  DEFAULT_TAG_ICON,
  SF_TAG_ICON,
  TO_DO_TAG_ID
} from 'realtime-server/lib/esm/scriptureforge/models/note-tag';
import {
  NoteThread,
  NOTE_THREAD_COLLECTION,
  NOTE_THREAD_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { ProjectDataDoc } from 'xforge-common/models/project-data-doc';
import { Note, REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { clone } from 'lodash-es';
import { VerseRef } from '@sillsdev/scripture';
import { toVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { AssignedUsers } from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';

/** Returns the given tag icon formatted for retrieval in the html template, or the default icon. */
export function defaultNoteThreadIcon(tagIcon: string | undefined): NoteThreadIcon {
  if (tagIcon == null) {
    tagIcon = DEFAULT_TAG_ICON;
  }
  const iconUrl = `/assets/icons/TagIcons/${tagIcon}.png`;
  return { cssVar: `--icon-file: url(${iconUrl});`, url: iconUrl };
}

export interface NoteThreadIcon {
  cssVar: string;
  url: string;
}

export class NoteThreadDoc extends ProjectDataDoc<NoteThread> {
  static readonly COLLECTION = NOTE_THREAD_COLLECTION;
  static readonly INDEX_PATHS = NOTE_THREAD_INDEX_PATHS;

  get iconReattached(): NoteThreadIcon {
    return this.iconProperties('ReattachNote');
  }

  getIcon(noteTags: NoteTag[]): NoteThreadIcon {
    return this.iconProperties(this.getTagIcon(noteTags));
  }

  getIconResolved(noteTags: NoteTag[]): NoteThreadIcon {
    const iconTag = this.getResolvedTag(this.getTagIcon(noteTags));
    return this.iconProperties(iconTag);
  }

  getIconGrayed(noteTags: NoteTag[]): NoteThreadIcon {
    const iconTag = this.getGrayedOutTag(this.getTagIcon(noteTags));
    return this.iconProperties(iconTag);
  }

  getNoteIcon(note: Note, noteTags: NoteTag[]): NoteThreadIcon {
    const tagIcon: string | undefined = noteTags.find(t => t.tagId === note.tagId)?.icon ?? undefined;
    return this.iconProperties(tagIcon != null ? tagIcon : '');
  }

  getNoteResolvedIcon(note: Note, noteTags: NoteTag[]): NoteThreadIcon {
    const tagIcon: string | undefined = noteTags.find(t => t.tagId === note.tagId)?.icon ?? undefined;
    const iconTag = this.getResolvedTag(tagIcon != null ? tagIcon : '');
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
    return new VerseRef(verseStr);
  }

  canUserResolveThread(userId: string, userRole: string, noteTags: NoteTag[]): boolean {
    if (this.data == null) return true;
    if (userRole === SFProjectRole.ParatextAdministrator) return true;
    const noteTagOnThread: NoteTag | undefined = this.getActiveTagOnThread(noteTags);
    if (noteTagOnThread?.creatorResolve !== true) return isParatextRole(userRole);

    const notesInOrder: Note[] = this.notesInOrderClone(this.data.notes);
    return notesInOrder.length === 0 || notesInOrder[0].ownerRef === userId;
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

  private getTagIcon(noteTags: NoteTag[]): string {
    if (this.data == null) {
      return '';
    }

    const noteTagOnThread: NoteTag | undefined = this.getActiveTagOnThread(noteTags);
    if (noteTagOnThread == null) {
      if (this.data.publishedToSF === true) return SF_TAG_ICON;
      return noteTags.find(t => t.tagId === TO_DO_TAG_ID)?.icon ?? DEFAULT_TAG_ICON;
    }
    return noteTagOnThread.icon;
  }

  private getActiveTagOnThread(noteTags: NoteTag[]): NoteTag | undefined {
    if (this.data == null) return;

    const iconDefinedNotes: Note[] = this.notesInOrderClone(this.data.notes).filter(n => n.tagId != null);
    let tagId: number | undefined =
      iconDefinedNotes.length === 0 ? undefined : iconDefinedNotes[iconDefinedNotes.length - 1].tagId;
    if (tagId == null) return;
    return noteTags.find(t => t.tagId === tagId);
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
