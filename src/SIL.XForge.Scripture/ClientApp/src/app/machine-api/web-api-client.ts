import { Observable, of, throwError } from 'rxjs';
import { catchError, expand, filter, map, mergeMap, startWith, takeWhile } from 'rxjs/operators';
import {
  createRange,
  Phrase,
  ProgressStatus,
  Range,
  TranslationResult,
  WordAlignmentMatrix,
  WordGraph,
  WordGraphArc
} from '@sillsdev/machine';
import { TranslationEngineStats } from './translation-engine-stats';
import { AlignedWordPairDto } from './aligned-word-pair-dto';
import { BuildDto } from './build-dto';
import { BuildStates } from './build-states';
import { EngineDto } from './engine-dto';
import { HttpClient } from './http-client';
import { PhraseDto } from './phrase-dto';
import { RangeDto } from './range-dto';
import { SegmentPairDto } from './segment-pair-dto';
import { TranslationResultDto } from './translation-result-dto';
import { WordGraphDto } from './word-graph-dto';

export class WebApiClient {
  constructor(public http: HttpClient) {}

  async translate(projectId: string, sourceSegment: string[]): Promise<TranslationResult> {
    const response = await this.http
      .post<TranslationResultDto>(`translation/engines/project:${projectId}/actions/translate`, sourceSegment)
      .toPromise();
    return this.createTranslationResult(response.data as TranslationResultDto, sourceSegment);
  }

  async translateNBest(projectId: string, n: number, sourceSegment: string[]): Promise<TranslationResult[]> {
    const response = await this.http
      .post<TranslationResultDto[]>(`translation/engines/project:${projectId}/actions/translate/${n}`, sourceSegment)
      .toPromise();
    const dtos = response.data as TranslationResultDto[];
    return dtos.map(dto => this.createTranslationResult(dto, sourceSegment));
  }

  async getWordGraph(projectId: string, sourceSegment: string[]): Promise<WordGraph> {
    const response = await this.http
      .post<WordGraphDto>(`translation/engines/project:${projectId}/actions/getWordGraph`, sourceSegment)
      .toPromise();
    return this.createWordGraph(response.data as WordGraphDto);
  }

  async trainSegmentPair(
    projectId: string,
    sourceSegment: string[],
    targetSegment: string[],
    sentenceStart: boolean
  ): Promise<void> {
    const pairDto: SegmentPairDto = { sourceSegment, targetSegment, sentenceStart };
    await this.http.post(`translation/engines/project:${projectId}/actions/trainSegment`, pairDto).toPromise();
  }

  async startTraining(projectId: string): Promise<void> {
    await this.getEngine(projectId)
      .pipe(mergeMap(e => this.createBuild(e.id)))
      .toPromise();
  }

  train(projectId: string): Observable<ProgressStatus> {
    return this.getEngine(projectId).pipe(
      mergeMap(e => this.createBuild(e.id)),
      mergeMap(b => this.pollBuildProgress('id', b.id, b.revision + 1).pipe(startWith(b)))
    );
  }

  listenForTrainingStatus(projectId: string): Observable<ProgressStatus> {
    return this.getEngine(projectId).pipe(mergeMap(e => this.pollBuildProgress('engine', e.id, 0)));
  }

  async getEngineStats(projectId: string): Promise<TranslationEngineStats> {
    const engineDto = await this.getEngine(projectId).toPromise();
    return { confidence: engineDto.confidence, trainedSegmentCount: engineDto.trainedSegmentCount };
  }

  private getEngine(projectId: string): Observable<EngineDto> {
    return this.http.get<EngineDto>(`translation/engines/project:${projectId}`).pipe(map(res => res.data as EngineDto));
  }

  private createBuild(engineId: string): Observable<BuildDto> {
    return this.http
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
    return this.http.get<BuildDto>(`translation/builds/${locatorType}:${locator}?minRevision=${minRevision}`).pipe(
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
