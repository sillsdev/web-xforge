import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { instance, mock, reset, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { SFProjectService } from '../../core/sf-project.service';
import { BookProgress, estimatedActualBookProgress, ProgressService, ProjectProgress } from './progress.service';

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
      { bookId: 'GEN', verseSegments: 100, blankVerseSegments: 20 },
      { bookId: 'MAT', verseSegments: 50, blankVerseSegments: 10 }
    ];
    when(mockedProjectService.getProjectProgress(projectId)).thenResolve(expectedBooks);

    let result: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).then(r => (result = r));
    flushMicrotasks();

    expect(result).toBeInstanceOf(ProjectProgress);
    expect(result?.books).toEqual(expectedBooks);
    expect(result?.verseSegments).toBe(150);
    expect(result?.blankVerseSegments).toBe(30);
    expect(result?.translatedVerseSegments).toBe(120);
    expect(result?.ratio).toBeCloseTo(0.8);
    verify(mockedProjectService.getProjectProgress(projectId)).once();
  }));

  it('should return cached data when fresh', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const expectedBooks: BookProgress[] = [{ bookId: 'GEN', verseSegments: 100, blankVerseSegments: 20 }];
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
    const firstBooks: BookProgress[] = [{ bookId: 'GEN', verseSegments: 100, blankVerseSegments: 20 }];
    const secondBooks: BookProgress[] = [{ bookId: 'GEN', verseSegments: 120, blankVerseSegments: 15 }];

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

  it('should deduplicate concurrent requests for the same project', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project1';
    const expectedBooks: BookProgress[] = [{ bookId: 'GEN', verseSegments: 100, blankVerseSegments: 20 }];

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
      .thenResolve([{ bookId: 'GEN', verseSegments: 100, blankVerseSegments: 20 }]);

    let firstError: unknown;
    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).catch(e => (firstError = e));
    flushMicrotasks();

    expect(firstError).toBe(error);

    let result2: ProjectProgress | undefined;
    env.service.getProgress(projectId, { maxStalenessMs: 1000 }).then(r => (result2 = r));
    flushMicrotasks();

    expect(result2?.books).toEqual([{ bookId: 'GEN', verseSegments: 100, blankVerseSegments: 20 }]);
    verify(mockedProjectService.getProjectProgress(projectId)).twice();
  }));

  it('should cache independently per project', fakeAsync(() => {
    const env = new TestEnvironment();
    const project1Books: BookProgress[] = [{ bookId: 'GEN', verseSegments: 100, blankVerseSegments: 20 }];
    const project2Books: BookProgress[] = [{ bookId: 'MAT', verseSegments: 50, blankVerseSegments: 10 }];

    when(mockedProjectService.getProjectProgress('project1')).thenReturn(Promise.resolve(project1Books));
    when(mockedProjectService.getProjectProgress('project2')).thenReturn(Promise.resolve(project2Books));

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

  constructor() {
    this.service = new ProgressService(instance(mockedNoticeService), instance(mockedProjectService));
  }
}

describe('ProjectProgress', () => {
  it('should calculate totals correctly with multiple books', () => {
    const books: BookProgress[] = [
      { bookId: 'GEN', verseSegments: 100, blankVerseSegments: 20 },
      { bookId: 'EXO', verseSegments: 80, blankVerseSegments: 15 },
      { bookId: 'MAT', verseSegments: 50, blankVerseSegments: 5 }
    ];

    const progress = new ProjectProgress(books);

    expect(progress.verseSegments).toBe(230);
    expect(progress.blankVerseSegments).toBe(40);
    expect(progress.translatedVerseSegments).toBe(190);
    expect(progress.ratio).toBeCloseTo(0.8261);
  });

  it('should handle empty books array', () => {
    const progress = new ProjectProgress([]);

    expect(progress.verseSegments).toBe(0);
    expect(progress.blankVerseSegments).toBe(0);
    expect(progress.translatedVerseSegments).toBe(0);
    expect(progress.ratio).toBe(0);
  });

  it('should handle all blank verses', () => {
    const books: BookProgress[] = [{ bookId: 'GEN', verseSegments: 100, blankVerseSegments: 100 }];

    const progress = new ProjectProgress(books);

    expect(progress.verseSegments).toBe(100);
    expect(progress.blankVerseSegments).toBe(100);
    expect(progress.translatedVerseSegments).toBe(0);
    expect(progress.ratio).toBe(0);
  });

  it('should handle no blank verses', () => {
    const books: BookProgress[] = [{ bookId: 'GEN', verseSegments: 100, blankVerseSegments: 0 }];

    const progress = new ProjectProgress(books);

    expect(progress.verseSegments).toBe(100);
    expect(progress.blankVerseSegments).toBe(0);
    expect(progress.translatedVerseSegments).toBe(100);
    expect(progress.ratio).toBe(1);
  });
});

describe('estimatedActualBookProgress', () => {
  it('should return normal ratio for books with sufficient segments', () => {
    const bookProgress: BookProgress = {
      bookId: 'GEN',
      verseSegments: 1500, // Close to expected 1533
      blankVerseSegments: 300
    };

    const result = estimatedActualBookProgress(bookProgress);

    expect(result).toBeCloseTo(0.8); // 1200 / 1500
  });

  it('should return estimated ratio for books with very few segments compared to expected verses', () => {
    const bookProgress: BookProgress = {
      bookId: 'GEN', // Expected verses: 1533
      verseSegments: 50, // Much less than 10% of 1533 (153.3)
      blankVerseSegments: 10
    };

    const result = estimatedActualBookProgress(bookProgress);

    // Should use 40 / 1533 instead of 40 / 50
    expect(result).toBeCloseTo(40 / 1533);
  });

  it('should handle books at the threshold (exactly 10% of expected verses)', () => {
    const bookProgress: BookProgress = {
      bookId: 'GEN', // Expected verses: 1533
      // 10% of 1533 is 153.3, and the implementation uses a strict "<" comparison.
      // Use a value just above the threshold to ensure we are in the "normal" ratio branch.
      verseSegments: 154,
      blankVerseSegments: 50
    };

    const result = estimatedActualBookProgress(bookProgress);

    // Should use normal ratio since it's at 10%
    expect(result).toBeCloseTo(104 / 154);
  });

  it('should handle books with no expected verse count', () => {
    const bookProgress: BookProgress = {
      bookId: 'UNKNOWN',
      verseSegments: 10,
      blankVerseSegments: 2
    };

    const result = estimatedActualBookProgress(bookProgress);

    expect(result).toBeCloseTo(0.8); // 8 / 10
  });

  it('should handle books with zero segments', () => {
    const bookProgress: BookProgress = {
      bookId: 'GEN',
      verseSegments: 0,
      blankVerseSegments: 0
    };

    const result = estimatedActualBookProgress(bookProgress);

    expect(result).toBe(0);
  });

  it('should handle books with all blank segments', () => {
    const bookProgress: BookProgress = {
      bookId: 'GEN',
      verseSegments: 100,
      blankVerseSegments: 100
    };

    const result = estimatedActualBookProgress(bookProgress);

    expect(result).toBe(0);
  });

  it('should handle various book IDs correctly', () => {
    // Ensure the "estimated" branch is used for each book by keeping verseSegments < 10% of expected verses.
    const testCases = [
      { bookId: 'MAT', expectedVerses: 1071, verseSegments: 5, blankVerseSegments: 1 },
      { bookId: 'RUT', expectedVerses: 85, verseSegments: 5, blankVerseSegments: 1 },
      { bookId: 'PSA', expectedVerses: 2527, verseSegments: 5, blankVerseSegments: 1 },
      // For JUD (25 verses), 10% is 2.5, so 5 segments would *not* trigger the estimated branch.
      { bookId: 'JUD', expectedVerses: 25, verseSegments: 2, blankVerseSegments: 1 }
    ];

    testCases.forEach(testCase => {
      const bookProgress: BookProgress = {
        bookId: testCase.bookId,
        verseSegments: testCase.verseSegments,
        blankVerseSegments: testCase.blankVerseSegments
      };

      const result = estimatedActualBookProgress(bookProgress);

      const translatedSegments: number = testCase.verseSegments - testCase.blankVerseSegments;
      expect(result).toBeCloseTo(translatedSegments / testCase.expectedVerses);
    });
  });
});
