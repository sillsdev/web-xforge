import { TestBed } from '@angular/core/testing';
import { LynxInsightFilter } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TextDocId } from '../../../../core/models/text-doc';
import { LynxInsight } from './lynx-insight';
import { LynxInsightFilterService } from './lynx-insight-filter.service';

describe('LynxInsightFilterService', () => {
  let service: LynxInsightFilterService;

  function createMockInsight(
    type: 'info' | 'warning' | 'error' = 'warning',
    bookNum: number = 40,
    chapterNum: number = 1
  ): LynxInsight {
    return {
      id: 'test-insight-1',
      type,
      textDocId: new TextDocId('project1', bookNum, chapterNum),
      range: { index: 5, length: 3 },
      code: 'TEST',
      source: 'test-source',
      description: 'Test insight description'
    };
  }

  configureTestingModule(() => ({
    providers: [LynxInsightFilterService]
  }));

  beforeEach(() => {
    service = TestBed.inject(LynxInsightFilterService);
  });

  describe('matchesFilter', () => {
    it('should return false for dismissed insights when includeDismissed is false', () => {
      const insight = createMockInsight();
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'project',
        includeDismissed: false
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds = [insight.id];

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds);

      expect(result).toBeFalse();
    });

    it('should return true for dismissed insights when includeDismissed is true', () => {
      const insight = createMockInsight();
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'project',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds = [insight.id];

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds);

      expect(result).toBeTrue();
    });

    it('should return false when insight type is not in filter types', () => {
      const insight = createMockInsight('warning');
      const filter: LynxInsightFilter = {
        types: ['error'],
        scope: 'project',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds: string[] = [];

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds);

      expect(result).toBeFalse();
    });

    it('should return true for project scope regardless of book/chapter', () => {
      const insight = createMockInsight('warning', 42, 3); // Luke 3
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'project',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds: string[] = [];

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds);

      expect(result).toBeTrue();
    });

    it('should return false for book scope when insight is in different book', () => {
      const insight = createMockInsight('warning', 42, 3); // Luke 3
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'book',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds: string[] = [];

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds);

      expect(result).toBeFalse();
    });

    it('should return true for book scope when insight is in same book but different chapter', () => {
      const insight = createMockInsight('warning', 40, 3); // Matthew 3
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'book',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds: string[] = [];

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds);

      expect(result).toBeTrue();
    });

    it('should return false for chapter scope when insight is in different chapter of same book', () => {
      const insight = createMockInsight('warning', 40, 3); // Matthew 3
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'chapter',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds: string[] = [];

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds);

      expect(result).toBeFalse();
    });

    it('should return true for chapter scope when insight is in same chapter of same book', () => {
      const insight = createMockInsight('warning', 40, 1);
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'chapter',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds: string[] = [];

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds);

      expect(result).toBeTrue();
    });
  });

  describe('getScope', () => {
    it('should return "chapter" when insight is in current chapter', () => {
      const insight = createMockInsight('warning', 40, 1);
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };

      const result = service.getScope(insight, bookChapter);

      expect(result).toBe('chapter');
    });

    it('should return "book" when insight is in current book but different chapter', () => {
      const insight = createMockInsight('warning', 40, 2); // Matthew 2
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };

      const result = service.getScope(insight, bookChapter);

      expect(result).toBe('book');
    });

    it('should return "project" when insight is in different book', () => {
      const insight = createMockInsight('warning', 42, 1); // Luke 1
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };

      const result = service.getScope(insight, bookChapter);

      expect(result).toBe('project');
    });
  });
});
