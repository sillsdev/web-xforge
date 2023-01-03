import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RemoteTranslationEngine } from '@sillsdev/machine';
import { translate } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { ANY_INDEX, obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { Subscription, timer } from 'rxjs';
import { delayWhen, filter, map, repeat, retryWhen, tap, throttleTime } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TranslationEngineService } from '../../core/translation-engine.service';

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
  trainingMessage: string = '';
  showTrainingProgress: boolean = false;
  trainingProgressClosed: boolean = false;
  isTraining: boolean = false;
  readonly engineQualityStars: number[];
  engineQuality: number = 0;
  engineConfidence: number = 0;
  trainedSegmentCount: number = 0;

  private trainingCompletedTimeout: any;
  private trainingSub?: Subscription;
  private translationEngine?: RemoteTranslationEngine;
  private projectDoc?: SFProjectProfileDoc;
  private projectDataChangesSub?: Subscription;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly translationEngineService: TranslationEngineService,
    private readonly userService: UserService,
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

  get canEditTexts(): boolean {
    const project = this.projectDoc?.data;
    return (
      project != null &&
      SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Texts, Operation.Edit)
    );
  }

  get showCannotTrainEngineMessage(): boolean {
    if (this.projectDoc?.data == null) {
      return false;
    }
    const hasSourceBooks: boolean = this.translationEngineService.checkHasSourceBooks(this.projectDoc.data);
    return this.translationSuggestionsEnabled && !hasSourceBooks;
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params.pipe(map(params => params['projectId'])), async projectId => {
      this.loadingStarted();
      try {
        this.projectDoc = await this.projectService.getProfile(projectId);
        this.setupTranslationEngine();
        await Promise.all([this.calculateProgress(), this.updateEngineStats()]);
      } finally {
        this.loadingFinished();
      }

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
          throttleTime(1000)
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
    this.translationEngine.startTraining();
    this.trainingPercentage = 0;
    this.isTraining = true;
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
      updateTextProgressPromises.push(this.updateTextProgress(this.projectDoc.id, textProgress));
    }
    await Promise.all(updateTextProgressPromises);
  }

  private async updateTextProgress(projectId: string, textProgress: TextProgress): Promise<void> {
    for (const chapter of textProgress.text.chapters) {
      const textDocId = new TextDocId(projectId, textProgress.text.bookNum, chapter.number, 'target');
      const chapterText = await this.projectService.getText(textDocId);
      const { translated, blank } = chapterText.getSegmentCount();
      textProgress.translated += translated;
      textProgress.blank += blank;
      this.overallProgress.translated += translated;
      this.overallProgress.blank += blank;
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
    this.trainingSub = this.translationEngine
      .listenForTrainingStatus()
      .pipe(
        tap({
          error: () => {
            // error while listening
            this.isTraining = false;
            this.showTrainingProgress = false;
            this.trainingCompletedTimeout = undefined;
            this.trainingProgressClosed = false;
          },
          complete: () => {
            // training completed successfully
            this.isTraining = false;
            if (this.trainingProgressClosed) {
              this.noticeService.show(translate('editor.training_completed_successfully'));
              this.trainingProgressClosed = false;
            } else {
              this.trainingMessage = translate('editor.completed_successfully');
              this.trainingCompletedTimeout = setTimeout(() => {
                this.showTrainingProgress = false;
                this.trainingCompletedTimeout = undefined;
              }, 5000);
            }

            this.updateEngineStats();
          }
        }),
        repeat(),
        filter(progress => progress.percentCompleted > 0),
        retryWhen(errors => errors.pipe(delayWhen(() => timer(30000))))
      )
      .subscribe(progress => {
        if (!this.trainingProgressClosed) {
          this.showTrainingProgress = true;
        }
        if (this.trainingCompletedTimeout != null) {
          clearTimeout(this.trainingCompletedTimeout);
          this.trainingCompletedTimeout = undefined;
        }
        this.trainingPercentage = Math.round(progress.percentCompleted * 100);
        // ToDo: internationalize message
        this.trainingMessage = progress.message;
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
