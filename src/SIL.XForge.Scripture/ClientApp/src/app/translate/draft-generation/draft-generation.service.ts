import { Inject, Injectable } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { DraftUsfmConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { DeltaOperation } from 'rich-text';
import { defer, EMPTY, Observable, of, throwError, timer } from 'rxjs';
import { catchError, distinct, map, shareReplay, switchMap, takeWhile } from 'rxjs/operators';

import { I18nService } from 'xforge-common/i18n.service';
import { Snapshot } from 'xforge-common/models/snapshot';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { Revision } from '../../core/paratext.service';
import { BuildDto } from '../../machine-api/build-dto';
import { DraftUsfmBook, DraftUsfmDto } from '../../machine-api/draft-usfm-dto';
import { HttpClient } from '../../machine-api/http-client';
import { interpretTypes, ServalBuildReportDto } from '../../serval-administration/serval-build-report';
import { formatDateForFilename, getBookFileNameDigits } from '../../shared/utils';
import { BuildConfidences } from './build-confidences/build-confidences';
import {
  activeBuildStates,
  BuildConfig,
  DRAFT_GENERATION_SERVICE_OPTIONS,
  DraftGenerationServiceOptions,
  StartBuildResult
} from './draft-generation';

@Injectable({
  providedIn: 'root'
})
export class DraftGenerationService {
  // This is just after SFv5.33.0 was released
  readonly draftHistoryCutOffDate: Date = new Date('2025-06-03T21:00:00Z');

  constructor(
    private readonly httpClient: HttpClient,
    private readonly noticeService: NoticeService,
    private readonly onlineStatusService: OnlineStatusService,
    @Inject(DRAFT_GENERATION_SERVICE_OPTIONS) private readonly options: DraftGenerationServiceOptions,
    private readonly i18n: I18nService
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
      takeWhile(job => job != null && activeBuildStates.includes(job.state), true),
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
    return this.httpClient.get<BuildDto>(`translation/builds/id:${projectId}?preTranslate=true`).pipe(
      map(res => res.data),
      catchError(err => {
        // If no build has ever been started, return undefined
        if (err.status === 403 || err.status === 404) {
          return of(undefined);
        }

        this.noticeService.showError(this.i18n.translateStatic('draft_generation.temporarily_unavailable'));
        return of(undefined);
      })
    );
  }

  /**
   * Gets the build confidence scores for a build, if they are present.
   * @param projectId The Scripture Forge project identifier.
   * @param buildId The Serval build identifier.
   * @returns The build confidences if present, otherwise undefined if they are not present or the user is offline.
   */
  getBuildConfidences(projectId: string, buildId: string): Observable<BuildConfidences | undefined> {
    if (!this.onlineStatusService.isOnline) {
      return of(undefined);
    }
    return this.httpClient.get<BuildConfidences>(`translation/builds/id:${projectId}.${buildId}/confidences`).pipe(
      map(res => res.data),
      catchError(err => {
        // If build confidences do not exist or the user does not have permission, return undefined
        if (err.status === 403 || err.status === 404) {
          return of(undefined);
        }

        this.noticeService.showError(this.i18n.translateStatic('draft_generation.temporarily_unavailable'));
        return of(undefined);
      })
    );
  }

  /**
   * Gets pre-translation builds for specified project.
   * @param projectId The SF project id for the target translation.
   * @returns An observable array of BuildDto objects, describing
   * the state and progress of past and present builds.
   */
  getBuildHistory(projectId: string): Observable<BuildDto[] | undefined> {
    if (!this.onlineStatusService.isOnline) {
      return of(undefined);
    }
    return this.httpClient.get<BuildDto[]>(`translation/builds/project:${projectId}?preTranslate=true`).pipe(
      map(res => res.data),
      map(res =>
        res?.filter(
          build =>
            build.additionalInfo?.dateRequested != null &&
            new Date(build.additionalInfo.dateRequested) >= this.draftHistoryCutOffDate
        )
      ),
      catchError(err => {
        // If no build has ever been started, return undefined
        if (err.status === 403 || err.status === 404) {
          return of(undefined);
        }

        this.noticeService.showError(this.i18n.translateStatic('draft_generation.temporarily_unavailable'));
        return of(undefined);
      })
    );
  }

  /**
   * Gets Serval builds created since the specified timestamp.
   */
  getBuildsSince(since: Date): Observable<ServalBuildReportDto[] | undefined> {
    if (!this.onlineStatusService.isOnline) {
      return of(undefined);
    }

    const sinceIso: string = since.toISOString();
    return this.httpClient.get<ServalBuildReportDto[]>(`translation/builds/since:${sinceIso}`).pipe(
      map(res => this.interpretTypesMany(res.data)),
      catchError(err => {
        if (err.status === 404) {
          return of(undefined);
        }
        console.error(err?.message ?? err);
        this.noticeService.showError(this.i18n.translateStatic('draft_generation.problem_fetching_build_history'));
        return of(undefined);
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

          this.noticeService.showError(this.i18n.translateStatic('draft_generation.temporarily_unavailable'));
          return of(undefined);
        })
      );
  }

  /** Apply type conformity (dates, status enum) to a set of ServalBuildReportDto objects from JSON. */
  private interpretTypesMany(reports: ServalBuildReportDto[] | undefined): ServalBuildReportDto[] | undefined {
    if (reports == null) {
      return undefined;
    }
    return reports.map(report => interpretTypes(report));
  }

  /**
   * Gets the last pre-translation build regardless of state (Completed, Running, Queued, Faulted, or Canceled).
   * This is a simpler accessor than getLastCompletedBuild() and can be used when the consumer
   * wants the most recent build even if it has not yet completed.
   * @param projectId The SF project id for the target translation.
   * @returns An observable BuildDto for the last pre-translation build, or undefined if no build has ever run.
   */
  getLastPreTranslationBuild(projectId: string): Observable<BuildDto | undefined> {
    if (!this.onlineStatusService.isOnline) {
      return of(undefined);
    }
    return this.httpClient
      .get<BuildDto>(`translation/engines/project:${projectId}/actions/getLastPreTranslationBuild`)
      .pipe(
        map(res => res.data),
        catchError(err => {
          // If project doesn't exist on Serval, return undefined
          if (err.status === 403 || err.status === 404) {
            return of(undefined);
          }

          this.noticeService.showError(this.i18n.translateStatic('draft_generation.temporarily_unavailable'));
          return of(undefined);
        })
      );
  }

  /** Gets the build exactly as Serval returns it */
  getRawBuild(buildId: string): Observable<Object | undefined> {
    if (!this.onlineStatusService.isOnline) {
      return of(undefined);
    }
    return this.httpClient.get<Object>(`translation/builds/id:${buildId}/raw?preTranslate=true`).pipe(
      map(res => res.data),
      catchError(() => of(undefined))
    );
  }

  /** Gets the engine exactly as Serval returns it */
  getRawEngine(projectId: string, preTranslate: boolean): Observable<Object | undefined> {
    if (!this.onlineStatusService.isOnline) {
      return of(undefined);
    }
    return this.httpClient
      .get<Object>(`translation/engines/project:${projectId}/raw?pretranslate=${preTranslate}`)
      .pipe(
        map(res => res.data),
        catchError(() => of(undefined))
      );
  }

  /**
   * Starts a pre-translation build job, or joins the build that is already active for the project.
   * @param buildConfig The build configuration.
   * @returns An observable of the build state and progress, with a flag indicating whether an already-active
   * build was joined rather than a new build started (in which case the given configuration was not used).
   * Emits undefined if the build could not be started.
   */
  startBuildOrGetActiveBuild(buildConfig: BuildConfig): Observable<StartBuildResult | undefined> {
    return this.getBuildProgress(buildConfig.projectId).pipe(
      switchMap((job: BuildDto | undefined) => {
        // If existing build is currently active, return polling observable
        if (job != null && activeBuildStates.includes(job.state)) {
          return this.joinActiveBuild(buildConfig.projectId);
        }

        // Otherwise, start build and then poll
        return this.httpClient.post<void>(`translation/pretranslations`, buildConfig).pipe(
          map(() => 'started' as const),
          catchError(err => {
            if (err.status === 401) {
              // Expired Paratext credentials. Rethrow to be caught by DraftGenerationComponent.startBuild()
              throw err;
            }

            if (err.status === 409) {
              // Another request (another user, or this user in another tab) started a build between this
              // client's last check and this request landing on the server
              return of('conflict' as const);
            }

            if (err.status === 403 || err.status === 404) {
              return of('failed' as const);
            }

            if (err.status === 429) {
              this.noticeService.showError(this.i18n.translateStatic('draft_generation.quota_exceeded'));
              return of('failed' as const);
            }

            this.noticeService.showError(this.i18n.translateStatic('draft_generation.temporarily_unavailable'));
            return of('failed' as const);
          }),
          switchMap(outcome => {
            if (outcome === 'failed') return of(undefined);
            if (outcome === 'conflict') return this.joinActiveBuild(buildConfig.projectId);

            // No error means build successfully started, so start polling
            return this.pollBuildProgress(buildConfig.projectId).pipe(
              map(job => ({ joinedExistingBuild: false, job }))
            );
          })
        );
      })
    );
  }

  /** Polls the build that is already active for the project, flagging that no new build was started. */
  private joinActiveBuild(projectId: string): Observable<StartBuildResult> {
    return this.pollBuildProgress(projectId).pipe(map(job => ({ joinedExistingBuild: true, job })));
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
   * Gets the pre-translations as delta operations for the specified book/chapter using the last completed build.
   * @param projectId The SF project id for the target translation.
   * @param book The book number.
   * @param chapter The chapter number.
   * @param timestamp The timestamp to download the draft at. If undefined, the latest draft will be downloaded.
   * @returns An array of delta operations or an empty array at if no pre-translations exist.
   * The 405 error that occurs when there is no USFM support is thrown to the caller.
   */
  getGeneratedDraftDeltaOperations(
    projectId: string,
    book: number,
    chapter: number,
    timestamp?: Date,
    usfmConfig?: DraftUsfmConfig
  ): Observable<DeltaOperation[]> {
    if (!this.onlineStatusService.isOnline) {
      return of([]);
    }
    let url = `translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/delta`;
    const params = new URLSearchParams();
    if (timestamp != null) {
      params.append('timestamp', timestamp.toISOString());
    }
    if (usfmConfig != null) {
      params.append('paragraphFormat', usfmConfig.paragraphFormat);
      params.append('quoteFormat', usfmConfig.quoteFormat);
    }
    if (params.size > 0) {
      url += `?${params.toString()}`;
    }
    return this.httpClient.get<Snapshot<TextData> | undefined>(url).pipe(
      map(res => res.data?.data.ops ?? []),
      catchError(err => {
        // If no pre-translations exist, return empty array
        if (err.status === 403 || err.status === 404 || err.status === 405 || err.status === 409) {
          return of([]);
        }

        this.noticeService.showError(this.i18n.translateStatic('draft_generation.temporarily_unavailable'));
        return of([]);
      })
    );
  }

  /**
   * Gets the pre-translations as delta operations for the specified book using the last completed build.
   * @param projectId The SF project id for the target translation.
   * @param book The book number.
   * @param timestamp The timestamp to download the draft at. If undefined, the latest draft will be downloaded.
   * @returns A map of chapter numbers to arrays of delta operations or an empty map if no pre-translations exist.
   * The 405 error that occurs when there is no USFM support is thrown to the caller.
   */
  getGeneratedDraftBookDeltaOperations(
    projectId: string,
    book: number,
    timestamp: Date | undefined,
    usfmConfig: DraftUsfmConfig | undefined
  ): Observable<Map<string, DeltaOperation[]>> {
    if (!this.onlineStatusService.isOnline) {
      return of(new Map<string, DeltaOperation[]>());
    }
    let url = `translation/engines/project:${projectId}/actions/pretranslate/${book}/delta`;
    const params = new URLSearchParams();
    if (timestamp != null) {
      params.append('timestamp', timestamp.toISOString());
    }
    if (usfmConfig != null) {
      params.append('paragraphFormat', usfmConfig.paragraphFormat);
      params.append('quoteFormat', usfmConfig.quoteFormat);
    }
    if (params.size > 0) {
      url += `?${params.toString()}`;
    }
    return this.httpClient.get<Map<string, Snapshot<TextData>> | undefined>(url).pipe(
      map(res => {
        const chapterDeltas = new Map<string, DeltaOperation[]>();
        if (res.data != null) {
          for (const [chapter, snapshot] of Object.entries(res.data)) {
            chapterDeltas.set(chapter, snapshot.data.ops ?? []);
          }
        }
        return chapterDeltas;
      }),
      catchError(err => {
        // If no pre-translations exist, return empty map
        if (err.status === 403 || err.status === 404 || err.status === 405 || err.status === 409) {
          return of(new Map<string, DeltaOperation[]>());
        }

        this.noticeService.showError(this.i18n.translateStatic('draft_generation.temporarily_unavailable'));
        return of(new Map<string, DeltaOperation[]>());
      })
    );
  }

  /**
   * Gets the draft revisions saved in Scripture Forge for the specified book/chapter.
   * @param projectId The SF project id for the target translation.
   * @param book The book number.
   * @param chapter The chapter number.
   * @returns The Draft revisions, or undefined if an issue occurred retrieving the revisions.
   */
  getGeneratedDraftHistory(projectId: string, book: number, chapter: number): Observable<Revision[] | undefined> {
    if (!this.onlineStatusService.isOnline) {
      return of(undefined);
    }
    return this.httpClient
      .get<Revision[] | undefined>(
        `translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/history`
      )
      .pipe(
        map(res => res?.data ?? []),
        map(revisions => revisions.filter(revision => new Date(revision.timestamp) >= this.draftHistoryCutOffDate)),
        catchError(err => {
          // If no pre-translations exist, return undefined
          if (err.status === 403 || err.status === 404 || err.status === 409) {
            return of(undefined);
          }

          this.noticeService.showError(this.i18n.translateStatic('draft_generation.temporarily_unavailable'));
          return of(undefined);
        })
      );
  }

  /**
   * Downloads the draft a build generated as a zip of USFM files, one per book.
   * @param projectDoc The project document.
   * @param build The build that generated the draft.
   * @returns An observable that completes once the zip file has been downloaded to the user's machine.
   */
  downloadDraft(projectDoc: SFProjectProfileDoc | undefined, build: BuildDto | undefined): Observable<void> {
    return defer(() => {
      if (projectDoc?.data == null || build == null) {
        return throwError(() => this.draftDownloadError);
      }

      const projectShortName: string = projectDoc.data.shortName;
      const url = `translation/builds/id:${build.id}/usfm`;

      // The zip file is named for the build that generated the draft
      let filename: string = projectShortName + ' Draft';
      if (build.additionalInfo?.dateFinished != null) {
        filename += ' ' + formatDateForFilename(new Date(build.additionalInfo.dateFinished));
      }

      filename += '.zip';

      return this.httpClient.get<DraftUsfmDto>(url).pipe(
        switchMap(res => {
          const books: DraftUsfmBook[] = res.data?.books ?? [];
          if (books.length === 0) {
            throw this.draftDownloadError;
          }

          return this.zipDraftBooks(books, projectShortName);
        }),
        map(blob => saveAs(blob, filename)),
        catchError(() => throwError(() => this.draftDownloadError))
      );
    });
  }

  /**
   * Zips the USFM for each book into a single archive, one file per book.
   * @param books The books to zip.
   * @param projectShortName The project short name, which is part of each file name.
   * @returns A promise of the zip file contents.
   */
  private zipDraftBooks(books: DraftUsfmBook[], projectShortName: string): Promise<Blob> {
    const zip = new JSZip();
    for (const book of books) {
      const bookNum: number = Canon.bookIdToNumber(book.bookId);
      const fileName: string = getBookFileNameDigits(bookNum) + book.bookId + projectShortName + '.SFM';
      zip.file(fileName, book.usfm);
    }

    return zip.generateAsync({ type: 'blob' });
  }

  private get draftDownloadError(): Error {
    return new Error(this.i18n.translateStatic('draft_generation.info_alert_download_error'));
  }
}
