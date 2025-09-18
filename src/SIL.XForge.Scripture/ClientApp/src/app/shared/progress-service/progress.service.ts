import { DestroyRef, Injectable, OnDestroy } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { asyncScheduler, merge, startWith, Subscription, tap, throttleTime } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';

/**
 * The expected number of verses per book, calculated from the libpalaso versification files.
 */
const verseCounts: Record<string, number> = {
  GEN: 1533,
  EXO: 1213,
  LEV: 859,
  NUM: 1289,
  DEU: 959,
  JOS: 658,
  JDG: 618,
  RUT: 85,
  '1SA': 811,
  '2SA': 695,
  '1KI': 817,
  '2KI': 719,
  '1CH': 943,
  '2CH': 822,
  EZR: 280,
  NEH: 405,
  EST: 167,
  JOB: 1070,
  PSA: 2527,
  PRO: 915,
  ECC: 222,
  SNG: 117,
  ISA: 1291,
  JER: 1364,
  LAM: 154,
  EZK: 1273,
  DAN: 357,
  HOS: 197,
  JOL: 73,
  AMO: 146,
  OBA: 21,
  JON: 48,
  MIC: 105,
  NAM: 47,
  HAB: 56,
  ZEP: 53,
  HAG: 38,
  ZEC: 211,
  MAL: 55,
  MAT: 1071,
  MRK: 678,
  LUK: 1151,
  JHN: 879,
  ACT: 1006,
  ROM: 433,
  '1CO': 437,
  '2CO': 256,
  GAL: 149,
  EPH: 155,
  PHP: 104,
  COL: 95,
  '1TH': 89,
  '2TH': 47,
  '1TI': 113,
  '2TI': 83,
  TIT: 46,
  PHM: 25,
  HEB: 303,
  JAS: 108,
  '1PE': 105,
  '2PE': 61,
  '1JN': 105,
  '2JN': 13,
  '3JN': 15,
  JUD: 25,
  REV: 405,
  TOB: 248,
  JDT: 340,
  ESG: 267,
  WIS: 435,
  SIR: 1401,
  BAR: 141,
  LJE: 72,
  S3Y: 67,
  SUS: 64,
  BEL: 42,
  '1MA': 924,
  '2MA': 555,
  '3MA': 228,
  '4MA': 482,
  '1ES': 434,
  '2ES': 944,
  MAN: 15,
  PS2: 7,
  ODA: 275,
  PSS: 293,
  JSA: 658,
  JDB: 618,
  TBS: 248,
  SST: 64,
  DNT: 424,
  BLT: 42,
  '3ES': 944,
  EZA: 715,
  '5EZ': 88,
  '6EZ': 141,
  DAG: 424,
  PS3: 49,
  '2BA': 613,
  LBA: 82,
  JUB: 1217,
  ENO: 1563,
  '1MQ': 756,
  '2MQ': 396,
  '3MQ': 208,
  REP: 160,
  '4BA': 184,
  LAO: 20
};

export class Progress {
  translated: number = 0;
  blank: number = 0;

  get total(): number {
    return this.translated + this.blank;
  }

  get ratio(): number {
    return this.total === 0 ? 0 : this.translated / this.total;
  }

  get percentage(): number {
    return Math.round(this.ratio * 100);
  }

  get notTranslated(): number {
    return this.blank;
  }

  set notTranslated(value: number) {
    this.blank = value;
  }

  reset(): void {
    this.translated = 0;
    this.blank = 0;
  }
}

export class TextProgress extends Progress {
  expectedNumberOfVerses: number = 0;

  constructor(public readonly text: TextInfo) {
    super();
    this.expectedNumberOfVerses = this.getVerseCount(text.bookNum);
  }

  get notTranslated(): number {
    // This value will be the number of blanks unless useExpectedNumberOfVerses is true.
    return this.total - this.translated;
  }

  get total(): number {
    return this.useExpectedNumberOfVerses ? this.expectedNumberOfVerses : super.total;
  }

  get useExpectedNumberOfVerses(): boolean {
    // If the total calculated from segments is at least 2/3 of the expected number of verses possible, use the total.
    return this.expectedNumberOfVerses > 0 && super.total < this.expectedNumberOfVerses * 0.66;
  }

  getVerseCount(bookNum: number): number {
    return verseCounts[Canon.bookNumberToId(bookNum)] ?? 0;
  }
}

@Injectable({ providedIn: 'root' })
export class ProgressService extends DataLoadingComponent implements OnDestroy {
  readonly overallProgress = new Progress();

  private _texts?: TextProgress[];
  private _projectDoc?: SFProjectProfileDoc;
  private _allChaptersChangeSub?: Subscription;
  private _canTrainSuggestions: boolean = false;

  constructor(
    readonly noticeService: NoticeService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService,
    private destroyRef: DestroyRef
  ) {
    super(noticeService);

    this.activatedProject.changes$
      .pipe(
        startWith(this.activatedProject.projectDoc),
        filterNullish(),
        tap(async project => {
          this.initialize(project.id);
        }),
        throttleTime(1000, asyncScheduler, { leading: false, trailing: true }),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(project => {
        this.initialize(project.id);
      });
  }

  get texts(): TextProgress[] {
    return this._texts ?? [];
  }

  // Whether or not we have the minimum number of segment pairs
  get canTrainSuggestions(): boolean {
    return this._canTrainSuggestions;
  }

  ngOnDestroy(): void {
    this._allChaptersChangeSub?.unsubscribe();
  }

  private async initialize(projectId: string): Promise<void> {
    this._canTrainSuggestions = false;
    this._projectDoc = await this.projectService.getProfile(projectId);

    // If we are offline, just update the progress with what we have
    if (!this.onlineStatusService.isOnline) {
      await this.calculateProgress();
    }

    const chapterDocPromises: Promise<TextDoc>[] = [];
    for (const book of this._projectDoc.data!.texts) {
      for (const chapter of book.chapters) {
        const textDocId = new TextDocId(this._projectDoc.id, book.bookNum, chapter.number, 'target');
        chapterDocPromises.push(this.projectService.getText(textDocId));
      }
    }

    const chapterDocs = await Promise.all(chapterDocPromises);

    const chapterObservables = chapterDocs.map(p => p.changes$);

    this._allChaptersChangeSub?.unsubscribe();
    this._allChaptersChangeSub = merge(...chapterObservables, this.onlineStatusService.online)
      .pipe(throttleTime(1000, asyncScheduler, { leading: true, trailing: true }))
      .subscribe(async () => {
        await this.calculateProgress();
      });
  }

  private async calculateProgress(): Promise<void> {
    this.loadingStarted();
    try {
      if (this._projectDoc == null || this._projectDoc.data == null) {
        return;
      }
      this._texts = this._projectDoc.data.texts
        .map(t => new TextProgress(t))
        .sort((a, b) => a.text.bookNum - b.text.bookNum);
      this.overallProgress.reset();
      const bookProgressPromises: Promise<void>[] = [];
      for (const book of this.texts) {
        bookProgressPromises.push(this.incorporateBookProgress(this._projectDoc, book));
      }
      await Promise.all(bookProgressPromises);
    } finally {
      this.loadingFinished();
    }
  }

  private async incorporateBookProgress(project: SFProjectProfileDoc, book: TextProgress): Promise<void> {
    // NOTE: This will stop being incremented when the minimum required number of pairs for training is reached
    let numTranslatedSegments: number = 0;
    for (const chapter of book.text.chapters) {
      const textDocId = new TextDocId(project.id, book.text.bookNum, chapter.number, 'target');
      const chapterText: TextDoc = await this.projectService.getText(textDocId);

      // Calculate Segment Count
      const { translated, blank } = chapterText.getSegmentCount();
      book.translated += translated;
      book.blank += blank;

      // If translation suggestions are enabled, collect the number of segment pairs up to the minimum required
      // We don't go any further so we don't load all of the source texts while this is running
      if (
        project.data?.translateConfig.translationSuggestionsEnabled &&
        project.data.translateConfig.source != null &&
        book.text.hasSource &&
        !this.canTrainSuggestions
      ) {
        const sourceId: string = project.data.translateConfig.source.projectRef;
        const sourceTextDocId = new TextDocId(sourceId, book.text.bookNum, chapter.number, 'target');

        // Only retrieve the source text if the user has permission
        let sourceNonEmptyVerses: string[] = [];
        if (await this.permissionsService.canAccessText(sourceTextDocId)) {
          const sourceChapterText: TextDoc = await this.projectService.getText(sourceTextDocId);
          sourceNonEmptyVerses = sourceChapterText.getNonEmptyVerses();
        }

        // Get the intersect of the source and target arrays of non-empty verses
        // i.e. The verses with data that both texts have in common
        const targetNonEmptyVerses: string[] = chapterText.getNonEmptyVerses();
        numTranslatedSegments += targetNonEmptyVerses.filter(item => sourceNonEmptyVerses.includes(item)).length;
        // 9 is the minimum number found in testing, but we will use 10 to be safe
        if (numTranslatedSegments >= 10) {
          this._canTrainSuggestions = true;
        }
      }
    }

    // Add the book to the overall progress
    this.overallProgress.translated += book.translated;
    this.overallProgress.notTranslated += book.notTranslated;
  }
}
