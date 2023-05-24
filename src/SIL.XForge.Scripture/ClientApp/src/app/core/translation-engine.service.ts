import { Injectable } from '@angular/core';
import {
  InteractiveTranslator,
  InteractiveTranslatorFactory,
  LatinWordTokenizer,
  MAX_SEGMENT_LENGTH
} from '@sillsdev/machine';
import * as crc from 'crc-32';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { getTextDocId } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { Observable } from 'rxjs';
import { filter, share } from 'rxjs/operators';
import { OfflineData, OfflineStore } from 'xforge-common/offline-store';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { HttpClient } from '../machine-api/http-client';
import { RemoteTranslationEngine } from '../machine-api/remote-translation-engine';
import { EditedSegmentData, EDITED_SEGMENTS } from './models/edited-segment-data';
import { SFProjectService } from './sf-project.service';

/**
 * A service to access features for translation suggestions and training the translation engine
 */
@Injectable({
  providedIn: 'root'
})
export class TranslationEngineService extends SubscriptionDisposable {
  private onlineStatus$: Observable<boolean>;
  private tokenizer = new LatinWordTokenizer();
  private translationEngines: Map<string, RemoteTranslationEngine> = new Map<string, RemoteTranslationEngine>();
  private interactiveTranslatorFactories: Map<string, InteractiveTranslatorFactory> = new Map<
    string,
    InteractiveTranslatorFactory
  >();

  constructor(
    private readonly offlineStore: OfflineStore,
    private readonly pwaService: PwaService,
    private readonly projectService: SFProjectService,
    private readonly machineHttp: HttpClient
  ) {
    super();
    this.onlineStatus$ = this.pwaService.onlineStatus$.pipe(
      filter(online => online),
      share()
    );
    this.onlineCallback(async () => {
      const engineTrainingData: EditedSegmentData[] = await this.getAll<EditedSegmentData>(EDITED_SEGMENTS);
      for (const data of engineTrainingData) {
        await this.trainSegment(data.projectRef, data.sourceProjectRef, data.bookNum, data.chapterNum, data.segment);
        await this.delete(EDITED_SEGMENTS, data.id);
      }
    });
  }

  createTranslationEngine(projectId: string): RemoteTranslationEngine {
    if (!this.translationEngines.has(projectId)) {
      this.translationEngines.set(projectId, new RemoteTranslationEngine(projectId, this.machineHttp));
    }
    return this.translationEngines.get(projectId)!;
  }

  createInteractiveTranslatorFactory(projectId: string): InteractiveTranslatorFactory {
    if (!this.interactiveTranslatorFactories.has(projectId)) {
      this.interactiveTranslatorFactories.set(
        projectId,
        new InteractiveTranslatorFactory(this.createTranslationEngine(projectId), this.tokenizer)
      );
    }
    return this.interactiveTranslatorFactories.get(projectId)!;
  }

  checkHasSourceBooks(project: SFProjectProfile): boolean {
    return project.texts.filter(t => t.hasSource).length > 0;
  }

  /**
   * Train the translation engine with the text for a specified segment using the target and source text
   */
  async trainSelectedSegment(projectUserConfig: SFProjectUserConfig, sourceProjectRef: string): Promise<void> {
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
      sourceProjectRef,
      projectUserConfig.selectedBookNum,
      projectUserConfig.selectedChapterNum,
      projectUserConfig.selectedSegment,
      projectUserConfig.selectedSegmentChecksum
    );
  }

  /**
   * Store a segment to be used to train the translation engine when returning online
   */
  async storeTrainingSegment(
    projectRef: string,
    sourceProjectRef: string,
    bookNum: number,
    chapterNum: number,
    segment: string
  ): Promise<void> {
    let trainingData: EditedSegmentData | undefined = await this.get<EditedSegmentData>(
      EDITED_SEGMENTS,
      this.translationSuggestionId(projectRef, bookNum, segment)
    );
    if (trainingData != null) {
      return;
    }

    trainingData = {
      id: this.translationSuggestionId(projectRef, bookNum, segment),
      projectRef: projectRef,
      sourceProjectRef: sourceProjectRef,
      bookNum: bookNum,
      chapterNum: chapterNum,
      segment: segment
    };
    return this.put(EDITED_SEGMENTS, trainingData);
  }

  private async trainSegment(
    projectRef: string,
    sourceProjectRef: string,
    bookNum: number,
    chapterNum: number,
    segment: string,
    checksum?: number
  ): Promise<void> {
    const targetDoc = await this.projectService.getText(getTextDocId(projectRef, bookNum, chapterNum, 'target'));
    const targetText = targetDoc.getSegmentText(segment);
    if (targetText === '') {
      return;
    }
    if (checksum != null) {
      const targetChecksum = crc.str(targetText);
      if (checksum === targetChecksum) {
        return;
      }
    }

    const sourceDoc = await this.projectService.getText(getTextDocId(sourceProjectRef, bookNum, chapterNum, 'source'));
    const sourceText = sourceDoc.getSegmentText(segment);
    if (sourceText === '') {
      return;
    }

    if (sourceText.length > MAX_SEGMENT_LENGTH) {
      return;
    }

    const factory: InteractiveTranslatorFactory = this.createInteractiveTranslatorFactory(projectRef);
    const translator: InteractiveTranslator = await factory.create(sourceText);
    translator.setPrefix(targetText);
    await translator.approve(true);
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
