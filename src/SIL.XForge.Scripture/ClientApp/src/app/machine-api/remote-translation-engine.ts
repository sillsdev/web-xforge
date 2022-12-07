import { Observable } from 'rxjs';
import { HttpClient } from './http-client';
import { WebApiClient } from './web-api-client';
import { TranslationEngineStats } from './translation-engine-stats';
import {
  MAX_SEGMENT_LENGTH,
  InteractiveTranslationEngine,
  ProgressStatus,
  TranslationResult,
  TranslationResultBuilder,
  WordGraph
} from '@sillsdev/machine';

export class RemoteTranslationEngine implements InteractiveTranslationEngine {
  private readonly webApiClient: WebApiClient;

  constructor(public readonly projectId: string, httpClient: HttpClient) {
    this.webApiClient = new WebApiClient(httpClient);
  }

  async translate(segment: string[]): Promise<TranslationResult> {
    if (segment.length > MAX_SEGMENT_LENGTH) {
      const builder = new TranslationResultBuilder();
      return builder.toResult(segment.length);
    }
    return await this.webApiClient.translate(this.projectId, segment);
  }

  async translateN(n: number, segment: string[]): Promise<TranslationResult[]> {
    if (segment.length > MAX_SEGMENT_LENGTH) {
      return [];
    }
    return await this.webApiClient.translateNBest(this.projectId, n, segment);
  }

  async getWordGraph(segment: string[]): Promise<WordGraph> {
    if (segment.length > MAX_SEGMENT_LENGTH) {
      return new WordGraph();
    }
    return await this.webApiClient.getWordGraph(this.projectId, segment);
  }

  trainSegment(sourceSegment: string[], targetSegment: string[], sentenceStart: boolean = true): Promise<void> {
    return this.webApiClient.trainSegmentPair(this.projectId, sourceSegment, targetSegment, sentenceStart);
  }

  train(): Observable<ProgressStatus> {
    return this.webApiClient.train(this.projectId);
  }

  startTraining(): Promise<void> {
    return this.webApiClient.startTraining(this.projectId);
  }

  listenForTrainingStatus(): Observable<ProgressStatus> {
    return this.webApiClient.listenForTrainingStatus(this.projectId);
  }

  getStats(): Promise<TranslationEngineStats> {
    return this.webApiClient.getEngineStats(this.projectId);
  }
}
