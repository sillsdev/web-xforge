import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { anything, instance, mock, reset, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import {
  bookAppearsCompleteForTrainingAutoSelection,
  bookVerseCounts,
  BookProgress,
  ProgressService,
  ProjectProgress
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
    const expectedBooks: BookProgress[] = [
      {
        bookId: 'GEN',
        verses: 100,
        blankVerses: 20,
        expectedVerses: 100,
        chapters: [{ chapterNumber: 1, verses: 100, blankVerses: 20, expectedVerses: 100 }]
      },
      {
        bookId: 'MAT',
        verses: 50,
        blankVerses: 10,
        expectedVerses: 50,
        chapters: [{ chapterNumber: 1, verses: 50, blankVerses: 10, expectedVerses: 50 }]
      }
    ];
    when(mockedProjectService.getProjectProgress(projectId)).thenResolve(expectedBooks);

    let result: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).then(r => (result = r));
    flushMicrotasks();

    expect(result).toBeInstanceOf(ProjectProgress);
    expect(result?.books).toEqual(expectedBooks);
    expect(result?.totalVerses).toBe(150);
    expect(result?.translatedVerses).toBe(120);
    expect(result?.untranslatedVerses).toBe(30);
    expect(result?.ratio).toBeCloseTo(0.8);
    verify(mockedProjectService.getProjectProgress(projectId)).once();
  }));

  it('should return cached data when fresh', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const expectedBooks: BookProgress[] = [
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
    const firstBooks: BookProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const secondBooks: BookProgress[] = [
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
    const firstBooks: BookProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const secondBooks: BookProgress[] = [
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
    const staleBooks: BookProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const freshBooks: BookProgress[] = [
      { bookId: 'GEN', verses: 120, blankVerses: 15, expectedVerses: 120, chapters: [] }
    ];
    let resolveStale: ((value: BookProgress[]) => void) | undefined;
    let resolveFresh: ((value: BookProgress[]) => void) | undefined;
    const stalePromise: Promise<BookProgress[]> = new Promise(resolve => (resolveStale = resolve));
    const freshPromise: Promise<BookProgress[]> = new Promise(resolve => (resolveFresh = resolve));
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
    const preSyncBooks: BookProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const postSyncBooks: BookProgress[] = [
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
    const preSyncBooks: BookProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const postSyncBooks: BookProgress[] = [
      { bookId: 'GEN', verses: 120, blankVerses: 15, expectedVerses: 120, chapters: [] }
    ];
    let resolvePreSync: ((value: BookProgress[]) => void) | undefined;
    let resolvePostSync: ((value: BookProgress[]) => void) | undefined;
    const preSyncPromise: Promise<BookProgress[]> = new Promise(resolve => (resolvePreSync = resolve));
    const postSyncPromise: Promise<BookProgress[]> = new Promise(resolve => (resolvePostSync = resolve));
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
    const preSyncBooks: BookProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const postSyncBooks: BookProgress[] = [
      { bookId: 'GEN', verses: 120, blankVerses: 15, expectedVerses: 120, chapters: [] }
    ];
    let resolvePreSync: ((value: BookProgress[]) => void) | undefined;
    let resolvePostSync: ((value: BookProgress[]) => void) | undefined;
    const preSyncPromise: Promise<BookProgress[]> = new Promise(resolve => (resolvePreSync = resolve));
    const postSyncPromise: Promise<BookProgress[]> = new Promise(resolve => (resolvePostSync = resolve));
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
    const expectedBooks: BookProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];

    let resolvePromise: ((value: BookProgress[]) => void) | undefined;
    const delayedPromise: Promise<BookProgress[]> = new Promise<BookProgress[]>(resolve => {
      resolvePromise = resolve;
    });
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

    let result2: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).then(r => (result2 = r as any));
    flushMicrotasks();

    expect(result2?.books).toEqual([
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ]);
    verify(mockedProjectService.getProjectProgress(projectId)).twice();
  }));

  it('should cache independently per project', fakeAsync(() => {
    const env = new TestEnvironment();
    const project1Books: BookProgress[] = [
      { bookId: 'GEN', verses: 100, blankVerses: 20, expectedVerses: 100, chapters: [] }
    ];
    const project2Books: BookProgress[] = [
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

/** A book with one chapter that holds the given counts, and that has as many verses as the versification expects. */
function completeBook(bookId: string, counts: { verses: number; blankVerses: number }): BookProgress {
  const { verses, blankVerses } = counts;
  return {
    bookId,
    verses,
    blankVerses,
    expectedVerses: verses,
    chapters: [{ chapterNumber: 1, verses, blankVerses, expectedVerses: verses }]
  };
}

describe('ProjectProgress', () => {
  it('totals the books in the project', () => {
    const progress = new ProjectProgress([
      completeBook('GEN', { verses: 100, blankVerses: 20 }),
      completeBook('EXO', { verses: 80, blankVerses: 15 }),
      completeBook('MAT', { verses: 50, blankVerses: 5 })
    ]);

    expect(progress.totalVerses).toBe(230);
    expect(progress.translatedVerses).toBe(190);
    expect(progress.untranslatedVerses).toBe(40);
    expect(progress.ratio).toBeCloseTo(190 / 230);
  });

  it('counts the verses expected in missing chapters as untranslated', () => {
    // Only Ruth 1 exists and is fully translated; chapters 2-4 (63 verses) are missing from the project
    const ruth: BookProgress = {
      bookId: 'RUT',
      verses: 22,
      blankVerses: 0,
      expectedVerses: 85,
      chapters: [{ chapterNumber: 1, verses: 22, blankVerses: 0, expectedVerses: 22 }]
    };
    const progress = new ProjectProgress([ruth, completeBook('JON', { verses: 48, blankVerses: 0 })]);

    expect(progress.totalVerses).toBe(85 + 48);
    expect(progress.translatedVerses).toBe(22 + 48);
    expect(progress.untranslatedVerses).toBe(63);
    expect(progress.ratio).toBeCloseTo(70 / 133);
  });

  it('is zero for a project with no books', () => {
    const progress = new ProjectProgress([]);

    expect(progress.totalVerses).toBe(0);
    expect(progress.translatedVerses).toBe(0);
    expect(progress.untranslatedVerses).toBe(0);
    expect(progress.ratio).toBe(0);
  });
});

describe('bookAppearsCompleteForTrainingAutoSelection', () => {
  it('selects a fully translated book', () => {
    expect(bookAppearsCompleteForTrainingAutoSelection(completeBook('RUT', { verses: 85, blankVerses: 0 }))).toBeTrue();
  });

  it('does not select a book whose translated chapters are complete but whose other chapters are missing', () => {
    const book: BookProgress = {
      bookId: 'RUT',
      verses: 22,
      blankVerses: 0,
      expectedVerses: 85,
      chapters: [{ chapterNumber: 1, verses: 22, blankVerses: 0, expectedVerses: 22 }]
    };

    expect(bookAppearsCompleteForTrainingAutoSelection(book)).toBeFalse();
  });

  it('does not select a book whose other chapters exist with no verses yet', () => {
    const book: BookProgress = {
      bookId: 'RUT',
      verses: 22,
      blankVerses: 0,
      expectedVerses: 85,
      chapters: [
        { chapterNumber: 1, verses: 22, blankVerses: 0, expectedVerses: 22 },
        { chapterNumber: 2, verses: 0, blankVerses: 0, expectedVerses: 23 },
        { chapterNumber: 3, verses: 0, blankVerses: 0, expectedVerses: 18 },
        { chapterNumber: 4, verses: 0, blankVerses: 0, expectedVerses: 22 }
      ]
    };

    expect(bookAppearsCompleteForTrainingAutoSelection(book)).toBeFalse();
  });

  it('selects a complete book written with verse ranges', () => {
    // Every chapter is present and translated, but as ranges, so there are fewer verse units than expected verses
    const book: BookProgress = {
      bookId: 'RUT',
      verses: 44,
      blankVerses: 0,
      expectedVerses: 85,
      chapters: [
        { chapterNumber: 1, verses: 11, blankVerses: 0, expectedVerses: 22 },
        { chapterNumber: 2, verses: 12, blankVerses: 0, expectedVerses: 23 },
        { chapterNumber: 3, verses: 9, blankVerses: 0, expectedVerses: 18 },
        { chapterNumber: 4, verses: 12, blankVerses: 0, expectedVerses: 22 }
      ]
    };

    expect(bookAppearsCompleteForTrainingAutoSelection(book)).toBeTrue();
  });

  it('tolerates untranslated verses up to 1% of the book', () => {
    expect(
      bookAppearsCompleteForTrainingAutoSelection(completeBook('GEN', { verses: 300, blankVerses: 3 }))
    ).toBeTrue();
    expect(
      bookAppearsCompleteForTrainingAutoSelection(completeBook('GEN', { verses: 300, blankVerses: 4 }))
    ).toBeFalse();
  });

  it('does not select a short book with any untranslated verse', () => {
    expect(
      bookAppearsCompleteForTrainingAutoSelection(completeBook('RUT', { verses: 85, blankVerses: 1 }))
    ).toBeFalse();
  });

  it('does not select a book with 10 or fewer translated verses', () => {
    expect(
      bookAppearsCompleteForTrainingAutoSelection(completeBook('PHM', { verses: 10, blankVerses: 0 }))
    ).toBeFalse();
  });
});

describe('bookVerseCounts', () => {
  it('is derived from the verse units when every chapter is present', () => {
    const book: BookProgress = {
      bookId: 'RUT',
      verses: 85,
      blankVerses: 17,
      expectedVerses: 85,
      chapters: [
        { chapterNumber: 1, verses: 22, blankVerses: 5, expectedVerses: 22 },
        { chapterNumber: 2, verses: 23, blankVerses: 4, expectedVerses: 23 },
        { chapterNumber: 3, verses: 18, blankVerses: 4, expectedVerses: 18 },
        { chapterNumber: 4, verses: 22, blankVerses: 4, expectedVerses: 22 }
      ]
    };

    const counts = bookVerseCounts(book);
    expect(counts.translatedVerses).toBe(68);
    expect(counts.untranslatedVerses).toBe(17);
    expect(counts.totalVerses).toBe(85);
    expect(counts.ratio).toBeCloseTo(68 / 85);
  });

  it('counts the verses expected in missing chapters as untranslated', () => {
    // Only Ruth 1 exists and is fully translated; chapters 2-4 (63 verses) are missing from the project
    const book: BookProgress = {
      bookId: 'RUT',
      verses: 22,
      blankVerses: 0,
      expectedVerses: 85,
      chapters: [{ chapterNumber: 1, verses: 22, blankVerses: 0, expectedVerses: 22 }]
    };

    expect(bookVerseCounts(book).ratio).toBeCloseTo(22 / 85);
  });

  it('counts chapters that exist with no verses yet as untranslated', () => {
    // Ruth 1 is fully translated; chapters 2-4 exist but hold only their chapter markers
    const book: BookProgress = {
      bookId: 'RUT',
      verses: 22,
      blankVerses: 0,
      expectedVerses: 85,
      chapters: [
        { chapterNumber: 1, verses: 22, blankVerses: 0, expectedVerses: 22 },
        { chapterNumber: 2, verses: 0, blankVerses: 0, expectedVerses: 23 },
        { chapterNumber: 3, verses: 0, blankVerses: 0, expectedVerses: 18 },
        { chapterNumber: 4, verses: 0, blankVerses: 0, expectedVerses: 22 }
      ]
    };

    expect(bookVerseCounts(book).ratio).toBeCloseTo(22 / 85);
  });

  it('measures present chapters in their own verse units, so verse ranges do not distort the ratio', () => {
    // Ruth 1 is written as 11 verse ranges (the versification expects 22 verses) and is complete
    const book: BookProgress = {
      bookId: 'RUT',
      verses: 11,
      blankVerses: 0,
      expectedVerses: 85,
      chapters: [{ chapterNumber: 1, verses: 11, blankVerses: 0, expectedVerses: 22 }]
    };

    expect(bookVerseCounts(book).ratio).toBeCloseTo(11 / (11 + 63));
  });

  it('measures a book the versification does not describe by its verse units alone', () => {
    // The versification has no expected count for front matter, and it holds no verses
    const frontMatter: BookProgress = {
      bookId: 'FRT',
      verses: 0,
      blankVerses: 0,
      expectedVerses: null,
      chapters: [{ chapterNumber: 1, verses: 0, blankVerses: 0, expectedVerses: 0 }]
    };
    expect(bookVerseCounts(frontMatter).totalVerses).toBe(0);
    expect(bookVerseCounts(frontMatter).ratio).toBe(0);

    // A glossary written with verse markers is measured by those markers
    const glossary: BookProgress = {
      bookId: 'GLO',
      verses: 4,
      blankVerses: 1,
      expectedVerses: null,
      chapters: [{ chapterNumber: 1, verses: 4, blankVerses: 1, expectedVerses: 0 }]
    };
    expect(bookVerseCounts(glossary).totalVerses).toBe(4);
    expect(bookVerseCounts(glossary).ratio).toBeCloseTo(3 / 4);
  });

  it('is zero for a book with no verse units and nothing expected', () => {
    const book: BookProgress = {
      bookId: 'RUT',
      verses: 0,
      blankVerses: 0,
      expectedVerses: 0,
      chapters: []
    };

    expect(bookVerseCounts(book).ratio).toBe(0);
  });

  it('is zero for a book that exists but has nothing translated', () => {
    const book: BookProgress = {
      bookId: 'RUT',
      verses: 22,
      blankVerses: 22,
      expectedVerses: 85,
      chapters: [{ chapterNumber: 1, verses: 22, blankVerses: 22, expectedVerses: 22 }]
    };

    expect(bookVerseCounts(book).ratio).toBe(0);
  });
});
