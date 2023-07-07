import { Inject, Injectable } from '@angular/core';
import { reduce } from 'lodash-es';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { Observable, of, throwError, timer } from 'rxjs';
import { catchError, distinct, map, shareReplay, switchMap, takeWhile } from 'rxjs/operators';
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
   * Polls the build progress for specified project as long as build is active.
   * @param projectId The SF project id for the target translation.
   * @returns A hot observable BuildDto describing the state and progress of the build job
   * or undefined if no build is running.
   */
  pollBuildProgress(projectId: string): Observable<BuildDto | undefined> {
    return timer(0, this.options.pollRate).pipe(
      switchMap(() => this.getBuildProgress(projectId)),
      takeWhile(job => job === undefined || this.activeBuildStates.includes(job?.state as BuildStates), true),
      distinct(job => `${job?.state}${job?.percentCompleted}`),
      shareReplay(1)
    );
  }

  /**
   * Gets pretranslation build job state for specified project.
   * @param projectId The SF project id for the target translation.
   * @returns An observable BuildDto describing the state and progress of the build job
   * or undefined if no build is running.
   */
  getBuildProgress(projectId: string): Observable<BuildDto | undefined> {
    return this.httpClient.get<BuildDto>(`translation/builds/id:${projectId}?pretranslate=true`).pipe(
      map(res => {
        // Conform 'state' to BuildStates enum
        if (res.data) {
          res.data.state = res.data.state.toUpperCase();
        }

        if (res.data?.state === BuildStates.Faulted) {
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

  /**
   * Starts a pretranslation build job if one is not already under way.
   * @param projectId The SF project id for the target translation.
   * @returns An observable BuildDto describing the state and progress of a currently running or just started build job.
   */
  startBuild(projectId: string): Observable<BuildDto | undefined> {
    return this.getBuildProgress(projectId).pipe(
      switchMap((job?: BuildDto) =>
        // If existing build is currently active, return polling observable.  Otherwise, start build and then poll.
        this.activeBuildStates.includes(job?.state as BuildStates)
          ? this.pollBuildProgress(projectId)
          : this.httpClient.post<void>(`translation/pretranslations`, JSON.stringify(projectId)).pipe(
              // No errors means build successfully started, so start polling
              switchMap(() => this.pollBuildProgress(projectId)),

              // Polling should not return undefined since build started successfully
              map(job => {
                if (!job) {
                  throw new Error('Empty build after successful start.');
                }

                return job!;
              })
            )
      )
    );
  }

  /**
   * Cancels any pretranslation builds for the specified project.
   * @param projectId The SF project id for the target translation.
   */
  cancelBuild(projectId: string): Observable<void> {
    return this.httpClient
      .post<void>(`translation/pretranslations/cancel`, JSON.stringify(projectId))
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
