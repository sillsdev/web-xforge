import { Injectable } from '@angular/core';
import { reduce } from 'lodash-es';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { BehaviorSubject, Observable, of, Subscription, timer } from 'rxjs';
import { map, takeWhile } from 'rxjs/operators';
import { HttpClient } from 'src/app/machine-api/http-client';
import { PreTranslation, PreTranslationData, samplePreTranslations } from './pretranslation';

export interface DraftJob {
  state: string;
  message: string;
  percentCompleted: number;
}

export interface DraftSegmentMap {
  [segmentRefId: string]: string;
}

@Injectable({
  providedIn: 'root'
})
export class DraftGenerationService {
  private readonly initialJobState: DraftJob = {
    state: 'init',
    percentCompleted: 0,
    message: ''
  };

  // Mock build progress
  private job$ = new BehaviorSubject<DraftJob>(this.initialJobState);
  private timerSub?: Subscription;
  private interval = 100;
  private duration = 1000;
  private queueWaitTime = this.duration / 2;
  private generationTimer$ = timer(0, this.interval).pipe(
    takeWhile(x => this.interval * x <= this.duration) // Inclusive of last emission
  );

  constructor(private readonly httpClient: HttpClient) {}

  getBuildProgress(projectId: string): Observable<DraftJob> {
    // return this.httpClient.get<BuildDto>(`translation/builds/id:${projectId}?pretranslate=true`).pipe(
    //   map(res => {
    //     if (res.data != null && res.data.state === BuildStates.Faulted) {
    //       throw new Error('Error occurred during build: ' + res.data.message);
    //     }
    //     return res.data;
    //   }),
    //   catchError(err => {
    //     if (err.status === 404) {
    //       return of(undefined);
    //     }

    //       return throwError(err);
    //   })
    // );
    return this.job$;
  }

  startBuild(projectId: string): Observable<DraftJob> {
    // return this.httpClient
    //   .post<DraftJob>(`translation/pretranslations`, JSON.stringify(projectId))
    //   .pipe(map(res => res.data as BuildDto));

    if (this.job$.value.state === 'init') {
      this.startGeneration();
    }
    return this.job$;
  }

  cancelBuild(projectId: string): Observable<DraftJob> {
    // return this.httpClient
    //   .post<DraftJob>(`translation/pretranslations/cancel`, JSON.stringify(projectId))
    //   .pipe(map(res => res.data as BuildDto));

    this.job$.next(this.initialJobState);
    this.timerSub?.unsubscribe();
    return this.job$;
  }

  getGeneratedDraft(projectId: string, book: number, chapter: number): Observable<DraftSegmentMap> {
    // return this.httpClient
    //   .get<PreTranslationData>(`translation/engines/project:${projectId}/actions/preTranslate/${book}_${chapter}`)
    //   .pipe(
    //     map(res => res.data as PreTranslationData),
    //     map((data: PreTranslationData) => this.toDraftSegmentMap(data.preTranslations)),
    //   );

    return of({
      preTranslations: samplePreTranslations[`${book}_${chapter}`]
    }).pipe(map((data: PreTranslationData) => this.toDraftSegmentMap(data.preTranslations)));
  }

  // Transform collection into dictionary of segmentRef -> verse
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
    this.job$.next({ ...this.initialJobState, state: 'queued' });

    this.timerSub = this.generationTimer$.subscribe((intervalNum: number) => {
      const elapsed = intervalNum * this.interval;
      const newStatus = { ...this.job$.value };

      // console.log('elapsed', elapsed);
      // console.log('progress', newStatus.progress);

      // Set status to 'generating' after 5s
      if (elapsed === this.queueWaitTime) {
        newStatus.state = 'generating';
      }

      // Set status to 'generated' when done
      if (elapsed === this.duration) {
        newStatus.state = 'generated';
      }

      if (newStatus.state === 'generating') {
        newStatus.percentCompleted = ((elapsed - this.queueWaitTime) / (this.duration - this.queueWaitTime)) * 100;
      }

      this.job$.next(newStatus);
    });
  }
}
