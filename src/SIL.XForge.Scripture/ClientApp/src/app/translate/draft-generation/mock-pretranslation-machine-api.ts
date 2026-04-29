import { Injectable } from '@angular/core';
import { Observable, of, Subscription, timer } from 'rxjs';
import { map, takeWhile } from 'rxjs/operators';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { HttpResponse } from '../../machine-api/http-client';
import { activeBuildStates } from './draft-generation';

/**
 * Mocks the machine api http responses for the pre-translation endpoints.
 *
 * Stores the most recent job state and last completed build state in browser session storage
 * so that the mock build can be resumed if user refreshes, simulating a long running build.
 *
 * Set `MockPreTranslationHttpClient` in `TranslateModule` providers to use the mock service.
 * @example
 * import { HttpClient } from '../machine-api/http-client';  // Use this HttpClient
 * // ... other imports
 *
 * \@NgModule({
 *   // ...
 *   providers: [
 *     { provide: HttpClient, useClass: MockPreTranslationHttpClient },
 *     { provide: DRAFT_GENERATION_SERVICE_OPTIONS, useValue: { pollRate: 200 } }
 *   ]
 * })
 * export class TranslateModule {}
 */
@Injectable({
  providedIn: 'root'
})
export class MockPreTranslationHttpClient {
  private timerSub?: Subscription;

  private readonly initialJobState: BuildDto = {
    id: '',
    href: '',
    engine: { id: '', href: '' },
    revision: 0,
    state: BuildStates.Queued,
    percentCompleted: 0,
    message: '',
    queueDepth: 0
  };

  private readonly completedJobState: BuildDto = {
    id: '',
    href: '',
    engine: { id: '', href: '' },
    revision: 0,
    state: BuildStates.Completed,
    percentCompleted: 1.0,
    message: '',
    queueDepth: 0
  };

  // When true, build will fault when 3/4 finished
  testFaultedState = false;

  // Restore most recent job state from browser session if available
  private mostRecentJobState?: BuildDto = this.getFromBrowserSessionStorage<BuildDto>('mostRecentJobState');

  constructor() {
    // If a build was in progress when browser session ended, resume it
    if (this.mostRecentJobState && activeBuildStates.includes(this.mostRecentJobState.state as BuildStates)) {
      this.startGeneration(true);
    }
  }

  get<T extends BuildDto | undefined>(url: string): Observable<HttpResponse<T>> {
    const GET_BUILD_PROGRESS_URL_REGEX: RegExp = /^translation\/builds\/id:[^\/?]+\?preTranslate=true$/i;
    const GET_LAST_COMPLETED_BUILD_URL_REGEX: RegExp =
      /^translation\/engines\/project:[^\/]+\/actions\/getLastCompletedPreTranslationBuild$/i;

    // Get build progress
    if (GET_BUILD_PROGRESS_URL_REGEX.test(url)) {
      if (!this.mostRecentJobState) {
        return of({ status: 204, data: undefined });
      }

      return of({ status: 200, data: this.mostRecentJobState as T });
    }

    // Get last completed build if a mock build has completed
    else if (GET_LAST_COMPLETED_BUILD_URL_REGEX.test(url)) {
      if (this.hasCompletedBuild()) {
        return of({ status: 200, data: this.completedJobState as T });
      }

      return of({ status: 204, data: undefined });
    }

    throw new Error('unknown machine api endpoint');
  }

  post<T>(url: string, _: any): Observable<HttpResponse<T>> {
    // Start build
    if (url === 'translation/pretranslations') {
      this.startGeneration();
      return of({ status: 200, data: undefined });
    }

    // Cancel build
    else if (url === 'translation/pretranslations/cancel') {
      this.timerSub?.unsubscribe();
      this.mostRecentJobState!.state = BuildStates.Canceled;

      // Store most recent job state in browser session
      this.storeBrowserSessionStorage<BuildDto>('mostRecentJobState', this.mostRecentJobState!);

      return of({ status: 200, data: undefined });
    }

    throw new Error('unknown machine api endpoint');
  }

  // Mock generation
  private startGeneration(isContinue: boolean = false): void {
    const interval: number = 100; // Something small enough to simulate progress, but not too small to slow down browser
    const duration: number = 12000; // 12 seconds until completion. This can be adjusted as desired.
    const pendingAfter: number = duration / 4;
    const activeAfter: number = (duration / 4) * 2;
    const faultedAfter: number = (duration / 4) * 3;

    // If continuing a build, start at the last known percent completed
    const stepOffset: number =
      isContinue && this.mostRecentJobState?.state === BuildStates.Active
        ? activeAfter / interval +
          Math.floor(this.mostRecentJobState.percentCompleted * ((duration - activeAfter) / interval))
        : 0;

    const generationTimer$: Observable<number> = timer(0, interval).pipe(
      map(x => x + stepOffset),
      takeWhile(x => interval * x <= duration, true)
    );

    // Reset most recent job state if fresh start
    if (!isContinue) {
      this.mostRecentJobState = { ...this.initialJobState };
    }

    this.timerSub = generationTimer$.subscribe((step: number) => {
      if (!this.mostRecentJobState) {
        this.timerSub?.unsubscribe();
        return;
      }

      const elapsed: number = step * interval;

      if (elapsed >= pendingAfter) {
        this.mostRecentJobState.state = BuildStates.Pending;
      }

      if (elapsed >= activeAfter) {
        this.mostRecentJobState.state = BuildStates.Active;
      }

      // Test 'Faulted' state
      if (this.testFaultedState && elapsed >= faultedAfter) {
        this.mostRecentJobState.state = BuildStates.Faulted;
        this.mostRecentJobState.message = 'Error occurred during build';
        this.timerSub?.unsubscribe();
        this.storeBrowserSessionStorage<BuildDto>('mostRecentJobState', this.mostRecentJobState);
        return;
      }

      if (elapsed >= duration) {
        this.mostRecentJobState.state = BuildStates.Completed;
        this.mostRecentJobState.percentCompleted = 1.0;
        this.setHasCompletedBuild(true);
      }

      if (this.mostRecentJobState.state === BuildStates.Active) {
        this.mostRecentJobState.percentCompleted = (elapsed - activeAfter) / (duration - activeAfter);
      }

      // Store most recent job state in browser session
      this.storeBrowserSessionStorage<BuildDto>('mostRecentJobState', this.mostRecentJobState);
    });
  }

  // Get whether user has completed build from browser session flag
  private hasCompletedBuild(): boolean {
    return !!this.getFromBrowserSessionStorage<boolean>('hasCompletedBuild');
  }

  // Store whether user has completed build in browser session flag
  private setHasCompletedBuild(hasCompletedBuild: boolean): void {
    this.storeBrowserSessionStorage<boolean>('hasCompletedBuild', hasCompletedBuild);
  }

  // Store in browser session storage.  Will be cleared when browser session ends.
  private storeBrowserSessionStorage<T>(key: string, val: T): void {
    sessionStorage.setItem(`mockPreTranslationHttpClient:${key}`, JSON.stringify(val));
  }

  // Get from browser session storage
  private getFromBrowserSessionStorage<T>(key: string): T | undefined {
    const val: string | null = sessionStorage.getItem(`mockPreTranslationHttpClient:${key}`);
    return val ? JSON.parse(val) : undefined;
  }
}
