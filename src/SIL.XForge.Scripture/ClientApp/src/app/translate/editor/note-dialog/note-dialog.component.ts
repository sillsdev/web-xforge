import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { sortBy } from 'lodash-es';
import { fromVerseRef, toVerseRef, VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Note, REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { I18nService } from 'xforge-common/i18n.service';
import {
  AssignedUsers,
  NoteConflictType,
  NoteStatus,
  NoteType
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { translate } from '@ngneat/transloco';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { TextAnchor } from 'realtime-server/lib/esm/scriptureforge/models/text-anchor';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { canInsertNote } from 'src/app/shared/utils';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { NoteThreadDoc, defaultNoteThreadIcon } from '../../../core/models/note-thread-doc';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';

export interface NoteDialogData {
  threadId?: string;
  textDocId: TextDocId;
  projectId: string;
  verseRef?: VerseRef;
}

export interface NoteDialogResult {
  verseRef: VerseRefData;
  note: Note;
  selectedText: string;
  position: TextAnchor;
}

// TODO: Implement a diff - there is an accepted solution here that might be a good starting point:
// https://codereview.stackexchange.com/questions/133586/a-string-prototype-diff-implementation-text-diff

@Component({
  templateUrl: './note-dialog.component.html',
  styleUrls: ['./note-dialog.component.scss']
})
export class NoteDialogComponent implements OnInit {
  showSegmentText: boolean = false;
  currentNote: string = '';
  private isAssignedToOtherUser: boolean = false;
  private threadDoc?: NoteThreadDoc;
  private projectProfileDoc?: SFProjectProfileDoc;
  private textDoc?: TextDoc;
  private paratextProjectUsers?: ParatextUserProfile[];

  constructor(
    private readonly dialogRef: MatDialogRef<NoteDialogComponent, NoteDialogResult>,
    @Inject(MAT_DIALOG_DATA) private readonly data: NoteDialogData,
    private readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly featureFlags: FeatureFlagService
  ) {}

  async ngOnInit(): Promise<void> {
    // This can be refactored so the asynchronous calls are done in parallel
    if (this.threadId == null) {
      this.textDoc = await this.projectService.getText(this.textDocId);
    } else {
      this.threadDoc = await this.projectService.getNoteThread(this.projectId + ':' + this.threadId);
      this.textDoc = await this.projectService.getText(this.textDocId);
    }

    this.projectProfileDoc = await this.projectService.getProfile(this.projectId);
    const userRole = this.projectProfileDoc?.data?.userRoles[this.userService.currentUserId];
    if (userRole != null) {
      const projectDoc: SFProjectDoc | undefined = await this.projectService.tryGetForRole(this.projectId, userRole);
      if (this.threadDoc != null && projectDoc != null && projectDoc.data?.paratextUsers != null) {
        this.paratextProjectUsers = projectDoc.data.paratextUsers;
        this.isAssignedToOtherUser = this.threadDoc.isAssignedToOtherUser(
          this.userService.currentUserId,
          this.paratextProjectUsers
        );
      }
    }
  }

  get noteThreadAssignedUserRef(): string | undefined {
    return this.threadDoc?.data?.assignment;
  }

  get flagIcon(): string {
    if (this.threadDoc?.data == null) {
      return defaultNoteThreadIcon().url;
    }
    return this.isAssignedToOtherUser ? this.threadDoc.iconGrayed.url : this.threadDoc.icon.url;
  }

  get isNewNote(): boolean {
    return this.data.threadId == null;
  }

  get isRtl(): boolean {
    if (this.projectProfileDoc?.data == null) {
      return false;
    }
    return this.projectProfileDoc.data.isRightToLeft ?? false;
  }

  get notes(): Note[] {
    if (this.threadDoc?.data == null) {
      return [];
    }
    return sortBy(
      this.threadDoc.data.notes.filter(n => !n.deleted),
      n => n.dateCreated
    );
  }

  get verseRefDisplay(): string {
    const verseRef: VerseRef | undefined = this.verseRef;
    return verseRef == null ? '' : this.i18n.localizeReference(verseRef);
  }

  get noteContextText(): string {
    if (this.threadDoc?.data == null) {
      return '';
    }
    return (
      this.threadDoc.data.originalContextBefore +
      '<b>' +
      this.threadDoc.data.originalSelectedText +
      '</b>' +
      this.threadDoc.data.originalContextAfter
    );
  }

  get segmentText(): string {
    if (this.textDoc?.data == null) {
      return '';
    }
    const verseRef: VerseRef | undefined =
      this.threadDoc?.data == null ? this.data.verseRef : toVerseRef(this.threadDoc.data.verseRef);
    if (verseRef == null) {
      return '';
    }
    return this.textDoc.getSegmentTextIncludingRelated(`verse_${verseRef.chapter}_${verseRef.verse}`);
  }

  get canInsertNote(): boolean {
    if (this.projectProfileDoc?.data == null) return false;
    return this.isAddNotesEnabled && canInsertNote(this.projectProfileDoc.data, this.userService.currentUserId);
  }

  /** Is a note considered to be a conflict note? */
  isConflictNote(note: Note): boolean {
    // Note that human-written followup notes on a thread that starts with a conflict note, may also have their
    // type set as 'conflict', so we can't just rely on that.
    return note.type === NoteType.Conflict && note.conflictType !== NoteConflictType.DefaultValue;
  }

  /** What to display for note content. Will be transformed for display, especially for a conflict note. */
  contentForDisplay(note: Note): string {
    if (note == null) {
      return '';
    }
    if (this.isConflictNote(note)) {
      // Process only the data in the language tag, not the preceding description (so don't report
      // "Bob edited this verse on two different machines.").
      // The XML parser won't process the text if it starts with text outside of a tag. So manually surround
      // it in tags first, like a span.
      const parser = new DOMParser();
      const tree: Document = parser.parseFromString(`<span>${note.content}</span>`, 'application/xml');
      const conflictContents = tree.querySelector('language p');
      if (conflictContents != null) {
        return this.parseNote(conflictContents.innerHTML);
      }
    }

    return this.parseNote(note.content);
  }

  private get projectId(): string {
    return this.data.projectId;
  }

  private get textDocId(): string {
    return this.data.textDocId.toString();
  }

  private get threadId(): string | undefined {
    return this.data.threadId;
  }

  private get verseRef(): VerseRef | undefined {
    if (this.threadDoc?.data == null) {
      return this.data.verseRef == null ? undefined : this.data.verseRef;
    }
    return toVerseRef(this.threadDoc.data.verseRef);
  }

  private get isAddNotesEnabled(): boolean {
    return this.featureFlags.allowAddingNotes.enabled;
  }

  parseNote(content: string | undefined): string {
    // See also PT CommentEditHelper.cs and CommentEditHelperTests.cs for info and examples on how conflict
    // information is interpreted.

    const replace = new Map<RegExp, string>();
    replace.set(/<bold><color name="red">(.*?)<\/color><\/bold>/gim, '<span class="conflict-text-newer">$1</span>');
    replace.set(
      /<strikethrough><color name="red">(.*?)<\/color><\/strikethrough>/gim,
      '<span class="conflict-text-older">$1</span>'
    );
    replace.set(/<bold>(.*)<\/bold>/gim, '<b>$1</b>'); // Bold style
    replace.set(/<italic>(.*)<\/italic>/gim, '<i>$1</i>'); // Italic style
    replace.set(/<p>(.*)<\/p>/gim, '$1<br />'); // Turn paragraphs into line breaks
    // Strip out any tags that don't match the above replacements
    replace.set(/<((?!(\/?)(i|b|br|span)))(.*?)>/gim, '');
    replace.forEach((replacement, regEx) => (content = content?.replace(regEx, replacement)));
    return content ?? '';
  }

  toggleSegmentText(): void {
    this.showSegmentText = !this.showSegmentText;
  }

  noteIcon(note: Note) {
    if (this.threadDoc?.data == null) {
      return '';
    }
    switch (note.status) {
      case NoteStatus.Todo:
        return this.threadDoc.getNoteIcon(note).url;
      case NoteStatus.Done:
      case NoteStatus.Resolved:
        return this.threadDoc.getNoteResolvedIcon(note).url;
    }
    const noteIcon: string = this.threadDoc.getNoteIcon(note).url;
    return note.reattached != null && noteIcon === '' ? this.threadDoc.iconReattached.url : noteIcon;
  }

  noteTitle(note: Note) {
    switch (note.status) {
      case NoteStatus.Todo:
        return translate('note_dialog.status_to_do');
      case NoteStatus.Done:
      case NoteStatus.Resolved:
        return translate('note_dialog.status_resolved');
    }
    return note.reattached != null ? translate('note_dialog.note_reattached') : '';
  }

  reattachedText(note: Note): string {
    if (note.reattached == null) {
      return '';
    }
    const reattachedParts: string[] = note.reattached.split(REATTACH_SEPARATOR);
    const selectedText: string = reattachedParts[1];
    const contextBefore: string = reattachedParts[3];
    const contextAfter: string = reattachedParts[4];
    const reattachedText: string = contextBefore + '<b>' + selectedText + '</b>' + contextAfter;
    return reattachedText;
  }

  reattachedVerse(note: Note): string {
    if (note.reattached == null) {
      return '';
    }
    const reattachedParts: string[] = note.reattached.split(REATTACH_SEPARATOR);
    const verseStr: string = reattachedParts[0];
    const vref: VerseRef = VerseRef.parse(verseStr);
    const verseRef: string = this.i18n.localizeReference(vref);
    const reattached: string = translate('note_dialog.reattached');
    return `${verseRef} ${reattached}`;
  }

  getAssignedUserString(assignedNoteUserRef: string): string {
    switch (assignedNoteUserRef) {
      case AssignedUsers.TeamUser:
        return translate('note_dialog.team');
      case AssignedUsers.Unspecified:
        return translate('note_dialog.unassigned');
    }
    const paratextUser: ParatextUserProfile | undefined = this.paratextProjectUsers?.find(
      u => u.opaqueUserId === assignedNoteUserRef
    );
    return paratextUser?.username ?? translate('note_dialog.paratext_user');
  }

  submit(): void {
    if (this.currentNote == null || this.currentNote.trim().length === 0) {
      this.dialogRef.close();
      return;
    }
    const verseRef: VerseRef | undefined = this.verseRef;
    if (verseRef == null) return;

    const currentDate = new Date().toJSON();
    const note: Note = {
      dataId: objectId(),
      // empty so that the editor component knows this is a new note
      threadId: '',
      ownerRef: this.userService.currentUserId,
      content: this.currentNote,
      dateCreated: currentDate,
      dateModified: currentDate,
      conflictType: NoteConflictType.DefaultValue,
      extUserId: this.userService.currentUserId,
      type: NoteType.Normal,
      status: NoteStatus.Todo,
      deleted: false
    };

    const result: NoteDialogResult = {
      verseRef: fromVerseRef(verseRef),
      note,
      position: { start: 0, length: 0 },
      selectedText: this.segmentText
    };
    this.dialogRef.close(result);
  }
}
