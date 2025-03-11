import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { translate } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { BehaviorSubject, Subscription, timer } from 'rxjs';
import { filter, repeat, retry, tap } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { getQuietDestroyRef } from 'xforge-common/utils';
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
  showTrainingProgress: boolean = false;
  trainingMessage: string = '';
  trainingPercentage: number = 0;
  private _projectId?: string;
  private projectId$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  private projectDoc?: SFProjectProfileDoc;
  private projectDataChangesSub?: Subscription;
  private trainingProgressClosed: boolean = false;
  private trainingCompletedTimeout: any;
  private trainingSub?: Subscription;
  private translationEngine?: RemoteTranslationEngine;

  private destroyRef = getQuietDestroyRef();

  constructor(
    noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly translationEngineService: TranslationEngineService,
    private readonly userService: UserService
  ) {
    super(noticeService);
  }

  @Input() set projectId(id: string | undefined) {
    if (id == null) {
      return;
    }
    this._projectId = id;
    this.projectId$.next(id);
  }

  ngOnInit(): void {
    this.projectId$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async projectId => {
      if (projectId === '') {
        return;
      }
      if (this.projectDoc == null || projectId !== this._projectId) {
        this.loadingStarted();
        try {
          this.projectDoc = await this.projectService.getProfile(projectId);
          this.setupTranslationEngine();
        } finally {
          this.loadingFinished();
        }

        if (this.projectDataChangesSub != null) {
          this.projectDataChangesSub.unsubscribe();
          this.projectDataChangesSub = undefined;
        }
        if (this.projectDoc !== null) {
          this.projectDataChangesSub = this.projectDoc.remoteChanges$.subscribe(() => {
            if (this.translationEngine == null || !this.translationSuggestionsEnabled) {
              this.setupTranslationEngine();
            }
          });
        }
      }
    });
  }

  ngOnDestroy(): void {
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

  /**
   * Determines whether the user has the right to edit texts in this project.
   */
  private get userHasGeneralEditRight(): boolean {
    const project = this.projectDoc?.data;
    return (
      project != null &&
      SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Texts, Operation.Edit)
    );
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
    if (!this.translationSuggestionsEnabled || !this.userHasGeneralEditRight || !hasSourceBooks) {
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
        retry({ delay: () => timer(30000) })
      )
      .subscribe(progress => {
        if (this.trainingCompletedTimeout != null) {
          clearTimeout(this.trainingCompletedTimeout);
          this.trainingProgressClosed = false;
          this.trainingCompletedTimeout = undefined;
        }
        if (!this.trainingProgressClosed) {
          this.showTrainingProgress = true;
        }
        this.trainingPercentage = Math.round(progress.percentCompleted * 100);
        // ToDo: internationalize message
        this.trainingMessage = progress.message;
      });
  }
}
