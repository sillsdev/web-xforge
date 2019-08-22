import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RemoteTranslationEngine } from '@sillsdev/machine';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { Subscription } from 'rxjs';
import { filter, map, repeat, tap } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { TextDocId } from '../../core/models/text-doc-id';
import { SFProjectService } from '../../core/sf-project.service';

const ENGINE_QUALITY_STAR_COUNT = 3;

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
  texts: TextProgress[];
  overallProgress = new Progress();
  trainingPercentage: number = 0;
  isTraining: boolean = false;
  readonly engineQualityStars: number[];
  engineQuality: number = 0;
  engineConfidence: number = 0;
  trainedSegmentCount: number = 0;

  private trainingSub: Subscription;
  private translationEngine: RemoteTranslationEngine;
  private projectDoc: SFProjectDoc;
  private projectDataChangesSub: Subscription;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    noticeService: NoticeService,
    private readonly projectService: SFProjectService
  ) {
    super(noticeService);
    this.engineQualityStars = [];
    for (let i = 0; i < ENGINE_QUALITY_STAR_COUNT; i++) {
      this.engineQualityStars.push(i);
    }
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params.pipe(map(params => params['projectId'])), async projectId => {
      this.loadingStarted();
      try {
        this.createTranslationEngine(projectId);
        this.projectDoc = await this.projectService.get(projectId);
        await Promise.all([this.calculateProgress(), this.updateEngineStats()]);
      } finally {
        this.loadingFinished();
      }

      if (this.projectDataChangesSub != null) {
        this.projectDataChangesSub.unsubscribe();
      }
      this.projectDataChangesSub = this.projectDoc.remoteChanges$.subscribe(async () => {
        this.loadingStarted();
        try {
          await this.calculateProgress();
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
    this.translationEngine.startTraining();
    this.trainingPercentage = 0;
    this.isTraining = true;
  }

  private async calculateProgress(): Promise<void> {
    this.texts = this.projectDoc.data.texts.filter(t => t.hasSource).map(t => new TextProgress(t));
    this.overallProgress = new Progress();
    const updateTextProgressPromises: Promise<void>[] = [];
    for (const textProgress of this.texts) {
      updateTextProgressPromises.push(this.updateTextProgress(textProgress));
    }
    await Promise.all(updateTextProgressPromises);
  }

  private async updateTextProgress(textProgress: TextProgress): Promise<void> {
    for (const chapter of textProgress.text.chapters) {
      const textDocId = new TextDocId(this.projectDoc.id, textProgress.text.bookId, chapter.number, 'target');
      const chapterText = await this.projectService.getText(textDocId);
      const { translated, blank } = chapterText.getSegmentCount();
      textProgress.translated += translated;
      textProgress.blank += blank;
      this.overallProgress.translated += translated;
      this.overallProgress.blank += blank;
    }
  }

  private createTranslationEngine(projectId: string): void {
    if (this.trainingSub != null) {
      this.trainingSub.unsubscribe();
    }
    this.translationEngine = this.projectService.createTranslationEngine(projectId);
    const trainingStatus$ = this.translationEngine.listenForTrainingStatus().pipe(
      tap(undefined, undefined, () => {
        this.isTraining = false;
        this.updateEngineStats();
      }),
      repeat(),
      filter(progress => progress.percentCompleted > 0)
    );
    this.trainingSub = trainingStatus$.subscribe(async progress => {
      this.trainingPercentage = progress.percentCompleted;
      this.isTraining = true;
    });
  }

  private async updateEngineStats(): Promise<void> {
    const stats = await this.translationEngine.getStats();

    this.engineConfidence = Math.round(stats.confidence * 100) / 100;

    const rescaledConfidence = Math.min(1.0, stats.confidence / 0.6);
    const quality = rescaledConfidence * ENGINE_QUALITY_STAR_COUNT;
    this.engineQuality = Math.round(quality * 2) / 2;

    this.trainedSegmentCount = stats.trainedSegmentCount;
  }
}
