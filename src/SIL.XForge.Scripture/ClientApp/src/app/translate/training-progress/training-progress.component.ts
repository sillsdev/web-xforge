import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { Subscription, timer } from 'rxjs';
import { delayWhen, filter, map, repeat, retryWhen, tap } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { RemoteTranslationEngine } from '../../machine-api/remote-translation-engine';

@Component({
  selector: 'app-training-progress',
  templateUrl: './training-progress.component.html',
  styleUrls: ['./training-progress.component.scss']
})
export class TrainingProgressComponent extends DataLoadingComponent implements OnInit, OnDestroy {
  @Input() projectId?: string;

  showTrainingProgress: boolean = false;
  trainingMessage: string = '';
  trainingPercentage: number = 0;
  private projectDoc?: SFProjectProfileDoc;
  private projectDataChangesSub?: Subscription;
  private trainingProgressClosed: boolean = false;
  private trainingCompletedTimeout: any;
  private trainingSub?: Subscription;
  private translationEngine?: RemoteTranslationEngine;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly translationEngineService: TranslationEngineService
  ) {
    super(noticeService);
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params.pipe(map(params => params['projectId'])), async projectId => {
      this.loadingStarted();
      try {
        this.projectDoc = await this.projectService.getProfile(projectId);
        this.setupTranslationEngine();
      } finally {
        this.loadingFinished();
      }

      if (this.projectDataChangesSub != null) {
        this.projectDataChangesSub.unsubscribe();
      }
      this.projectDataChangesSub = this.projectDoc.remoteChanges$.subscribe(() => {
        if (this.translationEngine == null || !this.translationSuggestionsEnabled) {
          this.setupTranslationEngine();
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

  closeTrainingProgress(): void {
    this.showTrainingProgress = false;
    this.trainingProgressClosed = true;
  }

  private get translationSuggestionsEnabled(): boolean {
    return (
      this.projectDoc != null &&
      this.projectDoc.data != null &&
      this.projectDoc.data.translateConfig.translationSuggestionsEnabled
    );
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
    if (!this.translationSuggestionsEnabled || !hasSourceBooks) {
      return;
    }

    this.translationEngine = this.translationEngineService.createTranslationEngine(this.projectDoc.id);
    this.trainingSub = this.translationEngine
      .listenForTrainingStatus()
      .pipe(
        tap({
          error: () => {
            // error while listening
            this.showTrainingProgress = false;
            this.trainingCompletedTimeout = undefined;
            this.trainingProgressClosed = false;
          },
          complete: () => {
            // training completed successfully
            if (this.trainingProgressClosed) {
              this.noticeService.show(translate('training_progress.training_completed_successfully'));
              this.trainingProgressClosed = false;
            } else {
              this.trainingMessage = translate('training_progress.completed_successfully');
              this.trainingCompletedTimeout = setTimeout(() => {
                this.showTrainingProgress = false;
                this.trainingCompletedTimeout = undefined;
              }, 5000);
            }
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
      });
  }
}
