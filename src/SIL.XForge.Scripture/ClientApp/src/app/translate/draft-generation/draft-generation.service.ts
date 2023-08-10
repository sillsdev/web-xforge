import { Inject, Injectable } from '@angular/core';
import { VerseRef } from '@sillsdev/scripture';
import { EMPTY, Observable, of, throwError, timer } from 'rxjs';
import { catchError, distinct, map, shareReplay, switchMap, takeWhile } from 'rxjs/operators';
import { BuildStates } from 'src/app/machine-api/build-states';
import { HttpClient } from 'src/app/machine-api/http-client';
import { BuildDto } from '../../machine-api/build-dto';
import {
  activeBuildStates,
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
    @Inject(DRAFT_GENERATION_SERVICE_OPTIONS) private readonly options: DraftGenerationServiceOptions
  ) {}

  /**
   * Polls the build progress for specified project as long as build is active.
   * @param projectId The SF project id for the target translation.
   * @returns A hot observable BuildDto describing the state and progress of the current build job,
   * or the latest build job if no build is currently running, or undefined if no build has ever
   * been started.  Observable will complete when build is no longer active.
   */
  pollBuildProgress(projectId: string): Observable<BuildDto | undefined> {
    return timer(0, this.options.pollRate).pipe(
      switchMap(() => this.getBuildProgress(projectId)),
      takeWhile(job => activeBuildStates.includes(job?.state as BuildStates), true),
      distinct(job => `${job?.state}${job?.percentCompleted}`),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /**
   * Gets pretranslation build job state for specified project.
   * @param projectId The SF project id for the target translation.
   * @returns An observable BuildDto describing the state and progress of the current build job,
   * or the latest build job if no build is currently running, or undefined if no build has ever
   * been started.
   */
  getBuildProgress(projectId: string): Observable<BuildDto | undefined> {
    return this.httpClient.get<BuildDto>(`translation/builds/id:${projectId}?pretranslate=true`).pipe(
      map(res => {
        // TODO: Remove once state is upper-cased on server
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
        // If no build has ever been started, return undefined
        if (err.status === 404) {
          return of(undefined);
        }
        return throwError(err);
      })
    );
  }

  /**
   * Gets the last completed pre-translation build.
   * @param projectId The SF project id for the target translation.
   * @returns An observable BuildDto for the last build with state 'Completed',
   * or undefined if no build has ever been completed.
   */
  getLastCompletedBuild(projectId: string): Observable<BuildDto | undefined> {
    return this.httpClient
      .get<BuildDto>(`translation/engines/project:${projectId}/actions/getLastCompletedPreTranslationBuild`)
      .pipe(
        map(res => {
          // TODO: Remove once state is upper-cased on server
          // Conform 'state' to BuildStates enum
          if (res.data) {
            res.data.state = res.data.state.toUpperCase();
          }

          return res.data;
        }),
        catchError(err => {
          // If project doesn't exist on Serval, return undefined
          if (err.status === 404) {
            return of(undefined);
          }
          return throwError(err);
        })
      );
  }

  /**
   * Starts a pretranslation build job if one is not already active.
   * @param projectId The SF project id for the target translation.
   * @returns An observable BuildDto describing the state and progress of a currently active or newly started build job.
   */
  startBuildOrGetActiveBuild(projectId: string): Observable<BuildDto | undefined> {
    return this.getBuildProgress(projectId).pipe(
      switchMap((job?: BuildDto) => {
        // If existing build is currently active, return polling observable
        if (activeBuildStates.includes(job?.state as BuildStates)) {
          return this.pollBuildProgress(projectId);
        }

        // Otherwise, start build and then poll
        return this.startBuild(projectId).pipe(
          // No errors means build successfully started, so start polling
          switchMap(() => this.pollBuildProgress(projectId))
        );
      })
    );
  }

  /**
   * Cancels any pretranslation builds for the specified project.
   * @param projectId The SF project id for the target translation.
   */
  cancelBuild(projectId: string): Observable<void> {
    return this.httpClient.post<void>(`translation/pretranslations/cancel`, JSON.stringify(projectId)).pipe(
      map(res => res.data),
      catchError(err => {
        // Handle gracefully if no build is currently running
        if (err.status === 404) {
          return EMPTY;
        }
        return throwError(err);
      })
    );
  }

  /**
   * Gets the pretranslations for the specified book/chapter using the last completed build.
   * @param projectId The SF project id for the target translation.
   * @param book The book number.
   * @param chapter The chapter number.
   * @returns An observable dictionary of 'segmentRef -> segment text',
   * or an empty dictionary if no pretranslations exist.
   */
  getGeneratedDraft(projectId: string, book: number, chapter: number): Observable<DraftSegmentMap> {
    return this.httpClient
      .get<PreTranslationData>(`translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}`)
      .pipe(
        map(res => (res.data && this.toDraftSegmentMap(res.data.preTranslations)) ?? {}),
        catchError(err => {
          // If no pretranslations exist, return empty dictionary
          if (err.status === 404) {
            return of({});
          }
          return throwError(err);
        })
      );
  }

  /**
   * Calls the machine api to start a pretranslation build job.
   * This should only be called if no build is currently active.
   * @param projectId The SF project id for the target translation.
   */
  private startBuild(projectId: string): Observable<void> {
    return this.httpClient
      .post<void>(`translation/pretranslations`, JSON.stringify(projectId))
      .pipe(map(res => res.data));
  }

  /**
   * Transforms collection into dictionary of 'segmentRef -> segment text' for faster lookups.
   * @param preTranslations Collection returned from the machine api.
   * @returns A dictionary of 'segmentRef -> segment text'.
   */
  private toDraftSegmentMap(preTranslations: PreTranslation[]): DraftSegmentMap {
    const draftSegmentMap: DraftSegmentMap = {};

    for (let preTranslation of preTranslations) {
      const { success, verseRef } = VerseRef.tryParse(preTranslation.reference);

      if (success) {
        const segmentRef: string = `verse_${verseRef.chapter}_${verseRef.verse}`;

        // Ensure single space at end to not crowd a following verse number.
        // TODO: Make this more sophisticated to check next segment for `{ insert: { verse: {} } }` before adding space.
        draftSegmentMap[segmentRef] = preTranslation.translation.trimEnd() + ' ';
      }
    }

    return draftSegmentMap;
  }
}
