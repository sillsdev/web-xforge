import { DestroyRef, Injectable, OnDestroy } from '@angular/core';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { asyncScheduler, merge, startWith, Subscription, throttleTime } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
export class Progress {
  translated: number = 0;
  blank: number = 0;

  get total(): number {
    return this.translated + this.blank;
  }

  get percentage(): number {
    return Math.round((this.translated / this.total) * 100);
  }

  reset(): void {
    this.translated = 0;
    this.blank = 0;
  }
}

export class TextProgress extends Progress {
  constructor(public readonly text: TextInfo) {
    super();
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
        throttleTime(1000, asyncScheduler, { leading: false, trailing: true }),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(project => this.initialize(project.id));
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
    this._projectDoc = await this.projectService.subscribeProfile(
      projectId,
      new DocSubscription('ProgressService', this.destroyRef)
    );

    // If we are offline, just update the progress with what we have
    if (!this.onlineStatusService.isOnline) {
      await this.calculateProgress();
    }

    const chapterDocPromises: Promise<TextDoc>[] = [];
    for (const book of this._projectDoc.data!.texts) {
      for (const chapter of book.chapters) {
        const textDocId = new TextDocId(this._projectDoc.id, book.bookNum, chapter.number, 'target');
        chapterDocPromises.push(
          this.projectService.getText(textDocId, new DocSubscription('ProgressService', this.destroyRef))
        );
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
      const chapterText: TextDoc = await this.projectService.getText(
        textDocId,
        new DocSubscription('ProgressService', this.destroyRef)
      );

      // Calculate Segment Count
      const { translated, blank } = chapterText.getSegmentCount();
      book.translated += translated;
      book.blank += blank;
      this.overallProgress.translated += translated;
      this.overallProgress.blank += blank;

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
          const sourceChapterText: TextDoc = await this.projectService.getText(
            sourceTextDocId,
            new DocSubscription('ProgressService', this.destroyRef)
          );
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
  }
}
