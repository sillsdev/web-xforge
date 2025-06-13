import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivationEnd, Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { BehaviorSubject, Subject } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../app/core/models/sf-project-profile-doc';
import { ActivatedBookChapterService, RouteBookChapter } from './activated-book-chapter.service';
import { ActivatedProjectUserConfigService } from './activated-project-user-config.service';
import { ActivatedProjectService } from './activated-project.service';

describe('ActivatedBookChapterService', () => {
  const mockRouter = mock<Router>();
  const mockActivatedProjectService = mock<ActivatedProjectService>();
  const mockActivatedProjectUserConfigService = mock<ActivatedProjectUserConfigService>();

  configureTestingModule(() => ({
    providers: [
      ActivatedBookChapterService,
      { provide: Router, useMock: mockRouter },
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: ActivatedProjectUserConfigService, useMock: mockActivatedProjectUserConfigService }
    ]
  }));

  class TestEnvironment {
    readonly routerEvents$ = new Subject<any>();
    readonly projectChanges$ = new BehaviorSubject<SFProjectProfileDoc | undefined>(undefined);
    readonly projectUserConfig$ = new BehaviorSubject<SFProjectUserConfig | undefined>(undefined);

    readonly testBookId = 'MAT';
    readonly testChapter = 2;
    readonly testBookNum = Canon.bookIdToNumber(this.testBookId);

    service: ActivatedBookChapterService;

    constructor() {
      when(mockRouter.events).thenReturn(this.routerEvents$);
      when(mockActivatedProjectService.changes$).thenReturn(this.projectChanges$);
      when(mockActivatedProjectUserConfigService.projectUserConfig$).thenReturn(this.projectUserConfig$);

      this.service = TestBed.inject(ActivatedBookChapterService);
    }

    createTestProjectProfile(): SFProjectProfile {
      return createTestProjectProfile({
        texts: [
          {
            bookNum: this.testBookNum,
            chapters: [
              { number: 1, lastVerse: 10, isValid: true },
              { number: 2, lastVerse: 15, isValid: true },
              { number: 3, lastVerse: 20, isValid: true }
            ]
          },
          {
            bookNum: Canon.bookIdToNumber('MRK'),
            chapters: [
              { number: 1, lastVerse: 10, isValid: true },
              { number: 2, lastVerse: 15, isValid: true }
            ]
          }
        ]
      });
    }

    createProfileDoc(profile: SFProjectProfile | null): SFProjectProfileDoc {
      return {
        data: profile,
        id: profile ? 'project01' : '',
        collection: 'sf_projects',
        isLoaded: true
      } as SFProjectProfileDoc;
    }

    setupData(): void {
      const profile = this.createTestProjectProfile();
      const userConfig = createTestProjectUserConfig({
        selectedBookNum: this.testBookNum,
        selectedChapterNum: 3
      });

      this.projectChanges$.next(this.createProfileDoc(profile));
      this.projectUserConfig$.next(userConfig);
    }

    emitRouteChange(bookId: string | null = null, chapter: number | null = null): void {
      const params: Record<string, string> = {};
      if (bookId) params.bookId = bookId;
      if (chapter !== null) params.chapter = chapter.toString();

      const activationEnd = new ActivationEnd({ params } as any);
      this.routerEvents$.next(activationEnd);
    }
  }

  describe('routeBookChapter$', () => {
    it('should emit undefined initially and update when route changes', fakeAsync(() => {
      const env = new TestEnvironment();
      const results: Array<RouteBookChapter | undefined> = [];
      env.service.routeBookChapter$.subscribe(value => results.push(value));

      tick();
      expect(results.length).toBe(1);
      expect(results[0]).toBeUndefined();

      env.emitRouteChange(env.testBookId, env.testChapter);
      tick();

      expect(results.length).toBe(2);
      expect(results[1]).toEqual({ bookId: env.testBookId, chapter: env.testChapter });
    }));

    it('should not emit duplicate values when same route params are emitted', fakeAsync(() => {
      const env = new TestEnvironment();
      const results: Array<RouteBookChapter | undefined> = [];
      env.service.routeBookChapter$.subscribe(value => results.push(value));

      env.emitRouteChange(env.testBookId, env.testChapter);
      env.emitRouteChange(env.testBookId, env.testChapter);
      tick();

      expect(results.length).toBe(2);
      expect(results[0]).toBeUndefined();
      expect(results[1]).toEqual({ bookId: env.testBookId, chapter: env.testChapter });
    }));

    it('should convert chapter to number and handle missing bookId', fakeAsync(() => {
      const env = new TestEnvironment();
      let currentValue: RouteBookChapter | undefined;

      env.service.routeBookChapter$.subscribe(value => {
        currentValue = value;
      });

      env.emitRouteChange(env.testBookId, env.testChapter);
      tick();
      expect(currentValue).toEqual({ bookId: env.testBookId, chapter: env.testChapter });
      expect(typeof currentValue?.chapter).toBe('number');

      env.emitRouteChange(null, env.testChapter);
      tick();
      expect(currentValue).toBeUndefined();
    }));
  });

  describe('activatedBookChapter$', () => {
    it('should not emit until both project data and config are available', fakeAsync(() => {
      const env = new TestEnvironment();
      const results: Array<RouteBookChapter | undefined> = [];
      env.service.activatedBookChapter$.subscribe(value => results.push(value));

      env.emitRouteChange(env.testBookId, env.testChapter);
      tick();

      expect(results.length).toBe(0);
    }));

    it('should use chapter from route params when available', fakeAsync(() => {
      const env = new TestEnvironment();
      let emittedValue: RouteBookChapter | undefined;

      env.setupData();
      env.emitRouteChange(env.testBookId, env.testChapter);

      env.service.activatedBookChapter$.subscribe(value => {
        emittedValue = value;
      });
      tick();

      expect(emittedValue).toEqual({ bookId: env.testBookId, chapter: env.testChapter });
    }));

    it('should fall back to user config chapter when route has no chapter', fakeAsync(() => {
      const env = new TestEnvironment();
      let emittedValue: RouteBookChapter | undefined;

      env.setupData();
      env.emitRouteChange(env.testBookId); // No chapter param

      env.service.activatedBookChapter$.subscribe(value => {
        emittedValue = value;
      });
      tick();

      expect(emittedValue).toEqual({ bookId: env.testBookId, chapter: 3 });
    }));

    it('should fall back to first chapter when neither route nor user config has chapter', fakeAsync(() => {
      const env = new TestEnvironment();
      let emittedValue: RouteBookChapter | undefined;

      // Setup with config that doesn't match book
      const profile = env.createTestProjectProfile();
      const userConfig = createTestProjectUserConfig({
        selectedBookNum: Canon.bookIdToNumber('MRK'), // Different book
        selectedChapterNum: 1
      });
      env.projectChanges$.next(env.createProfileDoc(profile));
      env.projectUserConfig$.next(userConfig);

      // Set route params without chapter
      env.emitRouteChange(env.testBookId);

      env.service.activatedBookChapter$.subscribe(value => {
        emittedValue = value;
      });
      tick();

      expect(emittedValue).toEqual({ bookId: env.testBookId, chapter: 1 });
    }));

    it('should omit chapter when a non-existent chapter is specified', fakeAsync(() => {
      const env = new TestEnvironment();
      let emittedValue: RouteBookChapter | undefined;

      env.setupData();

      const nonExistentChapter = 99;
      env.emitRouteChange(env.testBookId, nonExistentChapter);

      env.service.activatedBookChapter$.subscribe(value => {
        emittedValue = value;
      });
      tick();

      expect(emittedValue).toEqual({ bookId: env.testBookId, chapter: undefined });
    }));

    it('should not emit duplicate values when project data is updated', fakeAsync(() => {
      const env = new TestEnvironment();
      const results: Array<RouteBookChapter | undefined> = [];

      env.setupData();
      env.emitRouteChange(env.testBookId, env.testChapter);

      env.service.activatedBookChapter$.subscribe(value => results.push(value));
      tick();

      env.projectChanges$.next(env.createProfileDoc(env.createTestProjectProfile()));
      tick();

      expect(results.length).toBe(1);
      expect(results[0]).toEqual({ bookId: env.testBookId, chapter: env.testChapter });
    }));
  });
});
