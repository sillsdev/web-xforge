import { Component, Inject, OnInit } from '@angular/core';
import {
  MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA,
  MatLegacyDialogRef as MatDialogRef
} from '@angular/material/legacy-dialog';
import { translate } from '@ngneat/transloco';
import { sortBy } from 'lodash-es';
import { toVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Note, REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import {
  BIBLICAL_TERM_TAG_ICON,
  BIBLICAL_TERM_TAG_ID,
  NoteTag,
  SF_TAG_ICON
} from 'realtime-server/lib/esm/scriptureforge/models/note-tag';
import { AssignedUsers, NoteStatus } from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { VerseRef } from '@sillsdev/scripture';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UserService } from 'xforge-common/user.service';
import { isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { BiblicalTermDoc } from '../../../core/models/biblical-term-doc';
import { defaultNoteThreadIcon, NoteThreadDoc } from '../../../core/models/note-thread-doc';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { canInsertNote, formatFontSizeToRems, XmlUtils } from '../../../shared/utils';

export interface NoteDialogData {
  threadDataId?: string;
  textDocId: TextDocId;
  projectId: string;
  verseRef?: VerseRef;
  biblicalTermId?: string;
}

export interface NoteDialogResult {
  deleted?: boolean;
  noteContent?: string;
  noteDataId?: string;
  status?: NoteStatus;
}

interface NoteDisplayInfo {
  note: Note;
  content: string;
  icon: string;
  title: string;
  editable: boolean;
  assignment?: string;
  reattachedVerse?: string;
  reattachedText?: string;
}

// TODO: Implement a diff - there is an accepted solution here that might be a good starting point:
// https://codereview.stackexchange.com/questions/133586/a-string-prototype-diff-implementation-text-diff
// TODO: Refactor to have a Biblical Term Note Dialog subclass (will require spec.ts refactoring too)
@Component({
  templateUrl: './note-dialog.component.html',
  styleUrls: ['./note-dialog.component.scss']
})
export class NoteDialogComponent implements OnInit {
  showSegmentText: boolean = false;
  currentNoteContent: string = '';
  notesToDisplay: NoteDisplayInfo[] = [];
  saveOption: 'save' | 'resolve' = 'save';

  private biblicalTermDoc?: BiblicalTermDoc;
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
    private readonly dialogService: DialogService
  ) {}

  async ngOnInit(): Promise<void> {
    // This can be refactored so the asynchronous calls are done in parallel
    if (this.threadDataId == null) {
      this.textDoc = await this.projectService.getText(this.textDocId);
    } else {
      this.threadDoc = await this.projectService.getNoteThread(this.projectId + ':' + this.threadDataId);
      this.textDoc = await this.projectService.getText(this.textDocId);
    }

    if (this.biblicalTermId != null) {
      this.biblicalTermDoc = await this.projectService.getBiblicalTerm(this.projectId + ':' + this.biblicalTermId);
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
    // extract note info and content for display
    this.updateNotesToDisplay();
  }

  get canViewAssignedUser(): boolean {
    return isParatextRole(this.userRole);
  }

  get noteThreadAssignedUserRef(): string {
    return this.threadDoc?.data?.assignment ?? '';
  }

  get flagIcon(): string {
    if (this.biblicalTermId != null) return defaultNoteThreadIcon(BIBLICAL_TERM_TAG_ICON).url;
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

  get isBiblicalTermNote(): boolean {
    return this.data.biblicalTermId != null;
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

  get verseRefDisplay(): string {
    if (this.isBiblicalTermNote) return translate('note_dialog.biblical_term');
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
    return canInsertNote(this.projectProfileDoc.data, this.userService.currentUserId);
  }

  get canResolve(): boolean {
    if (this.threadDoc == null || this.projectProfileDoc?.data == null) return false;
    const userRole: string = this.projectProfileDoc.data.userRoles[this.userService.currentUserId];
    // A note thread can be resolved only by paratext users who have edit rights and when the thread has existing notes
    // Additionally, a thread can be tagged with a tag that restricts resolve
    return (
      this.canInsertNote &&
      this.threadDoc.canUserResolveThread(this.userService.currentUserId, userRole, this.noteTags) &&
      this.threadDataId != null
    );
  }

  private get defaultNoteTagId(): number | undefined {
    return this.projectProfileDoc?.data?.translateConfig.defaultNoteTagId;
  }

  private get noteTags(): NoteTag[] {
    // Return the project's note tags and the biblical terms note tag
    return (this.projectProfileDoc?.data?.noteTags ?? []).concat([
      { tagId: BIBLICAL_TERM_TAG_ID, icon: BIBLICAL_TERM_TAG_ICON, name: 'Biblical Term', creatorResolve: false }
    ]);
  }

  private get biblicalTermId(): string | undefined {
    return this.data.biblicalTermId;
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

  private get verseRef(): VerseRef | undefined {
    if (this.threadDoc?.data == null) {
      return this.data.verseRef == null ? undefined : this.data.verseRef;
    }
    return toVerseRef(this.threadDoc.data.verseRef);
  }

  editNote(note: Note): void {
    this.noteIdBeingEdited = note.dataId;
    this.currentNoteContent = XmlUtils.decodeFromXml(note.content ?? '');
    this.notesToDisplay.pop();
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

    this.updateNotesToDisplay();
    if (this.notesToDisplay.length === 0) {
      this.dialogRef.close({ deleted: true });
    }
  }

  getNoteContextText(plainText: boolean = false): string {
    if (this.isBiblicalTermNote) {
      if (this.threadDoc?.data?.extraHeadingInfo != null) {
        let termLang = this.threadDoc.data.extraHeadingInfo.language === 'greek' ? 'grc' : 'hbo';
        return (
          `<span lang="${termLang}">${this.threadDoc.data.extraHeadingInfo.lemma}</span> ` +
          `<span>(${this.threadDoc.data.extraHeadingInfo.transliteration})</span> ` +
          `<span>${this.threadDoc.data.extraHeadingInfo.gloss}</span>`
        );
      } else if (this.biblicalTermDoc?.data != null) {
        let termLang = this.biblicalTermDoc.data.language === 'greek' ? 'grc' : 'hbo';
        let biblicalTermGloss = this.biblicalTermDoc.getBiblicalTermGloss(
          this.i18n.localeCode,
          I18nService.defaultLocale.canonicalTag
        );
        return (
          `<span lang="${termLang}">${this.biblicalTermDoc.data.termId}</span> ` +
          `<span>(${this.biblicalTermDoc.data.transliteration})</span> ` +
          `<span>${biblicalTermGloss}</span>`
        );
      } else {
        return '';
      }
    } else {
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
  }

  getAssignedUserString(assignedNoteUserRef: string | undefined): string | undefined {
    if (assignedNoteUserRef == null) return;
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

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    if (this.saveOption === 'resolve') {
      return this.resolve();
    }

    if (this.currentNoteContent.trim().length === 0) {
      return this.close();
    }

    this.dialogRef.close({
      noteContent: XmlUtils.encodeForXml(this.currentNoteContent),
      noteDataId: this.noteIdBeingEdited
    });
  }

  toggleSegmentText(): void {
    this.showSegmentText = !this.showSegmentText;
  }

  private resolve(): void {
    if (this.currentNoteContent.trim().length === 0 && this.threadDataId == null) {
      // close the dialog without saving if resolving an empty thread
      return this.close();
    }
    const content: NoteDialogResult = { status: NoteStatus.Resolved };
    if (this.currentNoteContent.trim().length > 0) {
      content.noteContent = XmlUtils.encodeForXml(this.currentNoteContent);
    }
    this.dialogRef.close(content);
  }

  private updateNotesToDisplay(): void {
    if (this.threadDoc?.data == null) return;
    const sortedNotes: Note[] = sortBy(
      this.threadDoc.data.notes.filter(n => !n.deleted),
      n => new Date(n.dateCreated)
    );
    this.notesToDisplay = [];
    if (sortedNotes.length === 0) return;

    const lastNoteId: string = sortedNotes[sortedNotes.length - 1].dataId;
    for (const note of sortedNotes) {
      this.notesToDisplay.push({
        note,
        content: this.contentForDisplay(note),
        icon: this.noteIcon(note),
        title: this.noteTitle(note),
        editable: this.isNoteEditable(note) && note.dataId === lastNoteId,
        assignment: this.getAssignedUserString(note.assignment),
        reattachedVerse: this.reattachedVerse(note),
        reattachedText: this.reattachedText(note)
      });
    }
  }

  /** What to display for note content. Will be transformed for display, especially for a conflict note. */
  private contentForDisplay(note: Note): string {
    if (note == null) {
      return '';
    }
    return this.parseNote(note.content);
  }

  private parseNote(content: string | undefined): string {
    if (content == null) return '';
    return XmlUtils.convertXmlToHtml(content);
  }

  private noteIcon(note: Note): string {
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

  private noteTitle(note: Note): string {
    switch (note.status) {
      case NoteStatus.Todo:
        return translate('note_dialog.status_to_do');
      case NoteStatus.Done:
      case NoteStatus.Resolved:
        return translate('note_dialog.status_resolved');
    }
    return note.reattached != null ? translate('note_dialog.note_reattached') : '';
  }

  private isNoteEditable(note: Note): boolean {
    if (this.projectProfileDoc?.data == null) return false;
    return (
      note.editable === true &&
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

  private reattachedText(note: Note): string | undefined {
    if (note.reattached == null) return;
    const reattachedParts: string[] = note.reattached.split(REATTACH_SEPARATOR);
    const selectedText: string = reattachedParts[1];
    const contextBefore: string = reattachedParts[3];
    const contextAfter: string = reattachedParts[4];
    return contextBefore + '<b>' + selectedText + '</b>' + contextAfter;
  }

  private reattachedVerse(note: Note): string | undefined {
    if (note.reattached == null) return;
    const reattachedParts: string[] = note.reattached.split(REATTACH_SEPARATOR);
    const verseStr: string = reattachedParts[0];
    const vref: VerseRef = new VerseRef(verseStr);
    const verseRef: string = this.i18n.localizeReference(vref);
    const reattached: string = translate('note_dialog.reattached');
    return `${verseRef} ${reattached}`;
  }
}
