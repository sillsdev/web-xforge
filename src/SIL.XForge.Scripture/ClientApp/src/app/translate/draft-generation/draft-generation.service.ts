import { Inject, Injectable } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { DeltaOperation } from 'rich-text';
import { EMPTY, firstValueFrom, Observable, of, throwError, timer } from 'rxjs';
import { catchError, distinct, map, shareReplay, switchMap, takeWhile } from 'rxjs/operators';
import { Snapshot } from 'xforge-common/models/snapshot';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { HttpClient } from '../../machine-api/http-client';
import { getBookFileNameDigits } from '../../shared/utils';
import {
  activeBuildStates,
  BuildConfig,
  DRAFT_GENERATION_SERVICE_OPTIONS,
  DraftGenerationServiceOptions,
  DraftSegmentMap,
  DraftZipProgress,
  PreTranslation,
  PreTranslationData
} from './draft-generation';

@Injectable({
  providedIn: 'root'
})
export class DraftGenerationService {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly noticeService: NoticeService,
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

        this.noticeService.showError(translate('draft_generation.temporarily_unavailable'));
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

          this.noticeService.showError(translate('draft_generation.temporarily_unavailable'));
          return of(undefined);
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

          this.noticeService.showError(translate('draft_generation.temporarily_unavailable'));
          return of({});
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
      .get<
        Snapshot<TextData> | undefined
      >(`translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/delta`)
      .pipe(
        map(res => res.data?.data.ops ?? []),
        catchError(err => {
          // If no pre-translations exist, return empty array
          if (err.status === 403 || err.status === 404 || err.status === 409) {
            return of([]);
          } else if (err.status === 405) {
            // Rethrow a 405 so the frontend can use getGeneratedDraft()
            return throwError(() => err);
          }

          this.noticeService.showError(translate('draft_generation.temporarily_unavailable'));
          return of([]);
        })
      );
  }

  /**
   * Gets the pre-translation USFM for the specified book/chapter using the last completed build.
   * @param projectId The SF project id for the target translation.
   * @param book The book number.
   * @param chapter The chapter number. Specify 0 to return all chapters in the book.
   * @returns An observable string of USFM data, or undefined if no pre-translations exist.
   */
  getGeneratedDraftUsfm(projectId: string, book: number, chapter: number): Observable<string | undefined> {
    if (!this.onlineStatusService.isOnline) {
      return of(undefined);
    }
    return this.httpClient
      .get<string>(`translation/engines/project:${projectId}/actions/pretranslate/${book}_${chapter}/usfm`)
      .pipe(
        map(res => res.data),
        catchError(() => {
          // If no USFM could be retrieved, return undefined
          return of(undefined);
        })
      );
  }

  /**
   * Downloads the generated drafts for a project as a zip file.
   * @param projectDoc The project document.
   * @param lastCompletedBuild The last completed build from the Machine API.
   * @returns An observable of the zip progress until on completion a zip file is downloaded to the user's machine.
   */
  downloadGeneratedDraftZip(
    projectDoc: SFProjectProfileDoc | undefined,
    lastCompletedBuild: BuildDto | undefined
  ): Observable<DraftZipProgress> {
    return new Observable<DraftZipProgress>(observer => {
      if (projectDoc?.data == null) {
        observer.error(translate('draft_generation.info_alert_download_error'));
        return;
      }

      const zip = new JSZip();
      const projectShortName: string = projectDoc.data.shortName;
      const usfmFiles: Promise<void>[] = [];

      // Build the list of book numbers
      const books: number[] = projectDoc.data.texts.reduce<number[]>((acc, text) => {
        if (text.chapters.some(c => c.hasDraft)) {
          acc.push(text.bookNum);
        }
        return acc;
      }, []);
      const zipProgress: DraftZipProgress = { current: 0, total: books.length };
      observer.next(zipProgress);

      // Create the promises to download each book's USFM
      for (const bookNum of books) {
        const usfmFile = firstValueFrom(this.getGeneratedDraftUsfm(projectDoc.id, bookNum, 0)).then(usfm => {
          if (usfm != null) {
            const fileName: string =
              getBookFileNameDigits(bookNum) + Canon.bookNumberToId(bookNum) + projectShortName + '.SFM';
            zip.file(fileName, usfm);
            zipProgress.current++;
            observer.next(zipProgress);
          }
        });
        usfmFiles.push(usfmFile);
      }

      Promise.all(usfmFiles).then(() => {
        if (Object.keys(zip.files).length === 0) {
          observer.next({ current: 0, total: 0 });
          observer.error(translate('draft_generation.info_alert_download_error'));
          return;
        }

        // Download the zip file
        let filename: string = (projectDoc.data?.shortName ?? 'Translation') + ' Draft';
        if (lastCompletedBuild?.additionalInfo?.dateFinished != null) {
          const date: Date = new Date(lastCompletedBuild.additionalInfo.dateFinished);
          const year: string = date.getFullYear().toString();
          const month: string = (date.getMonth() + 1).toString().padStart(2, '0');
          const day: string = date.getDate().toString().padStart(2, '0');
          const hours: string = date.getHours().toString().padStart(2, '0');
          const minutes: string = date.getMinutes().toString().padStart(2, '0');
          filename += ` ${year}-${month}-${day}_${hours}${minutes}`;
        }

        filename += '.zip';

        zip.generateAsync({ type: 'blob' }).then(blob => {
          saveAs(blob, filename);
          observer.next({ current: 0, total: 0 });
          observer.complete();
        });
      });
    });
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
