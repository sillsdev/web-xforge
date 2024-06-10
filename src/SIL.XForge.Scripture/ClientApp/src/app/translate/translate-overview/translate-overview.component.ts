import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { ANY_INDEX, obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { asyncScheduler, Subscription, timer } from 'rxjs';
import { delayWhen, filter, map, repeat, retryWhen, tap, throttleTime } from 'rxjs/operators';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { RemoteTranslationEngine } from '../../machine-api/remote-translation-engine';

const ENGINE_QUALITY_STAR_COUNT = 3;
const TEXT_PATH_TEMPLATE = obj<SFProject>().pathTemplate(p => p.texts[ANY_INDEX]);

class Progress {
  translated: number = 0;
  blank: number = 0;

  get total(): number {
    return this.translated + this.blank;
  }

  get percentage(): number {
    return Math.round((this.translated / this.total) * 100);
  }
}

class TextProgress extends Progress {
  constructor(public readonly text: TextInfo) {
    super();
  }
}

@Component({
  selector: 'app-translate-overview',
  templateUrl: './translate-overview.component.html',
  styleUrls: ['./translate-overview.component.scss']
})
export class TranslateOverviewComponent extends DataLoadingComponent implements OnInit, OnDestroy {
  texts?: TextProgress[];
  overallProgress = new Progress();
  trainingPercentage: number = 0;
  isTraining: boolean = false;
  readonly engineQualityStars: number[];
  engineQuality: number = 0;
  engineConfidence: number = 0;
  trainedSegmentCount: number = 0;

  private trainingSub?: Subscription;
  private translationEngine?: RemoteTranslationEngine;
  private projectDoc?: SFProjectProfileDoc;
  private projectDataChangesSub?: Subscription;
  // NOTE: This will stop being incremented when the minimum required number of pairs for training is reached
  private segmentPairs: number = 0;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly authService: AuthService,
    private readonly dialogService: DialogService,
    private readonly onlineStatusService: OnlineStatusService,
    readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly translationEngineService: TranslationEngineService,
    private readonly userService: UserService,
    private readonly permissionsService: PermissionsService,
    readonly i18n: I18nService
  ) {
    super(noticeService);
    this.engineQualityStars = [];
    for (let i = 0; i < ENGINE_QUALITY_STAR_COUNT; i++) {
      this.engineQualityStars.push(i);
    }
  }

  get translationSuggestionsEnabled(): boolean {
    return (
      this.projectDoc != null &&
      this.projectDoc.data != null &&
      this.projectDoc.data.translateConfig.translationSuggestionsEnabled
    );
  }

  // Whether or not we have the minimum number of segment pairs
  get canTrainSuggestions(): boolean {
    // 9 is the minimum number found in testing, but we will use 10 to be safe
    return this.segmentPairs >= 10;
  }

  get canEditTexts(): boolean {
    const project = this.projectDoc?.data;
    return (
      project != null &&
      SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Texts, Operation.Edit)
    );
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  get showCannotTrainEngineMessage(): boolean {
    if (this.projectDoc?.data == null || !this.isOnline) {
      return false;
    }
    const hasSourceBooks: boolean = this.translationEngineService.checkHasSourceBooks(this.projectDoc.data);
    return this.translationSuggestionsEnabled && !hasSourceBooks;
  }

  get projectId(): string | undefined {
    return this.projectDoc?.id;
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params.pipe(map(params => params['projectId'])), async projectId => {
      this.projectDoc = await this.projectService.getProfile(projectId);

      // If we are offline, just update the progress with what we have
      if (!this.isOnline) {
        this.loadingStarted();
        try {
          this.calculateProgress();
        } finally {
          this.loadingFinished();
        }
      }

      // Update the overview now if we are online, or when we are next online
      this.onlineStatusService.online.then(async () => {
        this.loadingStarted();
        try {
          if (this.translationEngine == null) {
            this.setupTranslationEngine();
          }
          await Promise.all([this.calculateProgress(), this.updateEngineStats()]);
        } finally {
          this.loadingFinished();
        }
      });

      if (this.projectDataChangesSub != null) {
        this.projectDataChangesSub.unsubscribe();
      }
      this.projectDataChangesSub = this.projectDoc.remoteChanges$
        .pipe(
          tap(() => {
            if (this.translationEngine == null || !this.translationSuggestionsEnabled) {
              this.setupTranslationEngine();
            }
          }),
          filter(ops => ops.some(op => TEXT_PATH_TEMPLATE.matches(op.p))),
          // TODO Find a better solution than merely throttling remote changes
          throttleTime(1000, asyncScheduler, { leading: true, trailing: true })
        )
        .subscribe(async () => {
          this.loadingStarted();
          try {
            await Promise.all([this.calculateProgress(), this.updateEngineStats()]);
          } finally {
            this.loadingFinished();
          }
        });
    });
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.projectDataChangesSub != null) {
      this.projectDataChangesSub.unsubscribe();
    }
    if (this.trainingSub != null) {
      this.trainingSub.unsubscribe();
    }
  }

  startTraining(): void {
    if (this.translationEngine == null) {
      return;
    }
    this.trainingPercentage = 0;
    this.isTraining = true;
    this.translationEngine
      .startTraining()
      .catch((error: any) => {
        this.isTraining = false;
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.dialogService
            .confirm('warnings.paratext_credentials_expired', 'warnings.logout')
            .then((logOut: boolean) => {
              if (logOut) this.authService.logOut();
            });
        } else {
          this.noticeService.showError(translate('translate_overview.training_unavailable'));
        }
      })
      .then(() => this.listenForStatus());
  }

  getBookName(text: TextInfo): string {
    return this.i18n.localizeBook(text.bookNum);
  }

  getBookId(text: TextInfo): string {
    return Canon.bookNumberToId(text.bookNum);
  }

  trackTextByBookNum(_index: number, item: TextProgress): number {
    return item.text.bookNum;
  }

  private async calculateProgress(): Promise<void> {
    if (this.projectDoc == null || this.projectDoc.data == null) {
      return;
    }
    this.texts = this.projectDoc.data.texts
      .map(t => new TextProgress(t))
      .sort((a, b) => a.text.bookNum - b.text.bookNum);
    this.overallProgress = new Progress();
    const updateTextProgressPromises: Promise<void>[] = [];
    for (const textProgress of this.texts) {
      updateTextProgressPromises.push(this.updateTextProgress(this.projectDoc, textProgress));
    }
    await Promise.all(updateTextProgressPromises);
  }

  private async updateTextProgress(project: SFProjectProfileDoc, textProgress: TextProgress): Promise<void> {
    for (const chapter of textProgress.text.chapters) {
      const textDocId = new TextDocId(project.id, textProgress.text.bookNum, chapter.number, 'target');
      const chapterText: TextDoc = await this.projectService.getText(textDocId);

      // Calculate Segment Count
      const { translated, blank } = chapterText.getSegmentCount();
      textProgress.translated += translated;
      textProgress.blank += blank;
      this.overallProgress.translated += translated;
      this.overallProgress.blank += blank;

      // If translation suggestions are enabled, collect the number of segment pairs up to the minimum required
      // We don't go any further so we don't load all of the source texts while this is running
      if (
        project.data?.translateConfig.translationSuggestionsEnabled &&
        project.data.translateConfig.source != null &&
        textProgress.text.hasSource &&
        !this.canTrainSuggestions
      ) {
        const sourceId: string = project.data.translateConfig.source.projectRef;
        const sourceTextDocId = new TextDocId(sourceId, textProgress.text.bookNum, chapter.number, 'target');

        // Only retrieve the source text if the user has permission
        let sourceNonEmptyVerses: string[] = [];
        if (await this.permissionsService.canAccessText(sourceTextDocId)) {
          const sourceChapterText: TextDoc = await this.projectService.getText(sourceTextDocId);
          sourceNonEmptyVerses = sourceChapterText.getNonEmptyVerses();
        }

        // Get the intersect of the source and target arrays of non-empty verses
        // i.e. The verses with data that both texts have in common
        const targetNonEmptyVerses: string[] = chapterText.getNonEmptyVerses();
        this.segmentPairs += targetNonEmptyVerses.filter(item => sourceNonEmptyVerses.includes(item)).length;
      }
    }
  }

  private setupTranslationEngine(): void {
    if (this.trainingSub != null) {
      this.trainingSub.unsubscribe();
      this.trainingSub = undefined;
    }
    this.translationEngine = undefined;
    if (this.projectDoc?.data == null) {
      return;
    }
    const hasSourceBooks: boolean = this.translationEngineService.checkHasSourceBooks(this.projectDoc.data);
    if (!this.translationSuggestionsEnabled || !this.canEditTexts || !hasSourceBooks) {
      return;
    }

    this.translationEngine = this.translationEngineService.createTranslationEngine(this.projectDoc.id);
    this.listenForStatus();
  }

  private listenForStatus(): void {
    if (this.translationEngine == null) {
      return;
    }
    this.trainingSub?.unsubscribe();
    this.trainingSub = this.translationEngine
      .listenForTrainingStatus()
      .pipe(
        tap({
          error: () => {
            // error while listening
            this.isTraining = false;
          },
          complete: () => {
            // training completed successfully
            this.isTraining = false;
            this.updateEngineStats();
          }
        }),
        repeat(),
        filter(progress => progress.percentCompleted > 0),
        retryWhen(errors => errors.pipe(delayWhen(() => timer(30000))))
      )
      .subscribe(progress => {
        this.trainingPercentage = Math.round(progress.percentCompleted * 100);
        this.isTraining = true;
      });
  }

  private async updateEngineStats(): Promise<void> {
    if (this.translationEngine == null) {
      return;
    }
    const stats = await this.translationEngine.getStats();

    this.engineConfidence = Math.round(stats.confidence * 100) / 100;

    const rescaledConfidence = Math.min(1.0, stats.confidence / 0.6);
    const quality = rescaledConfidence * ENGINE_QUALITY_STAR_COUNT;
    this.engineQuality = Math.round(quality * 2) / 2;

    this.trainedSegmentCount = stats.trainedSegmentCount;
  }
}
