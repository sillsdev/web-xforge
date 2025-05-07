import { Router } from '@angular/router';
import { translate } from '@ngneat/transloco';
import {
  createRange,
  InteractiveTranslationEngine,
  Phrase,
  ProgressStatus,
  TranslationResult,
  TranslationSources,
  WordAlignmentMatrix,
  WordGraph,
  WordGraphArc
} from '@sillsdev/machine';
import { lastValueFrom, Observable, of, throwError } from 'rxjs';
import { catchError, expand, filter, map, mergeMap, share, startWith, takeWhile } from 'rxjs/operators';
import { NoticeService } from 'xforge-common/notice.service';
import { AlignedWordPairDto } from './aligned-word-pair-dto';
import { BuildDto } from './build-dto';
import { BuildStates } from './build-states';
import { EngineDto } from './engine-dto';
import { HttpClient } from './http-client';
import { PhraseDto } from './phrase-dto';
import { SegmentPairDto } from './segment-pair-dto';
import { TranslationEngineStats } from './translation-engine-stats';
import { TranslationResultDto } from './translation-result-dto';
import { TranslationSource } from './translation-source';
import { WordGraphDto } from './word-graph-dto';

export class RemoteTranslationEngine implements InteractiveTranslationEngine {
  private trainingStatus$?: Observable<ProgressStatus>;
  private wordGraphQueue: Promise<void> = Promise.resolve();
  private pendingWordGraphRequests = new Map<string, Promise<WordGraph>>();

  constructor(
    public readonly projectId: string,
    private readonly httpClient: HttpClient,
    private readonly noticeService: NoticeService,
    private readonly router: Router
  ) {}

  async translate(segment: string): Promise<TranslationResult> {
    const response = await lastValueFrom(
      this.httpClient.post<TranslationResultDto>(
        `translation/engines/project:${this.projectId}/actions/translate`,
        JSON.stringify(segment)
      )
    );
    return this.createTranslationResult(response.data as TranslationResultDto);
  }

  async translateN(n: number, segment: string): Promise<TranslationResult[]> {
    const response = await lastValueFrom(
      this.httpClient.post<TranslationResultDto[]>(
        `translation/engines/project:${this.projectId}/actions/translate/${n}`,
        JSON.stringify(segment)
      )
    );
    const dto = response.data as TranslationResultDto[];
    return dto.map(dto => this.createTranslationResult(dto));
  }

  async getWordGraph(segment: string): Promise<WordGraph> {
    // See if a request for this segment is already in progress
    if (this.pendingWordGraphRequests.has(segment)) {
      return this.pendingWordGraphRequests.get(segment)!;
    }

    // Add the request to the queue
    const requestPromise = this.wordGraphQueue.then(() => this.executeGetWordGraphRequest(segment));

    // Put the promise in the pendingRequests cache.
    //
    // This is so we can return the word graph for any pending requests
    // that are for the same segment to stop duplicate requests.
    // We do not cache already run word graph queries,
    // as the SMT model may have changed via trainSegment().
    this.pendingWordGraphRequests.set(segment, requestPromise);

    // After the queue has run, remove the pending request
    this.wordGraphQueue = requestPromise
      .then(() => undefined)
      .finally(() => this.pendingWordGraphRequests.delete(segment));

    // Return the promise for the quests in the queue
    return requestPromise;
  }

  private async executeGetWordGraphRequest(segment: string): Promise<WordGraph> {
    try {
      const response = await lastValueFrom(
        this.httpClient.post<WordGraphDto>(
          `translation/engines/project:${this.projectId}/actions/getWordGraph`,
          JSON.stringify(segment)
        )
      );
      return this.createWordGraph(response.data as WordGraphDto);
    } catch (err: any) {
      if (err.status === 403 || err.status === 404 || err.status === 409) {
        this.noticeService.showError(
          translate('error_messages.suggestion_engine_requires_retrain'),
          translate('error_messages.go_to_retrain'),
          () => {
            this.router.navigate(['projects', this.projectId, 'translate']);
          }
        );
      } else {
        this.noticeService.showError(translate('error_messages.failed_to_retrieve_suggestions'));
      }
    }

    return new WordGraph([]);
  }

  async trainSegment(sourceSegment: string, targetSegment: string, sentenceStart: boolean = true): Promise<void> {
    const pairDto: SegmentPairDto = { sourceSegment, targetSegment, sentenceStart };
    await lastValueFrom(
      this.httpClient.post(`translation/engines/project:${this.projectId}/actions/trainSegment`, pairDto)
    );
  }

  train(): Observable<ProgressStatus> {
    return this.getEngine(this.projectId).pipe(
      mergeMap(e => this.createBuild(e.id)),
      mergeMap(b => this.pollBuildProgress(b.id, b.revision + 1).pipe(startWith(b)))
    );
  }

  async startTraining(): Promise<BuildDto | undefined> {
    return lastValueFrom(
      this.createBuild(this.projectId).pipe(
        catchError(err => {
          if (err.status === 404) {
            return of(undefined);
          } else {
            return throwError(() => err);
          }
        })
      )
    );
  }

  listenForTrainingStatus(): Observable<ProgressStatus> {
    this.trainingStatus$ ??= this.getEngine(this.projectId).pipe(
      mergeMap(e => this.pollBuildProgress(e.id, 0)),
      share()
    );
    return this.trainingStatus$;
  }

  async getStats(): Promise<TranslationEngineStats> {
    const engineDto = await lastValueFrom(
      this.getEngine(this.projectId).pipe(
        catchError(err => {
          if (err.status === 404) {
            return of({ confidence: 0.0, trainedSegmentCount: 0 });
          } else {
            return throwError(() => err);
          }
        })
      )
    );
    return { confidence: engineDto.confidence, trainedSegmentCount: engineDto.trainedSegmentCount };
  }

  private getEngine(projectId: string): Observable<EngineDto> {
    return this.httpClient
      .get<EngineDto>(`translation/engines/project:${projectId}`)
      .pipe(map(res => res.data as EngineDto));
  }

  private createBuild(engineId: string): Observable<BuildDto> {
    return this.httpClient
      .post<BuildDto>('translation/builds', JSON.stringify(engineId))
      .pipe(map(res => res.data as BuildDto));
  }

  private pollBuildProgress(locator: string, minRevision: number): Observable<ProgressStatus> {
    return this.getBuildProgress(locator, minRevision).pipe(
      expand(buildDto => {
        if (buildDto != null) {
          locator = buildDto.id;
          minRevision = buildDto.revision + 1;
        }
        return this.getBuildProgress(locator, minRevision);
      }),
      filter(buildDto => buildDto != null),
      map(buildDto => buildDto as BuildDto),
      takeWhile(
        buildDto =>
          buildDto.state === BuildStates.Queued ||
          buildDto.state === BuildStates.Pending ||
          buildDto.state === BuildStates.Active,
        true
      )
    );
  }

  private getBuildProgress(locator: string, minRevision: number): Observable<BuildDto | undefined> {
    return this.httpClient.get<BuildDto>(`translation/builds/id:${locator}?minRevision=${minRevision}`).pipe(
      map(res => {
        if (res.data != null && res.data.state === BuildStates.Faulted) {
          throw new Error('Error occurred during build: ' + res.data.message);
        }
        return res.data;
      })
    );
  }

  private createWordGraph(dto: WordGraphDto): WordGraph {
    const arcs: WordGraphArc[] = [];
    for (const arcDto of dto.arcs) {
      const alignment = this.createWordAlignmentMatrix(
        arcDto.alignment,
        arcDto.sourceSegmentEnd - arcDto.sourceSegmentStart,
        arcDto.targetTokens.length
      );
      arcs.push(
        new WordGraphArc(
          arcDto.prevState,
          arcDto.nextState,
          arcDto.score,
          arcDto.targetTokens,
          alignment,
          createRange(arcDto.sourceSegmentStart, arcDto.sourceSegmentEnd),
          Array.from(this.createTranslationSources(arcDto.sources)),
          arcDto.confidences
        )
      );
    }
    return new WordGraph(dto.sourceTokens, arcs, dto.finalStates, dto.initialStateScore);
  }

  private createTranslationResult(dto: TranslationResultDto): TranslationResult {
    return new TranslationResult(
      dto.translation,
      dto.sourceTokens,
      dto.targetTokens,
      dto.confidences,
      Array.from(this.createTranslationSources(dto.sources)),
      this.createWordAlignmentMatrix(dto.alignment, dto.sourceTokens.length, dto.targetTokens.length),
      dto.phrases.map(p => this.createPhrase(p))
    );
  }

  private *createTranslationSources(sources: TranslationSource[][]): Iterable<TranslationSources> {
    for (const source of sources) {
      let translationSources = TranslationSources.None;
      for (const translationSource of source) {
        switch (translationSource) {
          case TranslationSource.Primary:
            translationSources |= TranslationSources.Smt;
            break;
          case TranslationSource.Secondary:
            translationSources |= TranslationSources.Transfer;
            break;
          case TranslationSource.Human:
            translationSources |= TranslationSources.Prefix;
            break;
        }
      }
      yield translationSources;
    }
  }

  private createWordAlignmentMatrix(dto: AlignedWordPairDto[], i: number, j: number): WordAlignmentMatrix {
    const alignment = new WordAlignmentMatrix(i, j);
    for (const wordPairDto of dto) {
      alignment.set(wordPairDto.sourceIndex, wordPairDto.targetIndex, true);
    }
    return alignment;
  }

  private createPhrase(dto: PhraseDto): Phrase {
    return new Phrase(createRange(dto.sourceSegmentStart, dto.sourceSegmentEnd), dto.targetSegmentCut);
  }
}
