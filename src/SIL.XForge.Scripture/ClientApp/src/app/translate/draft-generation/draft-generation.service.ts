import { Inject, Injectable } from '@angular/core';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { DeltaOperation } from 'rich-text';
import { EMPTY, Observable, of, throwError, timer } from 'rxjs';
import { catchError, distinct, map, shareReplay, switchMap, takeWhile } from 'rxjs/operators';
import { Snapshot } from 'xforge-common/models/snapshot';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { HttpClient } from '../../machine-api/http-client';
import {
  activeBuildStates,
  BuildConfig,
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
    private readonly onlineStatusService: OnlineStatusService,
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
      distinct(job => `${job?.state}${job?.queueDepth}${job?.percentCompleted}`),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /**
   * Gets pre-translation build job state for specified project.
   * @param projectId The SF project id for the target translation.
   * @returns An observable BuildDto describing the state and progress of the current build job,
   * or the latest build job if no build is currently running, or undefined if no build has ever
   * been started.
   */
  getBuildProgress(projectId: string): Observable<BuildDto | undefined> {
    if (!this.onlineStatusService.isOnline) {
      return of(undefined);
    }
    return this.httpClient.get<BuildDto>(`translation/builds/id:${projectId}?pretranslate=true`).pipe(
      map(res => res.data),
      catchError(err => {
        // If no build has ever been started, return undefined
        if (err.status === 403 || err.status === 404) {
          return of(undefined);
        }
        return throwError(() => err);
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
    if (!this.onlineStatusService.isOnline) {
      return of(undefined);
    }
    return this.httpClient
      .get<BuildDto>(`translation/engines/project:${projectId}/actions/getLastCompletedPreTranslationBuild`)
      .pipe(
        map(res => res.data),
        catchError(err => {
          // If project doesn't exist on Serval, return undefined
          if (err.status === 403 || err.status === 404) {
            return of(undefined);
          }
          return throwError(() => err);
        })
      );
  }

  /**
   * Starts a pre-translation build job if one is not already active.
   * @param buildConfig The build configuration.
   * @returns An observable BuildDto describing the state and progress of a currently active or newly started build job.
   */
  startBuildOrGetActiveBuild(buildConfig: BuildConfig): Observable<BuildDto | undefined> {
    return this.getBuildProgress(buildConfig.projectId).pipe(
      switchMap((job: BuildDto | undefined) => {
        // If existing build is currently active, return polling observable
        if (activeBuildStates.includes(job?.state as BuildStates)) {
          return this.pollBuildProgress(buildConfig.projectId);
        }

        // Otherwise, start build and then poll
        return this.startBuild(buildConfig).pipe(
          // No errors means build successfully started, so start polling
          switchMap(() => this.pollBuildProgress(buildConfig.projectId))
        );
      })
    );
  }

  /**
   * Cancels any pre-translation builds for the specified project.
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
        return throwError(() => err);
      })
    );
  }

  /**
   * Gets the pre-translations for the specified book/chapter using the last completed build.
   * @param projectId The SF project id for the target translation.
   * @param book The book number.
   * @param chapter The chapter number.
   * @returns An observable dictionary of 'segmentRef -> segment text',
   * or an empty dictionary if no pre-translations exist.
   */
  getGeneratedDraft(projectId: string, book: number, chapter: number): Observable<DraftSegmentMap> {
    if (!this.onlineStatusService.isOnline) {
      return of({});
    }
    return this.httpClient
      .get<PreTranslationData>(`translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}`)
      .pipe(
        map(res => (res.data && this.toDraftSegmentMap(res.data.preTranslations)) ?? {}),
        catchError(err => {
          // If no pre-translations exist, return empty dictionary
          if (err.status === 403 || err.status === 404 || err.status === 409) {
            return of({});
          }
          return throwError(() => err);
        })
      );
  }

  /**
   * Gets the pre-translations as delta operations for the specified book/chapter using the last completed build.
   * @param projectId The SF project id for the target translation.
   * @param book The book number.
   * @param chapter The chapter number.
   * @returns An array of delta operations or an empty array at if no pre-translations exist.
   * The 405 error that occurs when there is no USFM support is thrown to the caller.
   */
  getGeneratedDraftDeltaOperations(projectId: string, book: number, chapter: number): Observable<DeltaOperation[]> {
    if (!this.onlineStatusService.isOnline) {
      return of([]);
    }
    return this.httpClient
      .get<Snapshot<TextData> | undefined>(
        `translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/delta`
      )
      .pipe(
        map(res => res.data?.data.ops ?? []),
        catchError(err => {
          // If no pre-translations exist, return empty dictionary
          if (err.status === 403 || err.status === 404 || err.status === 409) {
            return of([]);
          }
          return throwError(() => err);
        })
      );
  }

  /**
   * Determines if a draft exists for the specified book/chapter.
   * @param projectId The SF project id for the target translation.
   * @param book The book number.
   * @param chapter The chapter number.
   * @returns An observable indicating if a draft exists.
   */
  draftExists(projectId: string, book: number, chapter: number): Observable<boolean> {
    return this.getGeneratedDraft(projectId, book, chapter).pipe(map(draft => Object.keys(draft).length > 0));
  }

  /**
   * Calls the machine api to start a pre-translation build job.
   * This should only be called if no build is currently active.
   * @param buildConfig The build configuration.
   */
  private startBuild(buildConfig: BuildConfig): Observable<void> {
    return this.httpClient.post<void>(`translation/pretranslations`, buildConfig).pipe(map(res => res.data));
  }

  /**
   * Transforms collection into dictionary of 'segmentRef -> segment text' for faster lookups.
   * @param preTranslations Collection returned from the machine api.
   * @returns A dictionary of 'segmentRef -> segment text'.
   */
  private toDraftSegmentMap(preTranslations: PreTranslation[]): DraftSegmentMap {
    const draftSegmentMap: DraftSegmentMap = {};

    for (let preTranslation of preTranslations) {
      // Ensure single space at end to not crowd a following verse number.
      // TODO: Make this more sophisticated to check next segment for `{ insert: { verse: {} } }` before adding space?
      // TODO: ... and investigate if there is a better way to display a space before the next verse marker
      // TODO: ... without counting the space as part of the verse text.
      draftSegmentMap[preTranslation.reference] = preTranslation.translation.trimEnd() + ' ';
    }

    return draftSegmentMap;
  }
}
