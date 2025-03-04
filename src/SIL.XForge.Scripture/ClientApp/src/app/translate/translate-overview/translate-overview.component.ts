import { HttpErrorResponse } from '@angular/common/http';
import { QuietDestroyRef } from 'xforge-common/utils';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { ANY_INDEX, obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { Subscription, asyncScheduler, firstValueFrom, timer } from 'rxjs';
import { filter, map, repeat, retry, tap, throttleTime } from 'rxjs/operators';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { RemoteTranslationEngine } from '../../machine-api/remote-translation-engine';
import { ProgressService, TextProgress } from '../../shared/progress-service/progress.service';

const ENGINE_QUALITY_STAR_COUNT = 3;
const TEXT_PATH_TEMPLATE = obj<SFProject>().pathTemplate(p => p.texts[ANY_INDEX]);

@Component({
  selector: 'app-translate-overview',
  templateUrl: './translate-overview.component.html',
  styleUrls: ['./translate-overview.component.scss']
})
export class TranslateOverviewComponent extends DataLoadingComponent implements OnInit, OnDestroy {
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

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly authService: AuthService,
    private readonly onlineStatusService: OnlineStatusService,
    noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly translationEngineService: TranslationEngineService,
    private readonly userService: UserService,
    public readonly progressService: ProgressService,
    readonly i18n: I18nService,
    private destroyRef: QuietDestroyRef
  ) {
    super(noticeService);
    this.engineQualityStars = [];
    for (let i = 0; i < ENGINE_QUALITY_STAR_COUNT; i++) {
      this.engineQualityStars.push(i);
    }
  }

  get translationSuggestionsEnabled(): boolean {
    return this.projectDoc?.data?.translateConfig.translationSuggestionsEnabled ?? false;
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
    this.activatedRoute.params
      .pipe(map(params => params['projectId']))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async projectId => {
        this.projectDoc = await this.projectService.getProfile(projectId);

        // Update the overview now if we are online, or when we are next online
        this.onlineStatusService.online.then(async () => {
          this.loadingStarted();
          try {
            if (this.translationEngine == null) {
              this.setupTranslationEngine();
            }
            await this.updateEngineStats();
            await firstValueFrom(this.progressService.isLoaded$.pipe(filter(loaded => loaded)));
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
              await this.updateEngineStats();
              await firstValueFrom(this.progressService.isLoaded$.pipe(filter(loaded => loaded)));
            } finally {
              this.loadingFinished();
            }
          });
      });
  }

  ngOnDestroy(): void {
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
          this.authService.requestParatextCredentialUpdate();
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

  get isPTUser(): boolean {
    return isParatextRole(this.projectDoc?.data?.userRoles[this.userService.currentUserId]);
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
        retry({ delay: () => timer(30000) })
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
