import { Inject, Injectable } from '@angular/core';
import { reduce } from 'lodash-es';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { Observable, of } from 'rxjs';
import { delay, map, repeat, shareReplay, switchMap, takeWhile } from 'rxjs/operators';
import { BuildStates } from 'src/app/machine-api/build-states';
import { HttpClient } from 'src/app/machine-api/http-client';
import { BuildDto } from '../../machine-api/build-dto';
import {
  ACTIVE_BUILD_STATES,
  DraftGenerationServiceOptions,
  DraftSegmentMap,
  DRAFT_GENERATION_SERVICE_OPTIONS,
  PreTranslation,
  PreTranslationData
} from './draft-generation';

@Injectable({
  providedIn: 'root'
})
export class DraftGenerationService {
  constructor(
    private readonly httpClient: HttpClient,
    @Inject(ACTIVE_BUILD_STATES) private readonly activeBuildStates: BuildStates[],
    @Inject(DRAFT_GENERATION_SERVICE_OPTIONS) private readonly options: DraftGenerationServiceOptions
  ) {}

  /**
   * Polls the build progress for specified project while build is active.
   * @param projectId The SF project id for the target translation.
   * @returns A hot observable 'BuildDto' describing the state and progress of the build job.
   */
  pollBuildProgress(projectId: string): Observable<BuildDto | undefined> {
    return this.getBuildProgress(projectId).pipe(
      repeat(),
      delay(this.options.pollRate),
      takeWhile(job => this.activeBuildStates.includes(job?.state as BuildStates), true),
      shareReplay(1)
    );
  }

  /**
   * Gets pretranslation build job state for specified project.
   * @param projectId The SF project id for the target translation.
   * @returns An observable 'BuildDto' describing the state and progress of the build job.
   */
  getBuildProgress(projectId: string): Observable<BuildDto | undefined> {
    return this.httpClient.get<BuildDto>(`translation/builds/id:${projectId}?pretranslate=true`).pipe(
      map(res => {
        if (res.data?.state === BuildStates.Faulted) {
          throw new Error('Error occurred during build: ' + res.data.message);
        }
        return res.data;
      })
    );
  }

  /**
   * Starts a pretranslation build job if one is not already under way.
   * @param projectId The SF project id for the target translation.
   * @returns An observable 'BuildDto' describing the state and progress of the build job.
   */
  startBuild(projectId: string): Observable<BuildDto | undefined> {
    return this.getBuildProgress(projectId).pipe(
      switchMap((job?: BuildDto) =>
        this.activeBuildStates.includes(job?.state as BuildStates)
          ? of(job)
          : this.httpClient
              .post<BuildDto>(`translation/pretranslations`, JSON.stringify(projectId))
              .pipe(map(res => res.data))
      )
    );
  }

  /**
   * Cancels any pretranslation builds for the specified project.
   * @param projectId The SF project id for the target translation.
   * @returns An observable 'BuildDto' describing the state and progress of the build job.
   */
  cancelBuild(projectId: string): Observable<BuildDto | undefined> {
    return this.httpClient
      .post<BuildDto>(`translation/pretranslations/cancel`, JSON.stringify(projectId))
      .pipe(map(res => res.data));
  }

  /**
   * Gets the pretranslations for the specified book/chapter.
   * @param projectId The SF project id for the target translation.
   * @param book The book number.
   * @param chapter The chapter number.
   * @returns An observable dictionary of segmentRef -> verse.
   */
  getGeneratedDraft(projectId: string, book: number, chapter: number): Observable<DraftSegmentMap> {
    return this.httpClient
      .get<PreTranslationData>(`translation/engines/project:${projectId}/actions/preTranslate/${book}_${chapter}`)
      .pipe(map(res => (res.data && this.toDraftSegmentMap(res.data.preTranslations)) ?? {}));
  }

  /**
   * Transforms collection into dictionary of segmentRef -> verse for faster lookups.
   * @param preTranslations Collection returned from the machine api.
   * @returns A dictionary of segmentRef -> verse.
   */
  private toDraftSegmentMap(preTranslations: PreTranslation[]): DraftSegmentMap {
    return reduce(
      preTranslations,
      (result: DraftSegmentMap, curr: PreTranslation) => {
        let verseRef = VerseRef.parse(curr.reference);
        const segmentRef = `verse_${verseRef.chapter}_${verseRef.verse}`;
        result[segmentRef] = curr.translation.trimEnd() + ' '; // Ensure single space at end
        return result;
      },
      {}
    );
  }
}
