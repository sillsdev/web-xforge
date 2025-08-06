import { TestBed } from '@angular/core/testing';
import { LynxInsightFilter } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { anything, mock, verify, when } from 'ts-mockito';
import { RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TextDocId } from '../../../../core/models/text-doc';
import { TextDocService } from '../../../../core/text-doc.service';
import { LynxInsight } from './lynx-insight';
import { LynxInsightFilterService } from './lynx-insight-filter.service';

describe('LynxInsightFilterService', () => {
  let service: LynxInsightFilterService;
  const mockTextDocService = mock(TextDocService);

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

  function createMockTextInfo(bookNum: number = 40): TextInfo {
    return {
      bookNum,
      hasSource: false,
      chapters: [],
      permissions: {}
    };
  }

  configureTestingModule(() => ({
    providers: [LynxInsightFilterService, { provide: TextDocService, useMock: mockTextDocService }]
  }));

  beforeEach(() => {
    // Set up default mocks
    when(mockTextDocService.hasChapterEditPermissionForText(anything(), anything())).thenReturn(true);
    when(mockTextDocService.isUsfmValidForText(anything(), anything())).thenReturn(true);

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

    it('should return false when permissions check fails', () => {
      const insight = createMockInsight();
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'project',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds: string[] = [];
      const projectTexts: TextInfo[] = [createMockTextInfo()];

      // Mock permission check to return false
      when(mockTextDocService.hasChapterEditPermissionForText(anything(), anything())).thenReturn(false);

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds, projectTexts);

      expect(result).toBeFalse();
    });

    it('should return false when USFM validity check fails', () => {
      const insight = createMockInsight();
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'project',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds: string[] = [];
      const projectTexts: TextInfo[] = [createMockTextInfo()];

      // Mock USFM validity check to return false
      when(mockTextDocService.isUsfmValidForText(anything(), anything())).thenReturn(false);

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds, projectTexts);

      expect(result).toBeFalse();
    });

    it('should return false when book not found in project texts', () => {
      const insight = createMockInsight('warning', 42); // Luke
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'project',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds: string[] = [];
      const projectTexts: TextInfo[] = [createMockTextInfo(40)]; // Only Matthew

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds, projectTexts);

      expect(result).toBeFalse();
    });

    it('should return true when permissions check passes', () => {
      const insight = createMockInsight();
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'project',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds: string[] = [];
      const projectTexts: TextInfo[] = [createMockTextInfo()];

      // Mock permission checks to return true (default setup)
      when(mockTextDocService.hasChapterEditPermissionForText(anything(), anything())).thenReturn(true);
      when(mockTextDocService.isUsfmValidForText(anything(), anything())).thenReturn(true);

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds, projectTexts);

      expect(result).toBeTrue();
    });

    it('should return true when projectTexts is undefined (no permission filtering)', () => {
      const insight = createMockInsight();
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

    it('should call permission methods with correct parameters when projectTexts provided', () => {
      const insight = createMockInsight('warning', 40, 1);
      const filter: LynxInsightFilter = {
        types: ['warning'],
        scope: 'project',
        includeDismissed: true
      };
      const bookChapter: RouteBookChapter = { bookId: 'MAT', chapter: 1 };
      const dismissedIds: string[] = [];
      const projectTexts: TextInfo[] = [createMockTextInfo(40)];

      when(mockTextDocService.hasChapterEditPermissionForText(anything(), anything())).thenReturn(true);
      when(mockTextDocService.isUsfmValidForText(anything(), anything())).thenReturn(true);

      const result = service.matchesFilter(insight, filter, bookChapter, dismissedIds, projectTexts);

      verify(mockTextDocService.hasChapterEditPermissionForText(anything(), 1)).once();
      verify(mockTextDocService.isUsfmValidForText(anything(), 1)).once();
      expect(result).toBeTrue();
    });
  });

  describe('hasDisplayPermission', () => {
    it('should return false when text not found', () => {
      const insight = createMockInsight('warning', 42); // Luke
      const projectTexts: TextInfo[] = [createMockTextInfo(40)]; // Only Matthew

      const result = service.hasDisplayPermission(insight, projectTexts);

      expect(result).toBeFalse();
    });

    it('should return false when edit permission is false', () => {
      const insight = createMockInsight();
      const projectTexts: TextInfo[] = [createMockTextInfo()];

      when(mockTextDocService.hasChapterEditPermissionForText(anything(), anything())).thenReturn(false);

      const result = service.hasDisplayPermission(insight, projectTexts);

      expect(result).toBeFalse();
    });

    it('should return false when USFM is invalid', () => {
      const insight = createMockInsight();
      const projectTexts: TextInfo[] = [createMockTextInfo()];

      when(mockTextDocService.isUsfmValidForText(anything(), anything())).thenReturn(false);

      const result = service.hasDisplayPermission(insight, projectTexts);

      expect(result).toBeFalse();
    });

    it('should return true when all checks pass', () => {
      const insight = createMockInsight();
      const projectTexts: TextInfo[] = [createMockTextInfo()];

      when(mockTextDocService.hasChapterEditPermissionForText(anything(), anything())).thenReturn(true);
      when(mockTextDocService.isUsfmValidForText(anything(), anything())).thenReturn(true);

      const result = service.hasDisplayPermission(insight, projectTexts);

      verify(mockTextDocService.hasChapterEditPermissionForText(anything(), 1)).once();
      verify(mockTextDocService.isUsfmValidForText(anything(), 1)).once();
      expect(result).toBeTrue();
    });

    it('should call methods with correct TextInfo and chapter number', () => {
      const insight = createMockInsight('warning', 42, 3); // Luke 3
      const matthewText = createMockTextInfo(40);
      const lukeText = createMockTextInfo(42);
      const projectTexts: TextInfo[] = [matthewText, lukeText];

      when(mockTextDocService.hasChapterEditPermissionForText(anything(), anything())).thenReturn(true);
      when(mockTextDocService.isUsfmValidForText(anything(), anything())).thenReturn(true);

      service.hasDisplayPermission(insight, projectTexts);

      // Should call with Luke 3
      verify(mockTextDocService.hasChapterEditPermissionForText(lukeText, 3)).once();
      verify(mockTextDocService.isUsfmValidForText(lukeText, 3)).once();

      // Should not call with Matthew
      verify(mockTextDocService.hasChapterEditPermissionForText(matthewText, anything())).never();
      verify(mockTextDocService.isUsfmValidForText(matthewText, anything())).never();

      expect(1).toBe(1);
    });
  });
});
