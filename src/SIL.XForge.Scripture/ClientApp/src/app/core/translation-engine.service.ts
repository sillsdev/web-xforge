import { Injectable } from '@angular/core';
import { LatinWordTokenizer, MAX_SEGMENT_LENGTH, RemoteTranslationEngine } from '@sillsdev/machine';
import * as crc from 'crc-32';
import { SFProjectUserConfig } from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { getTextDocId } from 'realtime-server/lib/scriptureforge/models/text-data';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { OfflineStore } from 'xforge-common/offline-store';
import { OnlineFeatureService } from 'xforge-common/online-feature.service';
import { PwaService } from 'xforge-common/pwa.service';
import { MachineHttpClient } from './machine-http-client';
import { FEATURE_TRANSLATION, TranslationSuggestionsData } from './models/translation-suggestions-data';
import { SFProjectService } from './sf-project.service';

export interface SegmentTrainingData {
  task: string | undefined;
  projectRef: string;
  bookNum?: number;
  chapterNum?: number;
  segment: string;
  checksum: any;
}

/**
 * Format SFProjectUserConfig data to be used in training a selected segment
 */
export function toSegmentTrainingData(config: SFProjectUserConfig): SegmentTrainingData {
  return {
    task: config.selectedTask,
    projectRef: config.projectRef,
    bookNum: config.selectedBookNum,
    chapterNum: config.selectedChapterNum,
    segment: config.selectedSegment,
    checksum: config.selectedSegmentChecksum
  };
}

/**
 * A service to access features for translation suggestions and training the translation engine
 */
@Injectable({
  providedIn: 'root'
})
export class TranslationEngineService extends OnlineFeatureService {
  constructor(
    offlineStore: OfflineStore,
    pwaService: PwaService,
    private readonly projectService: SFProjectService,
    private readonly machineHttp: MachineHttpClient
  ) {
    super(offlineStore, pwaService);
    this.onlineCallback(async () => {
      const translationSuggestionsData = await this.getAll<TranslationSuggestionsData>(FEATURE_TRANSLATION);
      for (const chapterData of translationSuggestionsData) {
        const chapterTrainPromises: Promise<void>[] = [];
        for (const segment of chapterData.pendingTrainingSegments) {
          const trainingData: SegmentTrainingData = {
            task: undefined,
            projectRef: chapterData.projectRef,
            bookNum: chapterData.bookNum,
            chapterNum: chapterData.chapterNum,
            segment: segment,
            checksum: 0
          };
          chapterTrainPromises.push(this.trainSelectedSegment(trainingData));
        }
        await Promise.all(chapterTrainPromises);
        await this.delete(FEATURE_TRANSLATION, chapterData.id);
      }
    });
  }

  createTranslationEngine(projectId: string): RemoteTranslationEngine {
    return new RemoteTranslationEngine(projectId, this.machineHttp);
  }

  /**
   * Train the translation engine with the text for a specified segment using the target and source text
   */
  async trainSelectedSegment(data: SegmentTrainingData): Promise<void> {
    if (
      data.task === 'checking' ||
      data.bookNum == null ||
      data.chapterNum == null ||
      data.segment === '' ||
      data.checksum == null
    ) {
      return;
    }

    const targetDoc = await this.projectService.getText(
      getTextDocId(data.projectRef, data.bookNum, data.chapterNum, 'target')
    );
    const targetText = targetDoc.getSegmentText(data.segment);
    if (targetText === '') {
      return;
    }
    const checksum = crc.str(targetText);
    if (checksum === data.checksum) {
      return;
    }

    const sourceDoc = await this.projectService.getText(
      getTextDocId(data.projectRef, data.bookNum, data.chapterNum, 'source')
    );
    const sourceText = sourceDoc.getSegmentText(data.segment);
    if (sourceText === '') {
      return;
    }

    const wordTokenizer = new LatinWordTokenizer();
    const sourceWords = wordTokenizer.tokenize(sourceText);
    if (sourceWords.length > MAX_SEGMENT_LENGTH) {
      return;
    }

    const translationEngine = this.createTranslationEngine(data.projectRef);
    const session = await translationEngine.translateInteractively(sourceWords);
    const tokenRanges = wordTokenizer.tokenizeAsRanges(targetText);
    const prefix = tokenRanges.map(r => targetText.substring(r.start, r.end));
    const isLastWordComplete =
      tokenRanges.length === 0 || tokenRanges[tokenRanges.length - 1].end !== targetText.length;
    session.setPrefix(prefix, isLastWordComplete);
    await session.approve(true);
    console.log(
      'Segment ' + data.segment + ' of document ' + Canon.bookNumberToId(data.bookNum) + ' was trained successfully.'
    );
  }

  /**
   * Store a segment to be used to train the translation engine when returning online
   */
  async storeTrainingSegment(data: SegmentTrainingData): Promise<void> {
    if (data.bookNum == null || data.chapterNum == null) {
      return;
    }
    const offlineData: TranslationSuggestionsData | undefined = await this.toStorageData(data);
    if (offlineData != null) {
      this.put(FEATURE_TRANSLATION, offlineData);
    }
  }

  private async toStorageData(data: SegmentTrainingData): Promise<TranslationSuggestionsData | undefined> {
    if (data.bookNum == null || data.chapterNum == null) {
      return;
    }
    const chapterData: TranslationSuggestionsData | undefined = await this.get<TranslationSuggestionsData>(
      FEATURE_TRANSLATION,
      this.translationSuggestionId(data)
    );
    const storedSegments: string[] = chapterData == null ? [] : chapterData.pendingTrainingSegments;
    return {
      id: this.translationSuggestionId(data),
      projectRef: data.projectRef,
      bookNum: data.bookNum,
      chapterNum: data.chapterNum,
      pendingTrainingSegments: storedSegments.includes(data.segment)
        ? storedSegments
        : [...storedSegments, data.segment]
    };
  }

  private translationSuggestionId(data: SegmentTrainingData): string {
    return `${data.projectRef}:${data.bookNum}:${data.chapterNum}`;
  }
}
