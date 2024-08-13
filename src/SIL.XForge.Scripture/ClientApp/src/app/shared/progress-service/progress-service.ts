import { Injectable, OnDestroy } from '@angular/core';
import { ANY_INDEX, obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { asyncScheduler, filter, Subscription, throttleTime } from 'rxjs';
import { DataLoadingComponent } from '../../../xforge-common/data-loading-component';
import { NoticeService } from '../../../xforge-common/notice.service';
import { OnlineStatusService } from '../../../xforge-common/online-status.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';

const TEXT_PATH_TEMPLATE = obj<SFProject>().pathTemplate(p => p.texts[ANY_INDEX]);

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

@Injectable({
  providedIn: 'root'
})
export class ProgressService extends DataLoadingComponent implements OnDestroy {
  readonly overallProgress = new Progress();

  private _texts?: TextProgress[];
  private projectDoc?: SFProjectProfileDoc;
  private projectDataChangesSub?: Subscription;
  private _canTrainSuggestions: boolean = false;

  constructor(
    readonly noticeService: NoticeService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService
  ) {
    super(noticeService);
  }

  async initialize(projectId: string): Promise<void> {
    if (this.projectDoc?.id !== projectId) {
      this.projectDoc = await this.projectService.getProfile(projectId);

      // If we are offline, just update the progress with what we have
      if (!this.onlineStatusService.isOnline) {
        await this.calculateProgress();
      }

      // Update the overview now if we are online, or when we are next online
      this.onlineStatusService.online.then(async () => {
        await this.calculateProgress();
      });

      if (this.projectDataChangesSub != null) {
        this.projectDataChangesSub.unsubscribe();
      }
      this.projectDataChangesSub = this.projectDoc.remoteChanges$
        .pipe(
          filter(ops => ops.some(op => TEXT_PATH_TEMPLATE.matches(op.p))),
          throttleTime(1000, asyncScheduler, { leading: true, trailing: true })
        )
        .subscribe(async () => {
          await this.calculateProgress();
        });
    }
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.projectDataChangesSub != null) {
      this.projectDataChangesSub.unsubscribe();
    }
  }

  get texts(): TextProgress[] {
    return this._texts ?? [];
  }

  // Whether or not we have the minimum number of segment pairs
  get canTrainSuggestions(): boolean {
    return this._canTrainSuggestions;
  }

  private async calculateProgress(): Promise<void> {
    this.loadingStarted();
    try {
      if (this.projectDoc == null || this.projectDoc.data == null) {
        return;
      }
      this._texts = this.projectDoc.data.texts
        .map(t => new TextProgress(t))
        .sort((a, b) => a.text.bookNum - b.text.bookNum);
      this.overallProgress.reset();
      const updateTextProgressPromises: Promise<void>[] = [];
      for (const book of this.texts) {
        updateTextProgressPromises.push(this.updateTextProgress(this.projectDoc, book));
      }
      await Promise.all(updateTextProgressPromises);
    } finally {
      this.loadingFinished();
    }
  }

  private async updateTextProgress(project: SFProjectProfileDoc, book: TextProgress): Promise<void> {
    // NOTE: This will stop being incremented when the minimum required number of pairs for training is reached
    let numTranslatedSegments: number = 0;
    for (const chapter of book.text.chapters) {
      const textDocId = new TextDocId(project.id, book.text.bookNum, chapter.number, 'target');
      const chapterText: TextDoc = await this.projectService.getText(textDocId);

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
          return;
        }
      }
    }
  }
}
