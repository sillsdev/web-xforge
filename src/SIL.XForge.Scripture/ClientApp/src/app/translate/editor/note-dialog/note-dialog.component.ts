import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { translate } from '@ngneat/transloco';
import { cloneDeep, sortBy } from 'lodash-es';
import { fromVerseRef, toVerseRef, VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Note, REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import {
  AssignedUsers,
  NoteConflictType,
  NoteStatus,
  NoteThread,
  NoteType
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { NoteThreadDoc, defaultNoteThreadIcon, DEFAULT_TAG_ICON } from '../../../core/models/note-thread-doc';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { canInsertNote, formatFontSizeToRems } from '../../../shared/utils';

export interface NoteDialogData {
  threadId?: string;
  textDocId: TextDocId;
  projectId: string;
  verseRef?: VerseRef;
}

export const SF_NOTE_THREAD_PREFIX = 'SFNOTETHREAD_';

// TODO: Implement a diff - there is an accepted solution here that might be a good starting point:
// https://codereview.stackexchange.com/questions/133586/a-string-prototype-diff-implementation-text-diff

@Component({
  templateUrl: './note-dialog.component.html',
  styleUrls: ['./note-dialog.component.scss']
})
export class NoteDialogComponent implements OnInit {
  showSegmentText: boolean = false;
  currentNoteContent: string = '';
  private isAssignedToOtherUser: boolean = false;
  private threadDoc?: NoteThreadDoc;
  private projectProfileDoc?: SFProjectProfileDoc;
  private textDoc?: TextDoc;
  private paratextProjectUsers?: ParatextUserProfile[];
  private noteBeingEdited?: Note;

  constructor(
    private readonly dialogRef: MatDialogRef<NoteDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) private readonly data: NoteDialogData,
    private readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly dialogService: DialogService,
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

    this.noteBeingEdited = this.getNoteTemplate(this.threadId);
  }

  get noteThreadAssignedUserRef(): string {
    return this.threadDoc?.data?.assignment ?? '';
  }

  get flagIcon(): string {
    if (this.threadDoc?.data == null) {
      return defaultNoteThreadIcon(this.projectProfileDoc?.data?.tagIcon).url;
    }
    return this.isAssignedToOtherUser ? this.threadDoc.iconGrayed.url : this.threadDoc.icon.url;
  }

  get fontSize(): string | undefined {
    return formatFontSizeToRems(this.projectProfileDoc?.data?.defaultFontSize);
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

  get notesToDisplay(): Note[] {
    if (this.threadDoc?.data == null) {
      return [];
    }
    return sortBy(
      this.threadDoc.data.notes.filter(n => !n.deleted && n.dataId !== this.noteBeingEdited?.dataId),
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

  private get lastNoteId(): string | undefined {
    const notesCount: number = this.notesToDisplay.length;
    return notesCount > 0 ? this.notesToDisplay[notesCount - 1].dataId : undefined;
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

  editNote(note: Note): void {
    this.noteBeingEdited = cloneDeep(note);
    this.currentNoteContent = note.content ?? '';
  }

  async deleteNote(note: Note): Promise<void> {
    const confirmed: boolean = await this.dialogService.confirm(
      'note_dialog.permanently_delete_note',
      'note_dialog.delete'
    );
    if (!confirmed) return;

    if (this.notesToDisplay.length === 1) {
      if (this.threadDoc!.data!.notes.length === 1 && this.threadDoc!.data!.notes[0].dataId === note.dataId) {
        // only delete the thread if deleting the last note in the thread
        await this.threadDoc!.delete();
        this.dialogRef.close(true);
        return;
      }
    }
    const index: number = this.threadDoc!.data!.notes.findIndex(n => n.dataId === note.dataId);
    if (index >= 0) {
      await this.threadDoc!.submitJson0Op(op => op.remove(nt => nt.notes, index));
    }

    if (this.notesToDisplay.length === 0) {
      this.dialogRef.close(true);
    }
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

  isNoteEditable(note: Note): boolean {
    if (this.projectProfileDoc?.data == null) return false;
    return (
      this.isAddNotesEnabled &&
      note.dataId === this.lastNoteId &&
      this.noteBeingEdited?.dataId === '' &&
      SF_PROJECT_RIGHTS.hasRight(
        this.projectProfileDoc.data,
        this.userService.currentUserId,
        SFProjectDomain.Notes,
        Operation.Edit,
        note
      )
    );
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

  async submit(): Promise<void> {
    if (
      this.noteBeingEdited == null ||
      this.currentNoteContent == null ||
      this.currentNoteContent.trim().length === 0
    ) {
      this.dialogRef.close();
      return;
    }
    const verseRef: VerseRef | undefined = this.verseRef;
    if (verseRef == null) return;

    const currentDate = new Date().toJSON();
    if (this.noteBeingEdited.dataId === '') {
      this.noteBeingEdited.dataId = objectId();
      this.noteBeingEdited.dateCreated = currentDate;
    }
    this.noteBeingEdited.dateModified = currentDate;
    this.noteBeingEdited.content = this.currentNoteContent;

    await this.saveChanges(fromVerseRef(verseRef));
  }

  private async saveChanges(verseRef: VerseRefData): Promise<void> {
    if (this.noteBeingEdited == null) {
      this.dialogRef.close(false);
      return;
    }
    if (this.noteBeingEdited.threadId === '') {
      // create a new thread
      const threadId: string = SF_NOTE_THREAD_PREFIX + objectId();
      this.noteBeingEdited.threadId = threadId;
      const noteThread: NoteThread = {
        dataId: threadId,
        verseRef: verseRef,
        projectRef: this.projectId,
        ownerRef: this.userService.currentUserId,
        notes: [this.noteBeingEdited],
        position: { start: 0, length: 0 },
        originalContextBefore: '',
        originalSelectedText: this.segmentText,
        originalContextAfter: '',
        tagIcon: this.projectProfileDoc!.data!.tagIcon ?? DEFAULT_TAG_ICON,
        status: NoteStatus.Todo
      };
      await this.projectService.createNoteThread(this.projectId, noteThread);
      this.dialogRef.close(true);
      return;
    }

    // updated the existing note
    const noteIndex: number = this.threadDoc!.data!.notes.findIndex(n => n.dataId === this.noteBeingEdited!.dataId);
    if (noteIndex >= 0) {
      this.threadDoc!.submitJson0Op(op => {
        op.set(t => t.notes[noteIndex].content, this.noteBeingEdited!.content);
        op.set(t => t.notes[noteIndex].dateModified, this.noteBeingEdited!.dateModified);
      });
    } else {
      this.threadDoc!.submitJson0Op(op => op.add(t => t.notes, this.noteBeingEdited));
    }
    this.dialogRef.close(true);
  }

  private getNoteTemplate(threadId: string | undefined): Note {
    return {
      dataId: '',
      // thread id is the empty string when the note belongs to a new thread
      threadId: threadId ?? '',
      ownerRef: this.userService.currentUserId,
      content: '',
      dateCreated: '',
      dateModified: '',
      conflictType: NoteConflictType.DefaultValue,
      extUserId: this.userService.currentUserId,
      type: NoteType.Normal,
      status: NoteStatus.Todo,
      deleted: false
    };
  }
}
