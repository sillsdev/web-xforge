import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { sortBy } from 'lodash-es';
import { toVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Note, REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { I18nService } from 'xforge-common/i18n.service';
import { AssignedUsers, NoteStatus } from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { translate } from '@ngneat/transloco';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { NoteThreadDoc } from '../../../core/models/note-thread-doc';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';

export interface NoteDialogData {
  threadId: string;
  projectId: string;
}

// TODO: Implement a diff - there is an accepted solution here that might be a good starting point:
// https://codereview.stackexchange.com/questions/133586/a-string-prototype-diff-implementation-text-diff

@Component({
  templateUrl: './note-dialog.component.html',
  styleUrls: ['./note-dialog.component.scss']
})
export class NoteDialogComponent implements OnInit {
  showSegmentText: boolean = false;
  private threadDoc?: NoteThreadDoc;
  private projectProfileDoc?: SFProjectProfileDoc;
  private textDoc?: TextDoc;
  private paratextProjectUsers?: ParatextUserProfile[];

  constructor(
    @Inject(MAT_DIALOG_DATA) private readonly data: NoteDialogData,
    private readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {}

  async ngOnInit(): Promise<void> {
    this.threadDoc = await this.projectService.getNoteThread(this.projectId + ':' + this.threadId);
    this.textDoc = await this.projectService.getText(this.textDocId);
    this.projectProfileDoc = await this.projectService.getProfile(this.projectId);
    const userRole = this.projectProfileDoc?.data?.userRoles[this.userService.currentUserId];
    if (userRole != null) {
      const projectDoc: SFProjectDoc | undefined = await this.projectService.tryGetForRole(this.projectId, userRole);
      if (projectDoc != null && projectDoc.data?.paratextUsers != null) {
        this.paratextProjectUsers = projectDoc.data.paratextUsers;
      }
    }
  }

  get noteThreadAssignedUserRef(): string | undefined {
    return this.threadDoc?.data?.assignment;
  }

  get flagIcon(): string {
    if (this.threadDoc?.data == null) {
      return '';
    }
    return this.threadDoc.icon.url;
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

  get verseRef(): string {
    if (this.threadDoc?.data == null) {
      return '';
    }
    const verseRef = toVerseRef(this.threadDoc.data.verseRef);
    return this.i18n.localizeReference(verseRef);
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
    if (this.textDoc?.data == null || this.threadDoc?.data == null) {
      return '';
    }
    const verseRef = toVerseRef(this.threadDoc.data.verseRef);
    return this.textDoc.getSegmentTextIncludingRelated(`verse_${verseRef.chapter}_${verseRef.verse}`);
  }

  private get projectId(): string {
    return this.data.projectId;
  }

  private get textDocId(): string {
    if (this.threadDoc?.data == null) {
      return '';
    }
    const verseRef = toVerseRef(this.threadDoc.data.verseRef);
    const textDocId = new TextDocId(this.projectId, verseRef.bookNum, verseRef.chapterNum);
    return textDocId.toString();
  }

  private get threadId(): string {
    return this.data.threadId;
  }

  parseNote(content: string | undefined): string {
    const replace = new Map<RegExp, string>();
    replace.set(/<bold>(.*)<\/bold>/gim, '<b>$1</b>'); // Bold style
    replace.set(/<italic>(.*)<\/italic>/gim, '<i>$1</i>'); // Italic style
    replace.set(/<p>(.*)<\/p>/gim, '$1<br />'); // Turn paragraphs into line breaks
    replace.set(/<(?!i|b|br|\/)(.*?>)(.*?)<\/(.*?)>/gim, '$2'); // Strip out any tags that don't match the above replacements
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
    return note.reattached != null ? this.threadDoc.iconReattached.url : this.threadDoc.getNoteIcon(note).url;
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
    return paratextUser?.username || translate('note_dialog.paratext_user');
  }
}
