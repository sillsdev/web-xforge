import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { anything, instance, mock, reset, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import {
  BookProgress,
  bookProgressRatio,
  BookProgressWithChapterProgress,
  ChapterProgress,
  ProgressService,
  ProjectProgress,
  ProjectProgressWithChapterProgress
} from './progress.service';

const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);

describe('ProgressService', () => {
  beforeEach(() => {
    reset(mockedNoticeService);
    reset(mockedProjectService);
  });

  it('should get fresh progress data', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const expectedBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] },
      { bookId: 'MAT', verses: 50, blankVerses: 10, expectedVerses: 50, chapters: [] }
    ];
    when(mockedProjectService.getProjectProgress(projectId)).thenResolve(expectedBooks);

    let result: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).then(r => (result = r));
    flushMicrotasks();

    expect(result).toBeInstanceOf(ProjectProgress);
    expect(result?.books).toEqual(expectedBooks);
    expect(result?.verses).toBe(150);
    expect(result?.blankVerses).toBe(30);
    expect(result?.translatedVerses).toBe(120);
    expect(result?.ratio).toBeCloseTo(0.8);
    verify(mockedProjectService.getProjectProgress(projectId)).once();
  }));

  it('should return cached data when fresh', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const expectedBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    when(mockedProjectService.getProjectProgress(projectId)).thenResolve(expectedBooks);

    let result1: ProjectProgress | undefined;
    let result2: ProjectProgress | undefined;

    env.service.getProgress(projectId, { maxStalenessMs: 10000 }).then(r => (result1 = r));
    flushMicrotasks();
    env.service.getProgress(projectId, { maxStalenessMs: 10000 }).then(r => (result2 = r));
    flushMicrotasks();

    expect(result1?.books).toEqual(expectedBooks);
    expect(result2?.books).toEqual(expectedBooks);
    verify(mockedProjectService.getProjectProgress(projectId)).once();
  }));

  it('should fetch fresh data when cache is stale', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const firstBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const secondBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 120, blankVerses: 15, expectedVerses: 120, chapters: [] }
    ];

    when(mockedProjectService.getProjectProgress(projectId)).thenResolve(firstBooks).thenResolve(secondBooks);

    const nowSpy = spyOn(Date, 'now');
    nowSpy.and.returnValues(1000, 2000, 2000);

    let result1: ProjectProgress | undefined;
    let result2: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).then(r => (result1 = r));
    flushMicrotasks();
    env.service.getProgress(projectId, { maxStalenessMs: 5 }).then(r => (result2 = r));
    flushMicrotasks();

    expect(result1?.books).toEqual(firstBooks);
    expect(result2?.books).toEqual(secondBooks);
    verify(mockedProjectService.getProjectProgress(projectId)).twice();
  }));

  it('always fetches fresh data when maxStalenessMs is 0, even with a warm cache', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const firstBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const secondBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 120, blankVerses: 15, expectedVerses: 120, chapters: [] }
    ];
    when(mockedProjectService.getProjectProgress(projectId)).thenResolve(firstBooks).thenResolve(secondBooks);

    let result1: ProjectProgress | undefined;
    let result2: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 0 }).then(r => (result1 = r));
    flushMicrotasks();
    env.service.getProgress(projectId, { maxStalenessMs: 0 }).then(r => (result2 = r));
    flushMicrotasks();

    expect(result1?.books).toEqual(firstBooks);
    expect(result2?.books).toEqual(secondBooks);
    verify(mockedProjectService.getProjectProgress(projectId)).twice();
  }));

  it('fetches fresh data for maxStalenessMs:0 even while a request is in flight', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const staleBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const freshBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 120, blankVerses: 15, expectedVerses: 120, chapters: [] }
    ];
    let resolveStale: ((value: BookProgressWithChapterProgress[]) => void) | undefined;
    let resolveFresh: ((value: BookProgressWithChapterProgress[]) => void) | undefined;
    const stalePromise: Promise<BookProgressWithChapterProgress[]> = new Promise(resolve => (resolveStale = resolve));
    const freshPromise: Promise<BookProgressWithChapterProgress[]> = new Promise(resolve => (resolveFresh = resolve));
    when(mockedProjectService.getProjectProgress(projectId)).thenReturn(stalePromise).thenReturn(freshPromise);
    // The first request starts and stays in flight (not yet resolved).
    let result1: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).then(r => (result1 = r));

    let result2: ProjectProgress | undefined;
    // SUT
    env.service.getProgress(projectId, { maxStalenessMs: 0 }).then(r => (result2 = r));

    resolveStale!(staleBooks);
    resolveFresh!(freshBooks);
    flushMicrotasks();

    expect(result1?.books).toEqual(staleBooks);
    expect(result2?.books).toEqual(freshBooks);
    verify(mockedProjectService.getProjectProgress(projectId)).twice();
  }));

  it('refetches despite a warm cache when the project has synced since the data was fetched', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const preSyncBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const postSyncBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 120, blankVerses: 15, expectedVerses: 120, chapters: [] }
    ];
    when(mockedProjectService.getProjectProgress(projectId)).thenResolve(preSyncBooks).thenResolve(postSyncBooks);

    let result1: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 60_000 }).then(r => (result1 = r));
    flushMicrotasks();

    // A sync completes; the cached data is well within the staleness window but must not be served anymore.
    env.setLastSyncDateString(projectId, 'post-sync');
    let result2: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 60_000 }).then(r => (result2 = r));
    flushMicrotasks();

    expect(result1?.books).toEqual(preSyncBooks);
    expect(result2?.books).toEqual(postSyncBooks);
    verify(mockedProjectService.getProjectProgress(projectId)).twice();
  }));

  it('coalesces sibling reads issued after a sync while ignoring a request from before it', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const preSyncBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const postSyncBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 120, blankVerses: 15, expectedVerses: 120, chapters: [] }
    ];
    let resolvePreSync: ((value: BookProgressWithChapterProgress[]) => void) | undefined;
    let resolvePostSync: ((value: BookProgressWithChapterProgress[]) => void) | undefined;
    const preSyncPromise: Promise<BookProgressWithChapterProgress[]> = new Promise(
      resolve => (resolvePreSync = resolve)
    );
    const postSyncPromise: Promise<BookProgressWithChapterProgress[]> = new Promise(
      resolve => (resolvePostSync = resolve)
    );
    when(mockedProjectService.getProjectProgress(projectId)).thenReturn(preSyncPromise).thenReturn(postSyncPromise);

    // A request from before the sync is in flight...
    let result1: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 60_000 }).then(r => (result1 = r));
    flushMicrotasks();

    // ...then the sync completes and two sibling reads arrive.
    env.setLastSyncDateString(projectId, 'post-sync');
    let result2: ProjectProgress | undefined;
    let result3: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 60_000 }).then(r => (result2 = r));
    env.service.getProgress(projectId, { maxStalenessMs: 60_000 }).then(r => (result3 = r));
    flushMicrotasks();

    resolvePreSync!(preSyncBooks);
    resolvePostSync!(postSyncBooks);
    flushMicrotasks();

    // The pre-sync request was not reused, but the two sibling reads shared a single new request.
    expect(result1?.books).toEqual(preSyncBooks);
    expect(result2?.books).toEqual(postSyncBooks);
    expect(result3?.books).toEqual(postSyncBooks);
    verify(mockedProjectService.getProjectProgress(projectId)).twice();
  }));

  it('does not let a slower request from before a sync overwrite fresher post-sync data', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const preSyncBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const postSyncBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 120, blankVerses: 15, expectedVerses: 120, chapters: [] }
    ];
    let resolvePreSync: ((value: BookProgressWithChapterProgress[]) => void) | undefined;
    let resolvePostSync: ((value: BookProgressWithChapterProgress[]) => void) | undefined;
    const preSyncPromise: Promise<BookProgressWithChapterProgress[]> = new Promise(
      resolve => (resolvePreSync = resolve)
    );
    const postSyncPromise: Promise<BookProgressWithChapterProgress[]> = new Promise(
      resolve => (resolvePostSync = resolve)
    );
    when(mockedProjectService.getProjectProgress(projectId)).thenReturn(preSyncPromise).thenReturn(postSyncPromise);

    // Control the clock so the two requests demonstrably start at different times.
    let now = 1000;
    spyOn(Date, 'now').and.callFake(() => now);

    let result1: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 60_000 }).then(r => (result1 = r));
    flushMicrotasks();

    now = 2000;
    env.setLastSyncDateString(projectId, 'post-sync');
    let result2: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 60_000 }).then(r => (result2 = r));
    flushMicrotasks();

    // The post-sync request resolves first; the pre-sync one afterward.
    resolvePostSync!(postSyncBooks);
    flushMicrotasks();
    resolvePreSync!(preSyncBooks);
    flushMicrotasks();

    // A later read within the staleness window must see the post-sync data, not the pre-sync straggler's.
    now = 3000;
    let result3: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 60_000 }).then(r => (result3 = r));
    flushMicrotasks();

    expect(result1?.books).toEqual(preSyncBooks);
    expect(result2?.books).toEqual(postSyncBooks);
    expect(result3?.books).toEqual(postSyncBooks);
    verify(mockedProjectService.getProjectProgress(projectId)).twice();
  }));

  it('should deduplicate concurrent requests for the same project', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const expectedBooks: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];

    let resolvePromise: ((value: BookProgressWithChapterProgress[]) => void) | undefined;
    const delayedPromise: Promise<BookProgressWithChapterProgress[]> = new Promise<BookProgressWithChapterProgress[]>(
      resolve => {
        resolvePromise = resolve;
      }
    );
    when(mockedProjectService.getProjectProgress(projectId)).thenReturn(delayedPromise);

    let result1: ProjectProgress | undefined;
    let result2: ProjectProgress | undefined;

    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).then(r => (result1 = r));
    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).then(r => (result2 = r));

    resolvePromise!(expectedBooks);
    flushMicrotasks();

    expect(result1?.books).toEqual(expectedBooks);
    expect(result2?.books).toEqual(expectedBooks);
    verify(mockedProjectService.getProjectProgress(projectId)).once();
  }));

  it('should clean up request cache on error and allow retry', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const error = new Error('Network error');
    when(mockedProjectService.getProjectProgress(projectId))
      .thenReject(error)
      .thenResolve([{ bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }]);

    let firstError: unknown;
    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).catch(e => (firstError = e));
    flushMicrotasks();

    expect(firstError).toBe(error);

    let result2: ProjectProgressWithChapterProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).then(r => (result2 = r as any));
    flushMicrotasks();

    expect(result2?.books).toEqual([
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ]);
    verify(mockedProjectService.getProjectProgress(projectId)).twice();
  }));

  it('should cache independently per project', fakeAsync(() => {
    const env = new TestEnvironment();
    const project1Books: BookProgressWithChapterProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const project2Books: BookProgressWithChapterProgress[] = [
      { bookId: 'MAT', verses: 50, blankVerses: 10, expectedVerses: 50, chapters: [] }
    ];

    when(mockedProjectService.getProjectProgress('project1')).thenResolve(project1Books);
    when(mockedProjectService.getProjectProgress('project2')).thenResolve(project2Books);

    let result1: ProjectProgress | undefined;
    let result2: ProjectProgress | undefined;
    env.service.getProgress('project1', { maxStalenessMs: 1000 }).then(r => (result1 = r));
    env.service.getProgress('project2', { maxStalenessMs: 1000 }).then(r => (result2 = r));
    flushMicrotasks();

    expect(result1?.books).toEqual(project1Books);
    expect(result2?.books).toEqual(project2Books);
    verify(mockedProjectService.getProjectProgress('project1')).once();
    verify(mockedProjectService.getProjectProgress('project2')).once();
  }));
});

class TestEnvironment {
  readonly service: ProgressService;
  /** sync.dateLastSuccessfulSync per project; change a project's value to simulate a completed sync. */
  private readonly lastSyncDateStrings = new Map<string, string>();

  constructor() {
    when(mockedProjectService.getProfile(anything())).thenCall((projectId: string) =>
      Promise.resolve({
        data: { sync: { dateLastSuccessfulSync: this.lastSyncDateStrings.get(projectId) ?? 'initial-sync' } }
      } as unknown as SFProjectProfileDoc)
    );
    this.service = new ProgressService(instance(mockedNoticeService), instance(mockedProjectService));
  }

  setLastSyncDateString(projectId: string, dateString: string): void {
    this.lastSyncDateStrings.set(projectId, dateString);
  }
}

describe('ProjectProgress', () => {
  it('should calculate totals correctly with multiple books', () => {
    const books: BookProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20 },
      { bookId: 'EXO', verses: 80, blankVerses: 15 },
      { bookId: 'MAT', verses: 50, blankVerses: 5 }
    ];

    const progress = new ProjectProgress(books);

    expect(progress.verses).toBe(230);
    expect(progress.blankVerses).toBe(40);
    expect(progress.translatedVerses).toBe(190);
    expect(progress.ratio).toBeCloseTo(0.8261);
  });

  it('should handle empty books array', () => {
    const progress = new ProjectProgress([]);

    expect(progress.verses).toBe(0);
    expect(progress.blankVerses).toBe(0);
    expect(progress.translatedVerses).toBe(0);
    expect(progress.ratio).toBe(0);
  });

  it('should handle all blank verses', () => {
    const books: BookProgress[] = [{ bookId: 'GEN', verses: 100, blankVerses: 100 }];

    const progress = new ProjectProgress(books);

    expect(progress.verses).toBe(100);
    expect(progress.blankVerses).toBe(100);
    expect(progress.translatedVerses).toBe(0);
    expect(progress.ratio).toBe(0);
  });

  it('should handle no blank verses', () => {
    const books: BookProgress[] = [{ bookId: 'GEN', verses: 100, blankVerses: 0 }];

    const progress = new ProjectProgress(books);

    expect(progress.verses).toBe(100);
    expect(progress.blankVerses).toBe(0);
    expect(progress.translatedVerses).toBe(100);
    expect(progress.ratio).toBe(1);
  });
});

describe('bookProgressRatio', () => {
  function chapter(
    chapterNumber: number,
    verses: number,
    blankVerses: number,
    expectedVerses: number = verses
  ): ChapterProgress {
    return { chapterNumber, verses, blankVerses, expectedVerses };
  }

  it('is the translated fraction of the verse units when every chapter is present', () => {
    const book: BookProgressWithChapterProgress = {
      bookId: 'RUT',
      verses: 85,
      blankVerses: 17,
      expectedVerses: 85,
      chapters: [chapter(1, 22, 5), chapter(2, 23, 4), chapter(3, 18, 4), chapter(4, 22, 4)]
    };

    expect(bookProgressRatio(book)).toBeCloseTo(68 / 85);
  });

  it('counts the verses expected in missing chapters as untranslated', () => {
    // Only Ruth 1 exists and is fully translated; chapters 2-4 (63 verses) are missing from the project
    const book: BookProgressWithChapterProgress = {
      bookId: 'RUT',
      verses: 22,
      blankVerses: 0,
      expectedVerses: 85,
      chapters: [chapter(1, 22, 0)]
    };

    expect(bookProgressRatio(book)).toBeCloseTo(22 / 85);
  });

  it('measures present chapters in their own verse units, so verse ranges do not distort the ratio', () => {
    // Ruth 1 is written as 11 verse ranges (the versification expects 22 verses) and is complete
    const book: BookProgressWithChapterProgress = {
      bookId: 'RUT',
      verses: 11,
      blankVerses: 0,
      expectedVerses: 85,
      chapters: [chapter(1, 11, 0, 22)]
    };

    expect(bookProgressRatio(book)).toBeCloseTo(11 / (11 + 63));
  });

  it('does not let chapters outside the versification shrink the missing-chapter estimate below zero', () => {
    // A chapter the versification does not have expects zero verses, and the present chapters together can be
    // expected to hold more verses than the book, e.g. with a custom versification
    const book: BookProgressWithChapterProgress = {
      bookId: 'RUT',
      verses: 100,
      blankVerses: 0,
      expectedVerses: 85,
      chapters: [chapter(1, 25, 0), chapter(2, 25, 0), chapter(3, 25, 0), chapter(4, 25, 0), chapter(5, 0, 0, 0)]
    };

    expect(bookProgressRatio(book)).toBe(1);
  });

  it('is zero for a book with no verse units and nothing expected', () => {
    const book: BookProgressWithChapterProgress = {
      bookId: 'RUT',
      verses: 0,
      blankVerses: 0,
      expectedVerses: 0,
      chapters: []
    };

    expect(bookProgressRatio(book)).toBe(0);
  });

  it('is zero for a book that exists but has nothing translated', () => {
    const book: BookProgressWithChapterProgress = {
      bookId: 'RUT',
      verses: 22,
      blankVerses: 22,
      expectedVerses: 85,
      chapters: [chapter(1, 22, 22)]
    };

    expect(bookProgressRatio(book)).toBe(0);
  });
});
