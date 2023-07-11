import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { translate } from '@ngneat/transloco';
import { sortBy } from 'lodash-es';
import { toVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Note, REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { NoteTag, SF_TAG_ICON } from 'realtime-server/lib/esm/scriptureforge/models/note-tag';
import { AssignedUsers, NoteStatus } from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UserService } from 'xforge-common/user.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { defaultNoteThreadIcon, NoteThreadDoc } from '../../../core/models/note-thread-doc';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { canInsertNote, formatFontSizeToRems } from '../../../shared/utils';

export interface NoteDialogData {
  threadDataId?: string;
  textDocId: TextDocId;
  projectId: string;
  verseRef?: VerseRef;
}

export interface NoteDialogResult {
  deleted?: boolean;
  noteContent?: string;
  noteDataId?: string;
}

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
  private noteIdBeingEdited?: string;
  private userRole?: string;

  constructor(
    private readonly dialogRef: MatDialogRef<NoteDialogComponent, NoteDialogResult | undefined>,
    @Inject(MAT_DIALOG_DATA) private readonly data: NoteDialogData,
    private readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly dialogService: DialogService,
    private readonly featureFlags: FeatureFlagService
  ) {}

  async ngOnInit(): Promise<void> {
    // This can be refactored so the asynchronous calls are done in parallel
    if (this.threadDataId == null) {
      this.textDoc = await this.projectService.getText(this.textDocId);
    } else {
      this.threadDoc = await this.projectService.getNoteThread(this.projectId + ':' + this.threadDataId);
      this.textDoc = await this.projectService.getText(this.textDocId);
    }

    this.projectProfileDoc = await this.projectService.getProfile(this.projectId);
    this.userRole = this.projectProfileDoc?.data?.userRoles[this.userService.currentUserId];
    if (this.userRole != null) {
      const projectDoc: SFProjectDoc | undefined = await this.projectService.tryGetForRole(
        this.projectId,
        this.userRole
      );
      if (this.threadDoc != null && projectDoc != null && projectDoc.data?.paratextUsers != null) {
        this.paratextProjectUsers = projectDoc.data.paratextUsers;
        this.isAssignedToOtherUser = this.threadDoc.isAssignedToOtherUser(
          this.userService.currentUserId,
          this.paratextProjectUsers
        );
      }
    }
  }

  get canViewAssignedUser(): boolean {
    return isParatextRole(this.userRole);
  }

  get noteThreadAssignedUserRef(): string {
    return this.threadDoc?.data?.assignment ?? '';
  }

  get flagIcon(): string {
    if (this.threadDoc?.data == null) {
      if (this.defaultNoteTagId == null) return defaultNoteThreadIcon(SF_TAG_ICON).url;
      const noteTag: NoteTag | undefined = this.noteTags.find(t => t.tagId === this.defaultNoteTagId);
      return defaultNoteThreadIcon(noteTag?.icon).url;
    }
    return this.isAssignedToOtherUser
      ? this.threadDoc.getIconGrayed(this.noteTags).url
      : this.threadDoc.getIcon(this.noteTags).url;
  }

  get fontSize(): string | undefined {
    return formatFontSizeToRems(this.projectProfileDoc?.data?.defaultFontSize);
  }

  get isNewNote(): boolean {
    return this.data.threadDataId == null;
  }

  get isRtl(): boolean {
    if (this.projectProfileDoc?.data == null) {
      return false;
    }
    return this.projectProfileDoc.data.isRightToLeft ?? false;
  }

  get isSegmentDifferentFromContext(): boolean {
    return this.getNoteContextText(true) !== this.segmentText;
  }

  get notesToDisplay(): Note[] {
    if (this.threadDoc?.data == null) {
      return [];
    }
    return sortBy(
      this.threadDoc.data.notes.filter(n => !n.deleted && n.dataId !== this.noteIdBeingEdited),
      n => new Date(n.dateCreated)
    );
  }

  get verseRefDisplay(): string {
    const verseRef: VerseRef | undefined = this.verseRef;
    return verseRef == null ? '' : this.i18n.localizeReference(verseRef);
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
    return this.textDoc.getSegmentTextIncludingRelated(verseRef.verse ?? verseRef.verseNum);
  }

  get canInsertNote(): boolean {
    if (this.projectProfileDoc?.data == null) return false;
    return this.isAddNotesEnabled && canInsertNote(this.projectProfileDoc.data, this.userService.currentUserId);
  }

  private get defaultNoteTagId(): number | undefined {
    return this.projectProfileDoc?.data?.translateConfig.defaultNoteTagId;
  }

  private get noteTags(): NoteTag[] {
    return this.projectProfileDoc?.data?.noteTags ?? [];
  }

  /** What to display for note content. Will be transformed for display, especially for a conflict note. */
  contentForDisplay(note: Note): string {
    if (note == null) {
      return '';
    }
    return this.parseNote(note.content);
  }

  getNoteContextText(plainText: boolean = false): string {
    if (this.threadDoc?.data == null) {
      return '';
    }
    return (
      this.threadDoc.data.originalContextBefore +
      (plainText ? '' : '<b>') +
      this.threadDoc.data.originalSelectedText +
      (plainText ? '' : '</b>') +
      this.threadDoc.data.originalContextAfter
    );
  }

  private get projectId(): string {
    return this.data.projectId;
  }

  private get textDocId(): string {
    return this.data.textDocId.toString();
  }

  private get threadDataId(): string | undefined {
    return this.data.threadDataId;
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
    this.noteIdBeingEdited = note.dataId;
    this.currentNoteContent = note.content ?? '';
  }

  async deleteNote(note: Note): Promise<void> {
    const confirmed: boolean = await this.dialogService.confirm(
      'note_dialog.permanently_delete_note',
      'note_dialog.delete'
    );
    if (!confirmed) return;

    const index: number = this.threadDoc!.data!.notes.findIndex(n => n.dataId === note.dataId);
    if (index >= 0) {
      await this.threadDoc!.submitJson0Op(op => op.set(nt => nt.notes[index].deleted, true));
    }

    if (this.notesToDisplay.length === 0) {
      this.dialogRef.close({ deleted: true });
    }
  }

  parseNote(content: string | undefined): string {
    const replace = new Map<RegExp, string>();
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

  noteIcon(note: Note): string {
    if (this.threadDoc?.data == null) {
      return '';
    }
    switch (note.status) {
      case NoteStatus.Todo:
        return this.threadDoc.getNoteIcon(note, this.noteTags).url;
      case NoteStatus.Done:
      case NoteStatus.Resolved:
        return this.threadDoc.getNoteResolvedIcon(note, this.noteTags).url;
    }
    const noteIcon: string = this.threadDoc.getNoteIcon(note, this.noteTags).url;
    return note.reattached != null && noteIcon === '' ? this.threadDoc.iconReattached.url : noteIcon;
  }

  noteTitle(note: Note): string {
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
      this.noteIdBeingEdited == null &&
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
    return contextBefore + '<b>' + selectedText + '</b>' + contextAfter;
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
    if (this.currentNoteContent == null || this.currentNoteContent.trim().length === 0) {
      this.dialogRef.close();
      return;
    }

    this.dialogRef.close({
      noteContent: this.currentNoteContent,
      noteDataId: this.noteIdBeingEdited
    });
  }
}
