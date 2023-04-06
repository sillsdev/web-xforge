import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Sort } from '@angular/material/sort';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { BehaviorSubject, merge, Subscription } from 'rxjs';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { DialogService } from 'xforge-common/dialog.service';
import { NoticeService } from 'xforge-common/notice.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectService } from '../../core/sf-project.service';
import { BiblicalTermDoc } from '../../core/models/biblical-term-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { BiblicalTermDialogComponent, BiblicalTermDialogData } from './biblical-term-dialog.component';

class Row {
  private static readonly defaultLocaleCode = I18nService.defaultLocale.canonicalTag;

  constructor(
    public readonly biblicalTermDoc: BiblicalTermDoc,
    public readonly i18n: I18nService,
    private readonly projectUserConfigDoc?: SFProjectUserConfigDoc
  ) {}

  get id(): string {
    return this.biblicalTermDoc.id;
  }

  get term(): string {
    return this.projectUserConfigDoc?.data?.transliterateBiblicalTerms
      ? this.biblicalTermDoc.data?.transliteration ?? ''
      : this.biblicalTermDoc.data?.termId ?? '';
  }

  get category(): string {
    if (this.biblicalTermDoc.data?.definitions.hasOwnProperty(this.i18n.localeCode)) {
      return this.biblicalTermDoc.data.definitions[this.i18n.localeCode].categories.join(', ');
    } else if (this.biblicalTermDoc.data?.definitions.hasOwnProperty(Row.defaultLocaleCode)) {
      return this.biblicalTermDoc.data.definitions[Row.defaultLocaleCode].categories.join(', ');
    } else {
      return '';
    }
  }

  get gloss(): string {
    if (this.biblicalTermDoc.data?.definitions.hasOwnProperty(this.i18n.localeCode)) {
      return this.biblicalTermDoc.data.definitions[this.i18n.localeCode].gloss;
    } else if (this.biblicalTermDoc.data?.definitions.hasOwnProperty(Row.defaultLocaleCode)) {
      return this.biblicalTermDoc.data.definitions[Row.defaultLocaleCode].gloss;
    } else {
      return '';
    }
  }

  get renderings(): string {
    return this.biblicalTermDoc.data?.renderings.join(', ') ?? '';
  }
}

@Component({
  selector: 'app-biblical-terms',
  templateUrl: './biblical-terms.component.html',
  styleUrls: ['./biblical-terms.component.scss']
})
export class BiblicalTermsComponent extends DataLoadingComponent implements OnDestroy, OnInit {
  columnsToDisplay = ['term', 'category', 'gloss', 'renderings', 'id'];
  rows: Row[] = [];

  private biblicalTermQuery?: RealtimeQuery<BiblicalTermDoc>;
  private biblicalTermSub?: Subscription;
  private _bookNum?: number;
  private bookNum$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  private _chapter?: number;
  private chapter$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  private configProjectId$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  private projectId$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  private projectUserConfigDoc?: SFProjectUserConfigDoc;
  private _verse?: string;
  private verse$: BehaviorSubject<string> = new BehaviorSubject<string>('');

  @ViewChild('biblicalTerms', { read: ElementRef }) biblicalTerms?: ElementRef;

  constructor(
    noticeService: NoticeService,
    private readonly dialogService: DialogService,
    private readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    private readonly realtimeService: RealtimeService,
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

  @Input() set configProjectId(id: string | undefined) {
    if (id == null) {
      return;
    }
    this.configProjectId$.next(id);
  }

  @Input() set projectId(id: string | undefined) {
    if (id == null) {
      return;
    }
    this.projectId$.next(id);
  }

  @Input() set verse(verse: string | undefined) {
    if (verse == null || verse === '') {
      return;
    }
    this._verse = verse;
    this.verse$.next(verse);
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.bookNum$ != null) {
      this.bookNum$.unsubscribe();
    }
    if (this.chapter$ != null) {
      this.chapter$.unsubscribe();
    }
    if (this.verse$ != null) {
      this.verse$.unsubscribe();
    }
    if (this.projectId$ != null) {
      this.projectId$.unsubscribe();
    }
    if (this.biblicalTermQuery != null) {
      this.biblicalTermQuery.dispose();
    }
    if (this.biblicalTermSub != null) {
      this.biblicalTermSub.unsubscribe();
    }
  }

  ngOnInit(): void {
    this.subscribe(this.configProjectId$, async configProjectId => {
      this.projectUserConfigDoc = await this.projectService.getUserConfig(
        configProjectId,
        this.userService.currentUserId
      );
      this.filterBiblicalTerms(this._bookNum ?? 0, this._chapter ?? 0, this._verse);
    });
    this.subscribe(this.projectId$, async projectId => {
      this.loadBiblicalTerms(projectId);
      this.filterBiblicalTerms(this._bookNum ?? 0, this._chapter ?? 0, this._verse);
    });
    this.subscribe(this.bookNum$, bookNum => {
      this.filterBiblicalTerms(bookNum, this._chapter ?? 0, this._verse);
    });
    this.subscribe(this.chapter$, chapter => {
      this.filterBiblicalTerms(this._bookNum ?? 0, chapter, this._verse);
    });
    this.subscribe(this.verse$, verse => {
      this.filterBiblicalTerms(this._bookNum ?? 0, this._chapter ?? 0, verse);
    });
  }

  async editRendering(id: string): Promise<void> {
    var biblicalTermDoc = await this.realtimeService.subscribe<BiblicalTermDoc>(BiblicalTermDoc.COLLECTION, id);
    this.dialogService.openMatDialog<BiblicalTermDialogComponent, BiblicalTermDialogData>(BiblicalTermDialogComponent, {
      data: { biblicalTermDoc, projectUserConfigDoc: this.projectUserConfigDoc },
      width: '80vw'
    });
  }

  protected sortData(sort: Sort): void {
    const data = this.rows.slice();
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

    // Scroll biblical terms to the top
    this.biblicalTerms?.nativeElement.scrollIntoView();

    const rows: Row[] = [];
    let verses: number[] = new VerseRef(bookNum, chapter, verse).verses;
    for (const biblicalTermDoc of this.biblicalTermQuery?.docs || []) {
      let displayTerm = false;
      for (const bbbcccvvv of biblicalTermDoc.data?.references || []) {
        var verseRef = new VerseRef(bbbcccvvv);
        if (
          verseRef.bookNum === bookNum &&
          verseRef.chapterNum === chapter &&
          (verses.length === 0 ||
            verses[0] === 0 ||
            verses.includes(verseRef.verseNum) ||
            (verses.length === 2 && verseRef.verseNum >= verses[0] && verseRef.verseNum <= verses[1]))
        ) {
          displayTerm = true;
          break;
        }
      }
      if (displayTerm) {
        rows.push(new Row(biblicalTermDoc, this.i18n, this.projectUserConfigDoc));
      }
    }
    this.rows = rows;
    this.sortData({ active: this.columnsToDisplay[0], direction: 'asc' });

    this.loadingFinished();
  }

  private async loadBiblicalTerms(sfProjectId: string): Promise<void> {
    this.biblicalTermQuery?.dispose();

    this.biblicalTermQuery = await this.projectService.queryBiblicalTerms(sfProjectId);
    this.biblicalTermSub?.unsubscribe();
    this.biblicalTermSub = this.subscribe(
      merge(
        this.biblicalTermQuery.ready$,
        this.biblicalTermQuery.remoteChanges$,
        this.biblicalTermQuery.remoteDocChanges$
      ),
      () => {
        this.filterBiblicalTerms(this._bookNum ?? 0, this._chapter ?? 0, this._verse);
      }
    );
  }
}

function compare(a: string, b: string, isAsc: boolean): number {
  return (a.normalize('NFD').toLowerCase() < b.normalize('NFD').toLowerCase() ? -1 : 1) * (isAsc ? 1 : -1);
}
