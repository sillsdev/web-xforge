import { Injectable } from '@angular/core';
import { LatinWordTokenizer, MAX_SEGMENT_LENGTH, RemoteTranslationEngine } from '@sillsdev/machine';
import * as crc from 'crc-32';
import { SFProjectUserConfig } from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { getTextDocId } from 'realtime-server/lib/scriptureforge/models/text-data';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { Observable } from 'rxjs';
import { filter, share } from 'rxjs/operators';
import { OfflineData, OfflineStore } from 'xforge-common/offline-store';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { MachineHttpClient } from './machine-http-client';
import { EngineTrainingStorageData, FEATURE_TRANSLATION } from './models/engine-training-storage-data';
import { SFProjectService } from './sf-project.service';

/**
 * A service to access features for translation suggestions and training the translation engine
 */
@Injectable({
  providedIn: 'root'
})
export class TranslationEngineService extends SubscriptionDisposable {
  private onlineStatus$: Observable<boolean>;

  constructor(
    private readonly offlineStore: OfflineStore,
    private readonly pwaService: PwaService,
    private readonly projectService: SFProjectService,
    private readonly machineHttp: MachineHttpClient
  ) {
    super();
    this.onlineStatus$ = this.pwaService.onlineStatus.pipe(
      filter(online => online),
      share()
    );
    this.onlineCallback(async () => {
      const engineTrainingData: EngineTrainingStorageData[] = await this.getAll<EngineTrainingStorageData>(
        FEATURE_TRANSLATION
      );
      for (const data of engineTrainingData) {
        await this.trainSegment(data.projectRef, data.bookNum, data.chapterNum, data.segment, undefined);
        await this.delete(FEATURE_TRANSLATION, data.id);
      }
    });
  }

  createTranslationEngine(projectId: string): RemoteTranslationEngine {
    return new RemoteTranslationEngine(projectId, this.machineHttp);
  }

  /**
   * Train the translation engine with the text for a specified segment using the target and source text
   */
  async trainSelectedSegment(projectUserConfig: SFProjectUserConfig): Promise<void> {
    if (
      projectUserConfig.selectedTask === 'checking' ||
      projectUserConfig.selectedBookNum == null ||
      projectUserConfig.selectedChapterNum == null ||
      projectUserConfig.selectedSegment === '' ||
      projectUserConfig.selectedSegmentChecksum == null
    ) {
      return;
    }
    return this.trainSegment(
      projectUserConfig.projectRef,
      projectUserConfig.selectedBookNum,
      projectUserConfig.selectedChapterNum,
      projectUserConfig.selectedSegment,
      projectUserConfig.selectedSegmentChecksum
    );
  }

  /**
   * Store a segment to be used to train the translation engine when returning online
   */
  async storeTrainingSegment(projectRef: string, bookNum: number, chapterNum: number, segment: string): Promise<void> {
    let trainingData: EngineTrainingStorageData | undefined = await this.get<EngineTrainingStorageData>(
      FEATURE_TRANSLATION,
      this.translationSuggestionId(projectRef, bookNum, segment)
    );
    if (trainingData != null) {
      return;
    }

    trainingData = {
      id: this.translationSuggestionId(projectRef, bookNum, segment),
      projectRef: projectRef,
      bookNum: bookNum,
      chapterNum: chapterNum,
      segment: segment
    };
    return this.put(FEATURE_TRANSLATION, trainingData);
  }

  private async trainSegment(
    projectRef: string,
    bookNum: number,
    chapterNum: number,
    segment: string,
    checksum: number | undefined
  ) {
    const targetDoc = await this.projectService.getText(getTextDocId(projectRef, bookNum, chapterNum, 'target'));
    const targetText = targetDoc.getSegmentText(segment);
    if (targetText === '') {
      return;
    }
    const targetChecksum = crc.str(targetText);
    if (checksum === targetChecksum) {
      return;
    }

    const sourceDoc = await this.projectService.getText(getTextDocId(projectRef, bookNum, chapterNum, 'source'));
    const sourceText = sourceDoc.getSegmentText(segment);
    if (sourceText === '') {
      return;
    }

    const wordTokenizer = new LatinWordTokenizer();
    const sourceWords = wordTokenizer.tokenize(sourceText);
    if (sourceWords.length > MAX_SEGMENT_LENGTH) {
      return;
    }

    const translationEngine = this.createTranslationEngine(projectRef);
    const session = await translationEngine.translateInteractively(sourceWords);
    const tokenRanges = wordTokenizer.tokenizeAsRanges(targetText);
    const prefix = tokenRanges.map(r => targetText.substring(r.start, r.end));
    const isLastWordComplete =
      tokenRanges.length === 0 || tokenRanges[tokenRanges.length - 1].end !== targetText.length;
    session.setPrefix(prefix, isLastWordComplete);
    await session.approve(true);
    console.log('Segment ' + segment + ' of document ' + Canon.bookNumberToId(bookNum) + ' was trained successfully.');
  }

  private put<T extends OfflineData>(collection: string, data: T): Promise<void> {
    return this.offlineStore.put(collection, data);
  }

  private getAll<T extends OfflineData>(collection: string): Promise<T[]> {
    return this.offlineStore.getAll<T>(collection);
  }
  private get<T extends OfflineData>(collection: string, id: string): Promise<T | undefined> {
    return this.offlineStore.get(collection, id);
  }

  private delete(collection: string, id: string): Promise<void> {
    return this.offlineStore.delete(collection, id);
  }

  private onlineCallback(callback: () => any): void {
    this.subscribe(this.onlineStatus$, callback);
  }

  private translationSuggestionId(projectRef: string, bookNum: number, segment: string): string {
    return `${projectRef}:${bookNum}:${segment}`;
  }
}
