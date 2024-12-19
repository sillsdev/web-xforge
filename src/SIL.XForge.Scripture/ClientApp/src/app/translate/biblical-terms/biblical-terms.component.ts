import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Sort } from '@angular/material/sort';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { getBiblicalTermDocId } from 'realtime-server/lib/esm/scriptureforge/models/biblical-term';
import { Note } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { BIBLICAL_TERM_TAG_ID } from 'realtime-server/lib/esm/scriptureforge/models/note-tag';
import {
  NoteConflictType,
  NoteStatus,
  NoteThread,
  NoteType,
  getNoteThreadDocId
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { fromVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { BehaviorSubject, Observable, Subscription, combineLatest, firstValueFrom, merge } from 'rxjs';
import { filter } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { BiblicalTermDoc } from '../../core/models/biblical-term-doc';
import { NoteThreadDoc } from '../../core/models/note-thread-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { XmlUtils, getVerseNumbers } from '../../shared/utils';
import { SaveNoteParameters } from '../editor/editor.component';
import { NoteDialogComponent, NoteDialogData, NoteDialogResult } from '../editor/note-dialog/note-dialog.component';
import { BiblicalTermDialogComponent, BiblicalTermDialogData } from './biblical-term-dialog.component';

// Material icons matching the biblical term's notes status
export enum BiblicalTermNoteIcon {
  AddNotesIcon = 'add_comment',
  NoNotesIcon = 'comment',
  ReadNotesIcon = 'chat',
  ResolvedNotesIcon = 'mark_chat_read',
  UnreadNotesIcon = 'mark_unread_chat_alt'
}

// Material icons matching the biblical term dialog's functionality for the user
export enum BiblicalTermDialogIcon {
  View = 'open_in_new',
  Edit = 'edit'
}

// This value is used in the row and component
const defaultLocaleCode = I18nService.defaultLocale.canonicalTag;

type RangeFilter = 'current_verse' | 'current_chapter' | 'current_book';

class Row {
  constructor(
    private readonly biblicalTermDoc: BiblicalTermDoc,
    private readonly i18n: I18nService,
    private readonly projectDoc?: SFProjectProfileDoc,
    private readonly projectUserConfigDoc?: SFProjectUserConfigDoc,
    private readonly noteThreadDoc?: NoteThreadDoc
  ) {}

  get id(): string | undefined {
    return this.biblicalTermDoc.data?.dataId;
  }

  get term(): string {
    return this.projectUserConfigDoc?.data?.transliterateBiblicalTerms
      ? (this.biblicalTermDoc.data?.transliteration ?? '')
      : (this.biblicalTermDoc.data?.termId ?? '');
  }

  get category(): string {
    return this.biblicalTermDoc?.getBiblicalTermCategory(this.i18n.localeCode, defaultLocaleCode) ?? '';
  }

  get gloss(): string {
    return this.biblicalTermDoc?.getBiblicalTermGloss(this.i18n.localeCode, defaultLocaleCode) ?? '';
  }

  get renderings(): string {
    return this.biblicalTermDoc.data?.renderings.join(', ') ?? '';
  }

  get noteDataId(): string | undefined {
    return this.noteThreadDoc?.data?.dataId;
  }

  get noteThreadId(): string | undefined {
    return this.noteThreadDoc?.data?.threadId;
  }

  get disableNotesIcon(): boolean {
    return !this.hasNoteThread && !this.canAddNotes;
  }

  get transformNotesIcon(): string {
    return this.hasNoteThread ? '' : 'scaleX(-1)';
  }

  get editIcon(): string {
    return this.canEdit ? BiblicalTermDialogIcon.Edit : BiblicalTermDialogIcon.View;
  }

  get notesIcon(): string {
    if (!this.hasNoteThread) {
      if (this.canAddNotes) {
        return BiblicalTermNoteIcon.AddNotesIcon;
      } else {
        return BiblicalTermNoteIcon.NoNotesIcon;
      }
    } else if (this.hasNoteThreadResolved) {
      return BiblicalTermNoteIcon.ResolvedNotesIcon;
    } else if (this.hasUnreadNotes) {
      return BiblicalTermNoteIcon.UnreadNotesIcon;
    } else {
      return BiblicalTermNoteIcon.ReadNotesIcon;
    }
  }

  get canEdit(): boolean {
    const userRole: string | undefined =
      this.projectUserConfigDoc?.data?.ownerRef != null
        ? this.projectDoc?.data?.userRoles[this.projectUserConfigDoc.data.ownerRef]
        : undefined;
    return userRole == null
      ? false
      : SF_PROJECT_RIGHTS.roleHasRight(userRole, SFProjectDomain.BiblicalTerms, Operation.Edit);
  }

  private get canAddNotes(): boolean {
    const userRole: string | undefined =
      this.projectUserConfigDoc?.data?.ownerRef != null
        ? this.projectDoc?.data?.userRoles[this.projectUserConfigDoc.data.ownerRef]
        : undefined;
    const hasNotePermission: boolean =
      userRole == null ? false : SF_PROJECT_RIGHTS.roleHasRight(userRole, SFProjectDomain.Notes, Operation.Create);
    return hasNotePermission;
  }

  private get hasUnreadNotes(): boolean {
    if (this.noteThreadDoc?.data == null || this.projectUserConfigDoc?.data == null) return false;
    // look for any note that has not been read and was authored by another user
    const noteRefsRead: string[] = this.projectUserConfigDoc.data.noteRefsRead;
    return this.noteThreadDoc.data.notes.some(
      n => n.ownerRef !== this.projectUserConfigDoc?.data?.ownerRef && !noteRefsRead.includes(n.dataId) && !n.deleted
    );
  }

  private get hasNoteThread(): boolean {
    return this.noteThreadDoc?.data != null && this.noteThreadDoc.data.notes.filter(n => !n.deleted).length > 0;
  }

  private get hasNoteThreadResolved(): boolean {
    // Get the non-deleted notes in date order descending
    let notes =
      this.noteThreadDoc?.data?.notes
        .filter(n => !n.deleted)
        .sort((a, b) => Date.parse(a.dateCreated) - Date.parse(b.dateCreated)) ?? [];
    // Return true if the last note is resolved
    return notes.length > 0 && notes[notes.length - 1].status === NoteStatus.Resolved;
  }
}

@Component({
  selector: 'app-biblical-terms',
  templateUrl: './biblical-terms.component.html',
  styleUrls: ['./biblical-terms.component.scss'],
  standalone: true,
  imports: [CommonModule, TranslocoModule, UICommonModule]
})
export class BiblicalTermsComponent extends DataLoadingComponent implements OnDestroy, OnInit {
  categories: string[] = [];
  readonly columnsToDisplay = ['term', 'category', 'gloss', 'renderings', 'id'];
  readonly rangeFilters: RangeFilter[] = ['current_verse', 'current_chapter', 'current_book'];
  rows: Row[] = [];
  biblicalTermsLoaded: boolean = false;

  private biblicalTermQuery?: RealtimeQuery<BiblicalTermDoc>;
  private biblicalTermSub?: Subscription;
  private _bookNum?: number;
  private bookNum$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  private categoriesLoading = false;
  private _chapter?: number;
  private chapter$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  private noteThreadQuery?: RealtimeQuery<NoteThreadDoc>;
  private _projectId?: string;
  private projectId$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  private projectDoc?: SFProjectProfileDoc;
  private projectUserConfigDoc?: SFProjectUserConfigDoc;
  private _verse?: string;
  private verse$: BehaviorSubject<string> = new BehaviorSubject<string>('');

  @ViewChild('biblicalTerms', { read: ElementRef }) biblicalTerms?: ElementRef;

  constructor(
    noticeService: NoticeService,
    readonly i18n: I18nService,
    private readonly dialogService: DialogService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {
    super(noticeService);
  }

  @Input() set bookNum(bookNum: number | undefined) {
    if (bookNum == null || bookNum === 0) {
      return;
    }
    this._bookNum = bookNum;
    this.bookNum$.next(bookNum);
  }

  @Input() set chapter(chapter: number | undefined) {
    if (chapter == null || chapter === 0) {
      return;
    }
    this._chapter = chapter;
    this.chapter$.next(chapter);
  }

  @Input() set projectId(id: string | undefined) {
    if (id == null) {
      return;
    }
    this._projectId = id;
    this.projectId$.next(id);
  }

  @Input() set verse(verse: string | undefined) {
    if (verse == null || verse === '') {
      return;
    }
    this._verse = verse;
    this.verse$.next(verse);
  }

  get appOnline(): boolean {
    return this.onlineStatusService.isOnline && this.onlineStatusService.isBrowserOnline;
  }

  get selectedCategory(): string {
    // To stop visual glitches in the dropdown while the categories are loading, return the category as all
    if (this.categoriesLoading) {
      return 'show_all';
    } else {
      return this.projectUserConfigDoc?.data?.selectedBiblicalTermsCategory ?? 'show_all';
    }
  }

  set selectedCategory(value: string | undefined) {
    if (this.selectedCategory !== value) {
      // Store the default dropdown value of show_all as undefined in the database
      if (value === '' || value === 'show_all') value = undefined;
      this.projectUserConfigDoc?.submitJson0Op(op => op.set(puc => puc.selectedBiblicalTermsCategory, value));
      this.filterBiblicalTerms(this._bookNum ?? 0, this._chapter ?? 0, this._verse);
    }
  }

  get selectedRangeFilter(): string {
    return this.projectUserConfigDoc?.data?.selectedBiblicalTermsFilter ?? 'current_verse';
  }

  set selectedRangeFilter(value: string | undefined) {
    if (this.selectedRangeFilter !== value) {
      // Store the default dropdown value of submitJson0Op as undefined in the database
      if (value === '' || value === 'current_verse') value = undefined;
      this.projectUserConfigDoc?.submitJson0Op(op => op.set(puc => puc.selectedBiblicalTermsFilter, value));
      this.filterBiblicalTerms(this._bookNum ?? 0, this._chapter ?? 0, this._verse);
    }
  }

  get transliterateBiblicalTerms(): boolean {
    return this.projectUserConfigDoc?.data?.transliterateBiblicalTerms ?? false;
  }

  set transliterateBiblicalTerms(value: boolean) {
    this.projectUserConfigDoc?.submitJson0Op(op => op.set<boolean>(puc => puc.transliterateBiblicalTerms, value));
  }

  get selectedReferenceForCaption(): string {
    if ((this._bookNum ?? 0) === 0) {
      return '';
    } else if ((this._chapter ?? 0) === 0) {
      return ` (${this.i18n.localizeBook(this._bookNum ?? 0)})`;
    } else if ((this._verse ?? '0') === '0') {
      return ` (${this.i18n.localizeBook(this._bookNum ?? 0)} ${this._chapter})`;
    } else {
      let verseRef = new VerseRef(Canon.bookNumberToId(this._bookNum!), this._chapter!.toString(), this._verse!);
      return ` (${this.i18n.localizeReference(verseRef)})`;
    }
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.biblicalTermQuery?.dispose();
    this.biblicalTermSub?.unsubscribe();
  }

  ngOnInit(): void {
    this.subscribe(this.projectId$.pipe(filter(projectId => projectId !== '')), async projectId => {
      this.projectDoc = await this.projectService.getProfile(projectId);
      this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);

      // Subscribe to any project, book, chapter, verse, locale, biblical term, or note changes
      this.loadingStarted();
      this.categoriesLoading = true;
      const biblicalTermsAndNotesChanges$: Observable<any> = await this.getBiblicalTermsAndNotesChanges(projectId);

      this.biblicalTermSub?.unsubscribe();

      this.biblicalTermSub = this.subscribe(
        combineLatest([
          this.bookNum$,
          this.chapter$,
          this.verse$,
          this.i18n.locale$,
          biblicalTermsAndNotesChanges$
        ]).pipe(filter(([bookNum, chapter, verse]) => bookNum !== 0 && chapter !== 0 && verse !== null)),
        ([bookNum, chapter, verse]) => {
          this.filterBiblicalTerms(bookNum, chapter, verse);
          this.categoriesLoading = false;
        }
      );

      if (!this.appOnline && biblicalTermsAndNotesChanges$.pipe(filter(val => val == null))) {
        this.loadingFinished();
      } else {
        this.biblicalTermsLoaded = true;
      }
    });
  }

  async editNoteThread(row: Row): Promise<void> {
    if (this._projectId == null || this._bookNum == null || this._chapter == null) {
      return;
    }
    const noteDialogData: NoteDialogData = {
      biblicalTermId: row.id,
      projectId: this._projectId,
      textDocId: new TextDocId(this._projectId, this._bookNum, this._chapter),
      threadDataId: row.noteDataId
    };
    const dialogRef = this.dialogService.openMatDialog<NoteDialogComponent, NoteDialogData, NoteDialogResult>(
      NoteDialogComponent,
      {
        autoFocus: true,
        width: '600px',
        disableClose: true,
        data: noteDialogData
      }
    );
    const result: NoteDialogResult | undefined = await firstValueFrom(dialogRef.afterClosed());
    if (result != null) {
      if (result.noteContent != null || result.status != null) {
        await this.saveNote({
          content: result.noteContent,
          threadDataId: row.noteDataId,
          dataId: result.noteDataId,
          biblicalTermId: row.id,
          status: result.status
        });
      }
    }
    this.updateReadNotes(row.noteThreadId);
  }

  async editRendering(id: string): Promise<void> {
    var biblicalTermDoc = await this.projectService.getBiblicalTerm(getBiblicalTermDocId(this._projectId!, id));
    this.dialogService.openMatDialog<BiblicalTermDialogComponent, BiblicalTermDialogData>(BiblicalTermDialogComponent, {
      data: { biblicalTermDoc, projectDoc: this.projectDoc, projectUserConfigDoc: this.projectUserConfigDoc },
      width: '560px'
    });
  }

  protected sortData(sort: Sort): void {
    const data: Row[] = this.rows.slice();
    if (!sort.active || sort.direction === '') {
      this.rows = data;
    } else {
      this.rows = data.sort((a, b) => compare(a[sort.active], b[sort.active], sort.direction === 'asc'));
    }
  }

  private filterBiblicalTerms(bookNum: number, chapter: number, verse: string | undefined): void {
    if (bookNum === 0 || chapter === 0 || verse == null) {
      return;
    }
    this.loadingStarted();

    const categories = new Set<string>();
    const rangeRows: Row[] = [];
    const rangeAndCategoryRows: Row[] = [];
    let verses: number[] = getVerseNumbers(new VerseRef(Canon.bookNumberToId(bookNum), chapter.toString(), verse));
    for (const biblicalTermDoc of this.biblicalTermQuery?.docs || []) {
      let matchesRange = false;
      // Filter by verse, chapter, or book
      for (const bbbcccvvv of biblicalTermDoc.data?.references || []) {
        var verseRef = new VerseRef(bbbcccvvv);
        if (this.selectedRangeFilter === 'current_book' && verseRef.bookNum === bookNum) {
          matchesRange = true;
          break;
        } else if (
          this.selectedRangeFilter === 'current_chapter' &&
          verseRef.bookNum === bookNum &&
          verseRef.chapterNum === chapter
        ) {
          matchesRange = true;
          break;
        } else if (
          this.selectedRangeFilter === 'current_verse' &&
          verseRef.bookNum === bookNum &&
          verseRef.chapterNum === chapter &&
          (verses.length === 0 ||
            verses[0] === 0 ||
            verses.includes(verseRef.verseNum) ||
            (verses.length === 2 && verseRef.verseNum >= verses[0] && verseRef.verseNum <= verses[1]))
        ) {
          matchesRange = true;
          break;
        }
      }

      // Get the category
      const category: string | undefined = biblicalTermDoc?.getBiblicalTermCategory(
        this.i18n.localeCode,
        defaultLocaleCode
      );
      let termCategories: string[] = [];
      if (category != null) {
        // Categories are localized in the biblical terms document, and comma separated
        termCategories = category.split(',');
        for (let categoryName of termCategories) categories.add(categoryName.trim());
      }

      // If we are filtering by category, exclude terms without the specified category
      let matchesCategory = matchesRange;
      if (
        matchesRange &&
        this.selectedCategory !== 'show_all' &&
        termCategories.length > 0 &&
        !termCategories.includes(this.selectedCategory)
      ) {
        matchesCategory = false;
      }

      if (matchesRange) {
        let noteThreadDoc: NoteThreadDoc | undefined;

        // The code points will often be different, so we need to normalize the strings
        const biblicalTermId: string | undefined = biblicalTermDoc.data?.termId.normalize('NFD');
        if (biblicalTermId != null) {
          const noteThreadIndex =
            this.noteThreadQuery?.docs.findIndex(nt => nt.data?.biblicalTermId?.normalize('NFD') === biblicalTermId) ??
            -1;
          if (noteThreadIndex > -1) {
            noteThreadDoc = this.noteThreadQuery?.docs[noteThreadIndex];
          }
        }

        // Add the row to the two arrays so we can select all if the category is missing
        const row = new Row(biblicalTermDoc, this.i18n, this.projectDoc, this.projectUserConfigDoc, noteThreadDoc);
        rangeRows.push(row);
        if (matchesCategory) {
          rangeAndCategoryRows.push(row);
        }
      }
    }

    this.categories = Array.from(categories).sort();

    // If we do not have the same category, show all rows in the range
    if (!this.categories.includes(this.selectedCategory) && this.selectedCategory !== 'show_all') {
      this.selectedCategory = 'show_all';
      this.rows = rangeRows;
    } else {
      this.rows = rangeAndCategoryRows;
    }

    this.sortData({ active: this.columnsToDisplay[0], direction: 'asc' });

    this.loadingFinished();
  }

  private async getBiblicalTermsAndNotesChanges(sfProjectId: string): Promise<Observable<any>> {
    // Clean up existing queries
    this.biblicalTermQuery?.dispose();
    this.noteThreadQuery?.dispose();

    // Get the Biblical Terms and Notes
    [this.biblicalTermQuery, this.noteThreadQuery] = await Promise.all([
      this.projectService.queryBiblicalTerms(sfProjectId),
      this.projectService.queryBiblicalTermNoteThreads(sfProjectId)
    ]);

    // Return a merged observable to monitor changes

    return merge(
      this.biblicalTermQuery.ready$.pipe(filter(isReady => isReady)),
      this.biblicalTermQuery.remoteChanges$,
      this.biblicalTermQuery.remoteDocChanges$,
      this.noteThreadQuery.localChanges$,
      this.noteThreadQuery.ready$.pipe(filter(isReady => isReady)),
      this.noteThreadQuery.remoteChanges$,
      this.noteThreadQuery.remoteDocChanges$
    );
  }

  /**
   * Saves the note for the Biblical Term.
   *
   * This is based on the code in EditorComponent.saveNote()
   */
  async saveNote(params: SaveNoteParameters): Promise<void> {
    if (this._projectId == null) {
      return;
    }
    if (params.biblicalTermId == null) {
      return;
    }
    const biblicalTermDoc = await this.projectService.getBiblicalTerm(
      getBiblicalTermDocId(this._projectId!, params.biblicalTermId)
    );
    if (biblicalTermDoc?.data == null) {
      return;
    }

    // Paratext uses the first reference of a Biblical Term for the note verse reference
    let verseRef: VerseRef;
    if (biblicalTermDoc.data.references.length > 0) {
      verseRef = new VerseRef(biblicalTermDoc.data.references[0]);
    } else {
      verseRef = new VerseRef(
        Canon.bookNumberToId(this._bookNum ?? 0),
        (this._chapter ?? 0).toString(),
        this._verse ?? '0'
      );
    }

    const currentDate: string = new Date().toJSON();
    const threadId = `BT_${biblicalTermDoc.data.termId}`;
    const noteContent: string | undefined = params.content == null ? undefined : XmlUtils.encodeForXml(params.content);
    // Configure the note
    const note: Note = {
      dateCreated: currentDate,
      dateModified: currentDate,
      dataId: params.dataId ?? objectId(),
      threadId,
      tagId: BIBLICAL_TERM_TAG_ID,
      ownerRef: this.userService.currentUserId,
      content: noteContent,
      conflictType: NoteConflictType.DefaultValue,
      type: NoteType.Normal,
      status: params.status ?? NoteStatus.Todo,
      deleted: false,
      editable: true,
      versionNumber: 1
    };
    if (params.threadDataId == null) {
      // Create a new thread
      const noteThread: NoteThread = {
        dataId: objectId(),
        threadId,
        verseRef: fromVerseRef(verseRef),
        projectRef: this._projectId,
        ownerRef: this.userService.currentUserId,
        notes: [note],
        position: { start: 0, length: 0 },
        originalContextBefore: '',
        originalSelectedText: '',
        originalContextAfter: '',
        status: NoteStatus.Todo,
        publishedToSF: true,
        biblicalTermId: biblicalTermDoc.data.termId,
        extraHeadingInfo: {
          gloss: biblicalTermDoc.getBiblicalTermGloss(this.i18n.localeCode, defaultLocaleCode),
          language: biblicalTermDoc.data.language,
          lemma: biblicalTermDoc.data.termId,
          transliteration: biblicalTermDoc.data.transliteration
        }
      };
      await this.projectService.createNoteThread(this._projectId, noteThread);
    } else {
      // updated the existing note
      const threadDoc: NoteThreadDoc = await this.projectService.getNoteThread(
        getNoteThreadDocId(this._projectId, params.threadDataId)
      );
      const noteIndex: number = threadDoc.data!.notes.findIndex(n => n.dataId === params.dataId);
      if (noteIndex >= 0) {
        await threadDoc!.submitJson0Op(op => {
          op.set(t => t.notes[noteIndex].content, noteContent);
          op.set(t => t.notes[noteIndex].dateModified, currentDate);
        });
      } else {
        note.threadId = threadDoc.data!.threadId;
        await threadDoc.submitJson0Op(op => {
          op.add(t => t.notes, note);
          // also set the status of the thread to be the status of the note
          op.set(t => t.status, note.status);
        });
      }
    }
  }

  private updateReadNotes(threadId: string | undefined): void {
    if (threadId == null) return;
    const noteThread: NoteThreadDoc | undefined = this.noteThreadQuery?.docs.find(d => d.data?.threadId === threadId);
    if (noteThread?.data != null && this.projectUserConfigDoc?.data != null) {
      const notesRead: string[] = [];
      for (const note of noteThread.data.notes) {
        if (!this.projectUserConfigDoc.data.noteRefsRead.includes(note.dataId)) {
          notesRead.push(note.dataId);
        }
      }

      if (notesRead.length === 0) {
        return;
      }

      this.projectUserConfigDoc.submitJson0Op(op => {
        for (const noteId of notesRead) {
          op.add(puc => puc.noteRefsRead, noteId);
        }
      });
    }
  }
}

function compare(a: string, b: string, isAsc: boolean): number {
  return (a.normalize('NFD').toLowerCase() < b.normalize('NFD').toLowerCase() ? -1 : 1) * (isAsc ? 1 : -1);
}
