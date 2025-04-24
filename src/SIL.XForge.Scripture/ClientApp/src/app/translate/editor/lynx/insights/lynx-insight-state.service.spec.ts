import { TestBed } from '@angular/core/testing';
import { LynxInsightType } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { ActivatedBookChapterService, RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { ActivatedProjectUserConfigService } from 'xforge-common/activated-project-user-config.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { createTestProjectUserConfig } from '../../../../../../../../RealtimeServer/scriptureforge/models/sf-project-user-config-test-data';
import { SFProjectUserConfigDoc } from '../../../../core/models/sf-project-user-config-doc';
import { TextDocId } from '../../../../core/models/text-doc';
import { LynxInsight } from './lynx-insight';
import { LynxInsightFilterService } from './lynx-insight-filter.service';
import { LynxInsightStateService } from './lynx-insight-state.service';
import { LynxWorkspaceService } from './lynx-workspace.service';

describe('LynxInsightStateService', () => {
  function createMockInsight(
    type: LynxInsightType,
    id: string,
    bookNum: number = 40,
    chapterNum: number = 1
  ): LynxInsight {
    return {
      id,
      type,
      textDocId: new TextDocId('project1', bookNum, chapterNum),
      range: { index: 5, length: 3 },
      code: 'TEST',
      source: 'test-source',
      description: `Test ${type} insight`
    };
  }

  const mockInsightFilterService = mock<LynxInsightFilterService>();
  const mockActivatedBookChapterService = mock<ActivatedBookChapterService>();
  const mockActivatedProjectUserConfigService = mock<ActivatedProjectUserConfigService>();
  const mockLynxWorkspaceService = mock<LynxWorkspaceService>();
  const mockProjectUserConfigDoc = mock(SFProjectUserConfigDoc);

  let service: LynxInsightStateService;

  const rawInsightSource = new Subject<LynxInsight[]>();
  const activatedBookChapter = new BehaviorSubject<RouteBookChapter | undefined>({
    bookId: 'MAT',
    chapter: 1
  });
  const projectUserConfig$ = new BehaviorSubject<any | undefined>(
    createTestProjectUserConfig({
      lynxInsightState: {
        panelData: {
          isOpen: true,
          filter: {
            types: ['warning', 'error'],
            scope: 'chapter',
            includeDismissed: true
          },
          sortOrder: 'appearance'
        }
      }
    })
  );

  const testInsights: LynxInsight[] = [
    createMockInsight('warning', 'test-1', 40, 1),
    createMockInsight('error', 'test-2', 40, 1),
    createMockInsight('info', 'test-3', 40, 2),
    createMockInsight('warning', 'test-4', 42, 1)
  ];

  configureTestingModule(() => ({
    providers: [
      LynxInsightStateService,
      { provide: LynxInsightFilterService, useMock: mockInsightFilterService },
      { provide: ActivatedBookChapterService, useMock: mockActivatedBookChapterService },
      { provide: ActivatedProjectUserConfigService, useMock: mockActivatedProjectUserConfigService },
      { provide: LynxWorkspaceService, useMock: mockLynxWorkspaceService }
    ]
  }));

  beforeEach(() => {
    when(mockProjectUserConfigDoc.id).thenReturn('p1u1');
    when(mockProjectUserConfigDoc.data).thenReturn(
      createTestProjectUserConfig({
        projectRef: 'project1',
        lynxInsightState: {
          panelData: {
            isOpen: true,
            filter: {
              types: ['warning', 'error'],
              scope: 'chapter',
              includeDismissed: false
            },
            sortOrder: 'severity'
          }
        }
      })
    );
    when(mockProjectUserConfigDoc.submitJson0Op(anything(), anything())).thenReturn(Promise.resolve(true));

    const projectUserConfigDoc$ = new BehaviorSubject<SFProjectUserConfigDoc | undefined>(
      instance(mockProjectUserConfigDoc)
    );

    when(mockLynxWorkspaceService.rawInsightSource$).thenReturn(rawInsightSource);
    when(mockLynxWorkspaceService.currentInsights).thenReturn(
      new Map<string, LynxInsight[]>([
        ['project1:MAT:1', [testInsights[0], testInsights[1]]],
        ['project1:MAT:2', [testInsights[2]]],
        ['project1:MRK:1', [testInsights[3]]]
      ])
    );
    when(mockActivatedBookChapterService.activatedBookChapter$).thenReturn(activatedBookChapter);
    when(mockActivatedProjectUserConfigService.projectUserConfig$).thenReturn(projectUserConfig$);
    when(mockActivatedProjectUserConfigService.projectUserConfigDoc$).thenReturn(projectUserConfigDoc$);

    when(mockInsightFilterService.matchesFilter(anything(), anything(), anything(), anything())).thenCall(
      (insight: LynxInsight, filter: any, _bookChapter: RouteBookChapter, dismissedIds: string[]) => {
        if (!filter.types.includes(insight.type)) {
          return false;
        }

        if (filter.scope === 'project') {
          return true;
        }

        if (filter.scope === 'book' && insight.textDocId.bookNum !== 40) {
          return false;
        }

        if (filter.scope === 'chapter' && (insight.textDocId.bookNum !== 40 || insight.textDocId.chapterNum !== 1)) {
          return false;
        }

        if (!filter.includeDismissed && dismissedIds.includes(insight.id)) {
          return false;
        }

        return true;
      }
    );

    when(mockInsightFilterService.getScope(anything(), anything())).thenCall(
      (insight: LynxInsight, _bookChapter: RouteBookChapter) => {
        if (insight.textDocId.bookNum === 40 && insight.textDocId.chapterNum === 1) {
          return 'chapter';
        } else if (insight.textDocId.bookNum === 40) {
          return 'book';
        } else {
          return 'project';
        }
      }
    );

    service = TestBed.inject(LynxInsightStateService);
  });

  describe('initialization', () => {
    it('should load filter settings from project user config', async () => {
      const filter = await firstValueFrom(service.filter$);
      expect(filter.types).toEqual(['warning', 'error']);
      expect(filter.scope).toBe('chapter');
      expect(filter.includeDismissed).toBeTrue();
    });

    it('should load sort order from project user config', async () => {
      const sortOrder = await firstValueFrom(service.orderBy$);
      expect(sortOrder).toBe('appearance');
    });
  });

  describe('getInsight', () => {
    it('should return undefined for non-existent insight id', () => {
      const result = service.getInsight('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('should find insight by id from current insights map', () => {
      const result = service.getInsight('test-2');
      expect(result).toBeDefined();
      expect(result?.id).toBe('test-2');
      expect(result?.type).toBe('error');
    });
  });

  describe('display state', () => {
    it('should update display state with active insights', async () => {
      const activeIds = ['test-1', 'test-2'];

      service.setActiveInsights(activeIds);

      const state = await firstValueFrom(service.displayState$);
      expect(state.activeInsightIds).toEqual(activeIds);
    });

    it('should update multiple display state properties', async () => {
      const changes = {
        activeInsightIds: ['test-1'],
        promptActive: true,
        actionOverlayActive: true
      };

      service.updateDisplayState(changes);

      const state = await firstValueFrom(service.displayState$);
      expect(state.activeInsightIds).toEqual(['test-1']);
      expect(state.promptActive).toBeTrue();
      expect(state.actionOverlayActive).toBeTrue();
    });

    it('should toggle display state properties', async () => {
      service.updateDisplayState({ promptActive: false });
      service.toggleDisplayState(['promptActive']);

      const state = await firstValueFrom(service.displayState$);
      expect(state.promptActive).toBeTrue();
    });

    it('should clear display state', async () => {
      service.updateDisplayState({
        activeInsightIds: ['test-1'],
        promptActive: true,
        actionOverlayActive: true,
        cursorActiveInsightIds: ['test-2']
      });

      service.clearDisplayState();

      const state = await firstValueFrom(service.displayState$);
      expect(state.activeInsightIds).toEqual([]);
      expect(state.promptActive).toBeUndefined();
      expect(state.actionOverlayActive).toBeUndefined();
      expect(state.cursorActiveInsightIds).toEqual([]);
    });
  });

  describe('panel visibility', () => {
    it('should toggle panel visibility', async () => {
      const initialValue = await firstValueFrom(service.insightPanelVisible$);

      service.togglePanelVisibility();

      const newValue = await firstValueFrom(service.insightPanelVisible$);
      expect(newValue).toBe(!initialValue);
    });
  });

  describe('filtering', () => {
    it('should update filter properties', async () => {
      service.updateFilter({ scope: 'project' });

      const filter = await firstValueFrom(service.filter$);
      expect(filter.scope).toBe('project');
      expect(filter.types).toEqual(['warning', 'error']);
      expect(filter.includeDismissed).toBeTrue();
    });

    it('should toggle filter type', async () => {
      service.toggleFilterType('info');

      let filter = await firstValueFrom(service.filter$);
      expect(filter.types).toContain('info');
      expect(filter.types).toContain('warning');
      expect(filter.types).toContain('error');

      service.toggleFilterType('warning');

      filter = await firstValueFrom(service.filter$);
      expect(filter.types).toContain('info');
      expect(filter.types).not.toContain('warning');
      expect(filter.types).toContain('error');
    });

    it('should toggle includeDismissed setting', async () => {
      service.toggleFilterDismissed();

      const filter = await firstValueFrom(service.filter$);
      expect(filter.includeDismissed).toBeFalse();
    });
  });

  describe('dismissal management', () => {
    it('should add dismissed insight ids', async () => {
      service.dismissInsights(['test-1', 'test-2']);

      const ids = await firstValueFrom(service.dismissedInsightIds$);
      expect(ids).toContain('test-1');
      expect(ids).toContain('test-2');
      expect(ids.length).toBe(2);
    });

    it('should remove dismissed insight ids', async () => {
      service.dismissInsights(['test-1', 'test-2']);
      service.restoreDismissedInsights(['test-1']);

      const ids = await firstValueFrom(service.dismissedInsightIds$);
      expect(ids).not.toContain('test-1');
      expect(ids).toContain('test-2');
      expect(ids.length).toBe(1);
    });
  });

  describe('filtering and counting', () => {
    it('should filter insights by current filter', async () => {
      service.updateFilter({
        scope: 'project',
        types: ['warning'],
        includeDismissed: true
      });

      // Ensure subscription before emitting
      const subscription = service.filteredInsights$.subscribe();
      rawInsightSource.next(testInsights);

      const insights = await firstValueFrom(service.filteredInsights$);

      subscription.unsubscribe();

      expect(insights.length).toBe(2);
      expect(insights.map(i => i.id)).toContain('test-1');
      expect(insights.map(i => i.id)).toContain('test-4');
    });

    it('should calculate counts by scope', async () => {
      service.updateFilter({
        types: ['info', 'warning', 'error'],
        includeDismissed: true
      });

      // Ensure subscription before emitting
      const subscription = service.filteredInsightCountsByScope$.subscribe();
      rawInsightSource.next(testInsights);

      const counts = await firstValueFrom(service.filteredInsightCountsByScope$);

      subscription.unsubscribe();

      expect(counts.project).toBe(4);
      expect(counts.book).toBe(3);
      expect(counts.chapter).toBe(2);
    });

    it('should calculate counts by type', async () => {
      service.updateFilter({
        scope: 'project',
        includeDismissed: true,
        types: ['warning', 'error', 'info']
      });

      // Ensure subscription before emitting
      const subscription = service.filteredInsightCountsByType$.subscribe();
      rawInsightSource.next(testInsights);

      const counts = await firstValueFrom(service.filteredInsightCountsByType$);

      subscription.unsubscribe();

      expect(counts.warning).toBe(2);
      expect(counts.error).toBe(1);
      expect(counts.info).toBe(1);
    });
  });
});
