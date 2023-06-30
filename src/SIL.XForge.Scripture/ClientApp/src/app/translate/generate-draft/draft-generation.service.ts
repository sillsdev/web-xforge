import { Inject, Injectable, InjectionToken } from '@angular/core';
import { reduce } from 'lodash-es';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { BehaviorSubject, Observable, of, Subscription, timer } from 'rxjs';
import { delay, map, repeat, shareReplay, switchMap, takeWhile } from 'rxjs/operators';
import { BuildStates } from 'src/app/machine-api/build-states';
import { HttpClient } from 'src/app/machine-api/http-client';
import { BuildDto } from '../../machine-api/build-dto';
import { PreTranslation, PreTranslationData, samplePreTranslations } from './pretranslation';

/**
 * Dictionary of segmentRef -> verse.
 */
export interface DraftSegmentMap {
  [segmentRefId: string]: string;
}

/**
 * Configuration options for DraftGenerationService.
 */
export interface DraftGenerationServiceOptions {
  /**
   * Polling frequency in milliseconds.
   */
  pollRate: number;
}

/**
 * Configuration options for DraftGenerationService.
 */
export const DRAFT_GENERATION_SERVICE_OPTIONS = new InjectionToken<DraftGenerationServiceOptions>(
  'DRAFT_GENERATION_SERVICE_OPTIONS',
  {
    providedIn: 'root',
    factory: () => ({
      pollRate: 5000
    })
  }
);

/**
 * Build states for builds that are under way.  A new build should not be started if current build
 * is in one of these states.
 */
export const ACTIVE_BUILD_STATES = new InjectionToken<BuildStates[]>('ACTIVE_BUILD_STATES', {
  providedIn: 'root',
  factory: () => [BuildStates.Active, BuildStates.Pending, BuildStates.Queued]
});

@Injectable({
  providedIn: 'root'
})
export class DraftGenerationService {
  // Mock build progress
  private readonly job$ = new BehaviorSubject<BuildDto | undefined>(undefined);
  private timerSub?: Subscription;
  private readonly initialJobState: BuildDto = {
    id: '',
    href: '',
    engine: { id: '', href: '' },
    revision: 0,
    state: BuildStates.Queued,
    percentCompleted: 0,
    message: ''
  };

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
    // return this.getBuildProgress(projectId).pipe(
    //   repeat(),
    //   delay(this.options.pollRate),
    //   takeWhile(job => this.activeBuildStates.includes(job?.state as BuildStates), true),
    //   shareReplay(1)
    // );

    return this.job$;
  }

  /**
   * Gets pretranslation build job state for specified project.
   * @param projectId The SF project id for the target translation.
   * @returns An observable 'BuildDto' describing the state and progress of the build job.
   */
  getBuildProgress(projectId: string): Observable<BuildDto | undefined> {
    // return this.httpClient.get<BuildDto>(`translation/builds/id:${projectId}?pretranslate=true`).pipe(
    //   map(res => {
    //     if (res.data?.state === BuildStates.Faulted) {
    //       throw new Error('Error occurred during build: ' + res.data.message);
    //     }
    //     return res.data;
    //   })
    // );

    return this.job$;
  }

  /**
   * Starts a pretranslation build job if one is not already under way.
   * @param projectId The SF project id for the target translation.
   * @returns An observable 'BuildDto' describing the state and progress of the build job.
   */
  startBuild(projectId: string): Observable<BuildDto | undefined> {
    // return this.getBuildProgress(projectId).pipe(
    //   switchMap((job?: BuildDto) => this.activeBuildStates.includes(job?.state as BuildStates)
    //     ? of(job)
    //     : this.httpClient
    //       .post<BuildDto>(`translation/pretranslations`, JSON.stringify(projectId))
    //       .pipe(map(res => res.data))
    //   )
    // );

    if (!this.activeBuildStates.includes(this.job$.value?.state as BuildStates)) {
      this.startGeneration();
    }
    return this.job$;
  }

  /**
   * Cancels any pretranslation builds for the specified project.
   * @param projectId The SF project id for the target translation.
   * @returns An observable 'BuildDto' describing the state and progress of the build job.
   */
  cancelBuild(projectId: string): Observable<BuildDto | undefined> {
    // return this.httpClient
    //   .post<BuildDto>(`translation/pretranslations/cancel`, JSON.stringify(projectId))
    //   .pipe(map(res => res.data));

    this.job$.next({ ...this.initialJobState, state: BuildStates.Canceled });
    this.timerSub?.unsubscribe();
    return this.job$;
  }

  /**
   * Gets the pretranslations for the specified book/chapter.
   * @param projectId The SF project id for the target translation.
   * @param book The book number.
   * @param chapter The chapter number.
   * @returns An observable dictionary of segmentRef -> verse.
   */
  getGeneratedDraft(projectId: string, book: number, chapter: number): Observable<DraftSegmentMap> {
    // return this.httpClient
    //   .get<PreTranslationData>(`translation/engines/project:${projectId}/actions/preTranslate/${book}_${chapter}`)
    //   .pipe(
    //     map(res => (res.data && this.toDraftSegmentMap(res.data.preTranslations)) ?? {}),
    //   );

    return of({
      preTranslations: samplePreTranslations[`${book}_${chapter}`]
    }).pipe(map((data: PreTranslationData) => this.toDraftSegmentMap(data.preTranslations)));
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
        result[segmentRef] = curr.translation;
        return result;
      },
      {}
    );
  }

  // Mock generation
  private startGeneration(): void {
    const interval = 100;
    const duration = 10000;
    const pendingAfter = duration / 4;
    const activeAfter = (duration / 4) * 2;
    const generationTimer$ = timer(0, interval).pipe(
      takeWhile(x => interval * x <= duration) // Inclusive of last emission
    );

    this.job$.next({ ...this.initialJobState });

    this.timerSub = generationTimer$.subscribe((intervalNum: number) => {
      const elapsed = intervalNum * interval;
      const newStatus: BuildDto = { ...(this.job$.value ?? this.initialJobState) };

      if (elapsed >= pendingAfter) {
        newStatus.state = BuildStates.Pending;
      }

      if (elapsed >= activeAfter) {
        newStatus.state = BuildStates.Active;
      }

      if (elapsed >= duration) {
        newStatus.state = BuildStates.Completed;
      }

      if (newStatus.state === BuildStates.Active) {
        newStatus.percentCompleted = (elapsed / duration) * 100;
      }

      // console.log('elapsed', elapsed);
      // console.log('percentCompleted', newStatus.percentCompleted);
      // console.log('state', newStatus.state);

      this.job$.next(newStatus);
    });
  }
}
