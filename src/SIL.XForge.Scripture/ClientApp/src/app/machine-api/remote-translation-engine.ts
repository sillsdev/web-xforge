import {
  createRange,
  MAX_SEGMENT_LENGTH,
  InteractiveTranslationEngine,
  Phrase,
  ProgressStatus,
  Range,
  TranslationResult,
  TranslationResultBuilder,
  WordAlignmentMatrix,
  WordGraph,
  WordGraphArc
} from '@sillsdev/machine';
import { Observable, of, throwError } from 'rxjs';
import { catchError, expand, filter, map, mergeMap, startWith, takeWhile } from 'rxjs/operators';
import { AlignedWordPairDto } from './aligned-word-pair-dto';
import { BuildDto } from './build-dto';
import { BuildStates } from './build-states';
import { HttpClient } from './http-client';
import { EngineDto } from './engine-dto';
import { PhraseDto } from './phrase-dto';
import { RangeDto } from './range-dto';
import { TranslationEngineStats } from './translation-engine-stats';
import { SegmentPairDto } from './segment-pair-dto';
import { TranslationResultDto } from './translation-result-dto';
import { WordGraphDto } from './word-graph-dto';

export class RemoteTranslationEngine implements InteractiveTranslationEngine {
  constructor(public readonly projectId: string, private readonly httpClient: HttpClient) {}

  async translate(segment: string[]): Promise<TranslationResult> {
    if (segment.length > MAX_SEGMENT_LENGTH) {
      const builder = new TranslationResultBuilder();
      return builder.toResult(segment.length);
    }
    const response = await this.httpClient
      .post<TranslationResultDto>(`translation/engines/project:${this.projectId}/actions/translate`, segment)
      .toPromise();
    return this.createTranslationResult(response.data as TranslationResultDto, segment);
  }

  async translateN(n: number, segment: string[]): Promise<TranslationResult[]> {
    if (segment.length > MAX_SEGMENT_LENGTH) {
      return [];
    }
    const response = await this.httpClient
      .post<TranslationResultDto[]>(`translation/engines/project:${this.projectId}/actions/translate/${n}`, segment)
      .toPromise();
    const dto = response.data as TranslationResultDto[];
    return dto.map(dto => this.createTranslationResult(dto, segment));
  }

  async getWordGraph(segment: string[]): Promise<WordGraph> {
    if (segment.length > MAX_SEGMENT_LENGTH) {
      return new WordGraph();
    }
    const response = await this.httpClient
      .post<WordGraphDto>(`translation/engines/project:${this.projectId}/actions/getWordGraph`, segment)
      .toPromise();
    return this.createWordGraph(response.data as WordGraphDto);
  }

  async trainSegment(sourceSegment: string[], targetSegment: string[], sentenceStart: boolean = true): Promise<void> {
    const pairDto: SegmentPairDto = { sourceSegment, targetSegment, sentenceStart };
    await this.httpClient
      .post(`translation/engines/project:${this.projectId}/actions/trainSegment`, pairDto)
      .toPromise();
  }

  train(): Observable<ProgressStatus> {
    return this.getEngine(this.projectId).pipe(
      mergeMap(e => this.createBuild(e.id)),
      mergeMap(b => this.pollBuildProgress('id', b.id, b.revision + 1).pipe(startWith(b)))
    );
  }

  async startTraining(): Promise<void> {
    await this.getEngine(this.projectId)
      .pipe(mergeMap(e => this.createBuild(e.id)))
      .toPromise();
  }

  listenForTrainingStatus(): Observable<ProgressStatus> {
    return this.getEngine(this.projectId).pipe(mergeMap(e => this.pollBuildProgress('engine', e.id, 0)));
  }

  async getStats(): Promise<TranslationEngineStats> {
    const engineDto = await this.getEngine(this.projectId).toPromise();
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

  private pollBuildProgress(locatorType: string, locator: string, minRevision: number): Observable<ProgressStatus> {
    return this.getBuildProgress(locatorType, locator, minRevision).pipe(
      expand(buildDto => {
        if (buildDto != null) {
          locatorType = 'id';
          locator = buildDto.id;
          minRevision = buildDto.revision + 1;
        }
        return this.getBuildProgress(locatorType, locator, minRevision);
      }),
      filter(buildDto => buildDto != null),
      map(buildDto => buildDto as BuildDto),
      takeWhile(buildDto => buildDto.state === BuildStates.Pending || buildDto.state === BuildStates.Active, true)
    );
  }

  private getBuildProgress(
    locatorType: string,
    locator: string,
    minRevision: number
  ): Observable<BuildDto | undefined> {
    return this.httpClient
      .get<BuildDto>(`translation/builds/${locatorType}:${locator}?minRevision=${minRevision}`)
      .pipe(
        map(res => {
          if (res.data != null && res.data.state === BuildStates.Faulted) {
            throw new Error('Error occurred during build: ' + res.data.message);
          }
          return res.data;
        }),
        catchError(err => {
          if (err.status === 404) {
            return of(undefined);
          } else {
            return throwError(err);
          }
        })
      );
  }

  private createWordGraph(dto: WordGraphDto): WordGraph {
    const arcs: WordGraphArc[] = [];
    for (const arcDto of dto.arcs) {
      const alignment = this.createWordAlignmentMatrix(
        arcDto.alignment,
        arcDto.sourceSegmentRange.end - arcDto.sourceSegmentRange.start,
        arcDto.words.length
      );
      arcs.push(
        new WordGraphArc(
          arcDto.prevState,
          arcDto.nextState,
          arcDto.score,
          arcDto.words,
          alignment,
          this.createRange(arcDto.sourceSegmentRange),
          arcDto.sources,
          arcDto.confidences
        )
      );
    }
    return new WordGraph(arcs, dto.finalStates, dto.initialStateScore);
  }

  private createTranslationResult(dto: TranslationResultDto, sourceSegment: string[]): TranslationResult {
    return new TranslationResult(
      sourceSegment.length,
      dto.target,
      dto.confidences,
      dto.sources,
      this.createWordAlignmentMatrix(dto.alignment, sourceSegment.length, dto.target.length),
      dto.phrases.map(p => this.createPhrase(p))
    );
  }

  private createWordAlignmentMatrix(dto: AlignedWordPairDto[], i: number, j: number): WordAlignmentMatrix {
    const alignment = new WordAlignmentMatrix(i, j);
    for (const wordPairDto of dto) {
      alignment.set(wordPairDto.sourceIndex, wordPairDto.targetIndex, true);
    }
    return alignment;
  }

  private createPhrase(dto: PhraseDto): Phrase {
    return new Phrase(this.createRange(dto.sourceSegmentRange), dto.targetSegmentCut, dto.confidence);
  }

  private createRange(dto: RangeDto): Range {
    return createRange(dto.start, dto.end);
  }
}
