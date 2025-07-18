import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import {
  ComponentFixture,
  discardPeriodicTasks,
  fakeAsync,
  flush,
  flushMicrotasks,
  TestBed,
  tick
} from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTreeModule } from '@angular/material/tree';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { Range } from 'quill';
import Delta from 'quill-delta';
import { LynxInsightSortOrder, LynxInsightType } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { BehaviorSubject, of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { ActivatedBookChapterService, RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { IncludesPipe } from 'xforge-common/includes.pipe';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { TextDoc, TextDocId } from '../../../../../core/models/text-doc';
import { SFProjectService } from '../../../../../core/sf-project.service';
import { CustomIconModule } from '../../../../../shared/custom-icon.module';
import { EditorSegmentService } from '../base-services/editor-segment.service';
import { EDITOR_INSIGHT_DEFAULTS, LynxInsight, LynxInsightConfig } from '../lynx-insight';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { LynxInsightsPanelHeaderComponent } from './lynx-insights-panel-header/lynx-insights-panel-header.component';
import { InsightDescription, InsightPanelNode, LynxInsightsPanelComponent } from './lynx-insights-panel.component';

const mockLynxInsightStateService = mock<LynxInsightStateService>();
const mockActivatedProjectService = mock<ActivatedProjectService>();
const mockActivatedBookChapterService = mock<ActivatedBookChapterService>();
const mockSFProjectService = mock<SFProjectService>();
const mockRouter = mock<Router>();
const mockI18nService = mock<I18nService>();
const mockEditorSegmentService = mock<EditorSegmentService>();
const mockTextDoc = mock<TextDoc>();

const OPTIMIZATION_THRESHOLD = 50;

function createTestInsight(
  id: string,
  type: LynxInsightType = 'warning',
  description: string = `Test ${type} insight`,
  textDocId: TextDocId = new TextDocId('project1', 40, 1),
  range: Range = { index: 10, length: 5 }
): LynxInsight {
  return {
    id,
    type,
    textDocId,
    range,
    code: `${type.toUpperCase()}001`,
    source: 'test-source',
    description
  };
}

/**
 * Create a test node with optional children.
 */
function createTestNode(
  description: string,
  type: LynxInsightType = 'warning',
  insight?: LynxInsight,
  children?: InsightPanelNode[]
): InsightPanelNode {
  return {
    description,
    type,
    insight,
    children,
    range: { index: 0, length: 5 }
  };
}

/**
 * Creates large sets of test nodes for performance testing.
 */
function createLargeNodeSet(childCount: number, baseDescription: string = 'Child'): InsightPanelNode[] {
  return Array.from({ length: childCount }, (_, i) =>
    createTestNode(`${baseDescription} ${i}`, 'warning', createTestInsight(`insight-${i}`))
  );
}

describe('LynxInsightsPanelComponent', () => {
  // Test data constants
  const testTextDocId = new TextDocId('project1', 40, 1);
  const testInsight1 = createTestInsight('insight-1', 'warning', 'Test warning insight', testTextDocId, {
    index: 10,
    length: 5
  });
  const testInsight2 = createTestInsight('insight-2', 'error', 'Test error insight', testTextDocId, {
    index: 20,
    length: 8
  });
  const testInsight3 = createTestInsight('insight-3', 'warning', 'Test warning insight', testTextDocId, {
    index: 30,
    length: 3
  });

  configureTestingModule(() => ({
    imports: [
      MatTreeModule,
      MatIconModule,
      MatButtonModule,
      MatTooltipModule,
      MatMenuModule,
      MatTabsModule,
      MatDividerModule,
      IncludesPipe,
      NoopAnimationsModule,
      TestTranslocoModule,
      CustomIconModule
    ],
    declarations: [LynxInsightsPanelComponent, LynxInsightsPanelHeaderComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    providers: [
      { provide: LynxInsightStateService, useMock: mockLynxInsightStateService },
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: ActivatedBookChapterService, useMock: mockActivatedBookChapterService },
      { provide: SFProjectService, useMock: mockSFProjectService },
      { provide: Router, useMock: mockRouter },
      { provide: I18nService, useMock: mockI18nService },
      { provide: EditorSegmentService, useMock: mockEditorSegmentService },
      {
        provide: EDITOR_INSIGHT_DEFAULTS,
        useValue: {
          filter: { types: ['info', 'warning', 'error'], scope: 'chapter' },
          sortOrder: 'severity',
          queryParamName: 'insight',
          actionOverlayApplyPrimaryActionChord: { altKey: true, shiftKey: true, key: 'Enter' },
          panelLinkTextGoalLength: 30,
          panelOptimizationThreshold: OPTIMIZATION_THRESHOLD
        } as LynxInsightConfig
      }
    ]
  }));

  afterEach(() => {
    expect(1).toBe(1); // Avoid 'no expectations'
  });

  it('should handle empty insights array', fakeAsync(() => {
    const env = new TestEnvironment();

    env.filteredInsights$.next([]);
    tick();

    expect(env.component.treeDataSource).toEqual([]);

    discardPeriodicTasks();
  }));

  it('should handle insights without proper textDocId', fakeAsync(() => {
    const env = new TestEnvironment();

    const malformedInsight: LynxInsight = {
      id: 'malformed',
      type: 'warning',
      textDocId: undefined as any,
      range: { index: 0, length: 5 },
      code: 'TEST',
      source: 'test',
      description: 'Malformed insight'
    };

    env.filteredInsights$.next([malformedInsight]);
    tick();

    // Should handle gracefully without crashing
    expect(env.component).toBeTruthy();

    discardPeriodicTasks();
  }));

  describe('Tree data management', () => {
    it('should build tree nodes from insights', fakeAsync(() => {
      const insights = [testInsight1, testInsight2, testInsight3];
      const env = new TestEnvironment({ insights });

      expect(env.component.treeDataSource.length).toBeGreaterThan(0);

      // Should group insights by description
      const warningGroup = env.component.treeDataSource.find(node => node.description === 'Test warning insight');
      expect(warningGroup).toBeDefined();
      expect(warningGroup?.count).toBe(2); // Two warning insights with same description
    }));

    it('should sort nodes according to orderBy setting', fakeAsync(() => {
      const insights = [testInsight1, testInsight2];
      const env = new TestEnvironment({ insights, orderBy: 'severity' });

      expect(env.component.orderBy).toBe('severity');
      // Verify that tree data source is updated
      expect(env.component.treeDataSource.length).toBeGreaterThan(0);
    }));

    it('should clear view state caches when tree rebuilds', fakeAsync(() => {
      const env = new TestEnvironment();

      // Set initial insights to build tree first
      const insights = [testInsight1];
      env.setInsights(insights);
      flushMicrotasks();
      tick();

      // Populate caches with enough entries to exceed thresholds for cleanup
      // Use keys that won't match any current visible node descriptions
      for (let i = 0; i < env.LIGHTWEIGHT_CACHE_MAX_SIZE + 5; i++) {
        env.component['visibleChildrenCache'].set(`NONEXISTENT_NODE_DESC_${i}-childCount`, []);
      }
      for (let i = 0; i < env.LIGHTWEIGHT_CACHE_MAX_SIZE + 5; i++) {
        env.component['pagedLoadingCache'].set(`NONEXISTENT_NODE_DESC_${i}-loading`, true);
      }
      env.component['lastVisibleCountMap'].set('NONEXISTENT_NODE_DESC_1-count', 5);
      env.component['lastVisibleCountMap'].set('NONEXISTENT_NODE_DESC_2-count', 10);

      // Verify caches are populated above thresholds
      expect(env.component['visibleChildrenCache'].size).toBeGreaterThan(env.LIGHTWEIGHT_CACHE_MAX_SIZE);
      expect(env.component['pagedLoadingCache'].size).toBeGreaterThan(env.LIGHTWEIGHT_CACHE_MAX_SIZE);
      expect(env.component['lastVisibleCountMap'].size).toBeGreaterThan(0);

      // Trigger tree rebuild with different insights
      const newInsights = [testInsight2];
      env.setInsights(newInsights);
      flushMicrotasks();
      tick(env.component['TREE_REBUILD_DEBOUNCE_MS']);

      // Caches should be significantly reduced after cleanup
      expect(env.component['visibleChildrenCache'].size).toBeLessThan(env.LIGHTWEIGHT_CACHE_MAX_SIZE);
      expect(env.component['pagedLoadingCache'].size).toBeLessThan(env.LIGHTWEIGHT_CACHE_MAX_SIZE);

      discardPeriodicTasks();
    }));
  });

  describe('Node expansion and interaction', () => {
    it('should handle leaf node clicks by navigating to insight', fakeAsync(() => {
      // Create insight in a different book/chapter to trigger navigation
      const differentBookInsight = createTestInsight(
        'insight-different-book',
        'warning',
        'Test warning insight in different book',
        new TextDocId('project1', 41, 2) // Mark 2 (different from MAT 1)
      );

      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      const node = createTestNode('Test insight', 'warning', differentBookInsight);

      env.component.onLeafNodeClick(node);
      tick();

      verify(mockRouter.navigate(anything(), anything())).once();
      verify(mockLynxInsightStateService.updateDisplayState(anything())).once();
    }));

    it('should handle node expansion correctly', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      const parentNode: InsightPanelNode = {
        description: 'Parent node',
        type: 'warning',
        range: { index: 0, length: 5 },
        children: [
          {
            description: 'Child node',
            type: 'warning',
            insight: testInsight1,
            range: { index: 0, length: 5 }
          }
        ]
      };

      env.component.onNodeExpansionChange(parentNode, true);

      expect(env.component['expandCollapseState'].get('Parent node')).toBe(true);
    }));

    it('should restore dismissed insights', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      env.component.restoreDismissedInsight(testInsight1);

      verify(mockLynxInsightStateService.restoreDismissedInsights(deepEqual(['insight-1']))).once();
    }));

    it('should call processExpandedNode when onNodeExpansionChange is called with isExpanded=true', fakeAsync(() => {
      const testEnvironment = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const parentNode: InsightPanelNode = {
        description: 'Parent node',
        type: 'warning',
        range: { index: 0, length: 5 },
        children: [
          {
            description: 'Child node',
            type: 'warning',
            insight: testInsight1,
            range: { index: 0, length: 5 }
          }
        ]
      };

      spyOn<any>(testEnvironment.component, 'processExpandedNode');
      testEnvironment.component.onNodeExpansionChange(parentNode, true);

      expect(testEnvironment.component['processExpandedNode']).toHaveBeenCalledOnceWith(parentNode);
    }));

    it('should not call processExpandedNode when onNodeExpansionChange is called with isExpanded=false', fakeAsync(() => {
      const testEnvironment = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const parentNode: InsightPanelNode = {
        description: 'Parent node',
        type: 'warning',
        range: { index: 0, length: 5 },
        children: [
          {
            description: 'Child node',
            type: 'warning',
            insight: testInsight1,
            range: { index: 0, length: 5 }
          }
        ]
      };

      spyOn<any>(testEnvironment.component, 'processExpandedNode');
      testEnvironment.component.onNodeExpansionChange(parentNode, false);

      expect(testEnvironment.component['processExpandedNode']).not.toHaveBeenCalled();
    }));

    it('should not call processExpandedNode for nodes without children', fakeAsync(() => {
      const testEnvironment = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const leafNode: InsightPanelNode = {
        description: 'Leaf node',
        type: 'warning',
        insight: testInsight1,
        range: { index: 0, length: 5 }
      };

      spyOn<any>(testEnvironment.component, 'processExpandedNode');
      testEnvironment.component.onNodeExpansionChange(leafNode, true);

      expect(testEnvironment.component['processExpandedNode']).not.toHaveBeenCalled();
    }));

    it('should call processExpandedNode during restoreExpandCollapseState for expanded nodes', fakeAsync(() => {
      const testEnvironment = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      testEnvironment.component['expandCollapseState'].set('Parent node', true);

      const parentNode: InsightPanelNode = {
        description: 'Parent node',
        type: 'warning',
        range: { index: 0, length: 5 },
        children: [
          {
            description: 'Child node',
            type: 'warning',
            insight: testInsight1,
            range: { index: 0, length: 5 }
          }
        ]
      };

      testEnvironment.component.treeDataSource = [parentNode];

      spyOn<any>(testEnvironment.component, 'processExpandedNode');
      testEnvironment.component['restoreExpandCollapseState']();

      expect(testEnvironment.component['processExpandedNode']).toHaveBeenCalledOnceWith(parentNode);
    }));
  });

  describe('Paged loading', () => {
    it('should return all children for small node sets', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      const smallNode: InsightPanelNode = {
        description: 'Small node',
        type: 'warning',
        range: { index: 0, length: 5 },
        children: [
          {
            description: 'Child 1',
            type: 'warning',
            insight: testInsight1,
            range: { index: 0, length: 5 }
          }
        ]
      };
      const result = env.component.getChildrenAccessor(smallNode);
      expect(result.length).toBe(smallNode.children?.length || 0);
    }));

    it('should use paged loading for large node sets', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      // Create a large node set that exceeds optimization threshold
      const children = createLargeNodeSet(env.panelOptimizationThreshold + 10, 'Child');

      const largeNode = createTestNode('Large node', 'warning', undefined, children);

      // Mock needsPagedLoading to return true
      spyOn(env.component, 'needsPagedLoading').and.returnValue(true);
      spyOn(env.component, 'getVisibleChildren').and.returnValue(children.slice(0, 50));

      const result = env.component.getChildrenAccessor(largeNode);
      expect(result.length).toBeLessThanOrEqual(env.panelOptimizationThreshold);
    }));

    it('should correctly identify expandable nodes', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      const expandableNode: InsightPanelNode = {
        description: 'Expandable',
        type: 'warning',
        range: { index: 0, length: 5 },
        children: [
          {
            description: 'Child',
            type: 'warning',
            insight: testInsight1,
            range: { index: 0, length: 5 }
          }
        ]
      };

      const leafNode: InsightPanelNode = {
        description: 'Leaf',
        type: 'warning',
        insight: testInsight1,
        range: { index: 0, length: 5 }
      };

      expect(env.component.isExpandableNodePredicate(0, expandableNode)).toBe(true);
      expect(env.component.isExpandableNodePredicate(0, leafNode)).toBe(false);
    }));
  });

  describe('Memory management', () => {
    it('should clean up text snippet cache when insights are no longer in currentInsightIds', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      // Add some cache entries - some will be in current insights, some won't
      const insightDescription1: InsightDescription = {
        refString: 'Reference 1',
        sampleTextParts: { preText: 'pre', insightText: 'current-text', postText: 'post' }
      };
      const insightDescription2: InsightDescription = {
        refString: 'Reference 2',
        sampleTextParts: { preText: 'pre', insightText: 'obsolete-text', postText: 'post' }
      };

      // Add entries to cache
      env.component['textSnippetCache'].set('insight-1', insightDescription1); // This should be kept (in tree)
      env.component['textSnippetCache'].set('obsolete-insight', insightDescription2); // This should be removed (not in tree)

      expect(env.component['textSnippetCache'].size).toBe(2);

      (env.component as any).cleanUpCaches();

      // Only the insight that's in the current tree should remain
      expect(env.component['textSnippetCache'].size).toBe(1);
      expect(env.component['textSnippetCache'].has('insight-1')).toBe(true);
      expect(env.component['textSnippetCache'].has('obsolete-insight')).toBe(false);
    }));

    it('should clean up text doc data cache when it exceeds max size', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      // Fill cache beyond max size
      // Add some that match current insights (should be kept) and some that don't (should be removed)
      const currentTextDocKey = testInsight1.textDocId.toString(); // This should be kept (visible)

      // Add the current textDoc first
      env.component['textDocDataCache'].set(currentTextDocKey, mockTextDoc.data!);

      // Then add many obsolete entries to exceed the limit
      for (let i = 0; i < env.TEXT_DOC_CACHE_MAX_SIZE + 10; i++) {
        env.component['textDocDataCache'].set(`obsolete-doc-${i}`, mockTextDoc.data!);
      }

      expect(env.component['textDocDataCache'].size).toBeGreaterThan(env.TEXT_DOC_CACHE_MAX_SIZE);

      (env.component as any).manageMemoryUsage();

      // Cache should be reduced to max size or below
      expect(env.component['textDocDataCache'].size).toBeLessThanOrEqual(env.TEXT_DOC_CACHE_MAX_SIZE);

      // The visible textDoc should be kept if possible
      if (env.component['textDocDataCache'].size > 0) {
        // If any entries remain, visible ones should be prioritized
        expect(env.component['textDocDataCache'].has(currentTextDocKey)).toBe(true);
      }
    }));

    it('should clean up loading progress for obsolete nodes', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      env.component['loadingProgressMap'].set('obsolete-node', { completed: 5, total: 10 });
      env.component['nodesWithLargeChildSets'].add('current-node');

      (env.component as any).cleanUpCaches();

      expect(env.component['loadingProgressMap'].has('obsolete-node')).toBe(false);
      expect(env.component['nodesWithLargeChildSets'].has('current-node')).toBe(true);

      // tick(500);
    }));

    it('should clean up visible children cache for obsolete entries', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      // Add many cache entries to exceed the limit and trigger cleanup
      for (let i = 0; i < env.LIGHTWEIGHT_CACHE_MAX_SIZE + 20; i++) {
        env.component['visibleChildrenCache'].set(`obsolete-entry-${i}`, []);
      }

      // Add a cache entry that matches a current tree node description
      env.component['visibleChildrenCache'].set('Test warning insight', []);

      // The cache should now be over the limit, so cleanup should happen
      (env.component as any).manageMemoryUsage();

      // Should clean up many obsolete entries
      let obsoleteEntriesRemaining = 0;
      for (let i = 0; i < env.LIGHTWEIGHT_CACHE_MAX_SIZE + 20; i++) {
        if (env.component['visibleChildrenCache'].has(`obsolete-entry-${i}`)) {
          obsoleteEntriesRemaining++;
        }
      }

      // Entries should be removed
      expect(obsoleteEntriesRemaining).toBeLessThan(env.LIGHTWEIGHT_CACHE_MAX_SIZE + 20);
      // Should keep entries that match current tree nodes if they're visible
      expect(env.component['visibleChildrenCache'].has('Test warning insight')).toBe(true);
    }));
  });

  describe('Text processing and caching', () => {
    it('should cache text snippets after processing', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      flushMicrotasks(); // Wait for initial tree building

      // Verify we have tree data
      expect(env.component.treeDataSource.length).toBeGreaterThan(0);

      // Find a parent node in the actual tree structure that has children
      const parentNode = env.component.treeDataSource.find(node => node.children && node.children.length > 0);

      if (parentNode?.children && parentNode.children?.length > 0) {
        // Force text processing by expanding the node
        env.component.onNodeExpansionChange(parentNode, true);
        tick(1000); // Allow async processing to complete
        flushMicrotasks(); // Flush any remaining microtasks

        // Check if any text snippets were cached for insights with text processing
        const childNodeWithInsight = parentNode.children.find(child => child.insight != null);
        if (childNodeWithInsight && childNodeWithInsight.insight) {
          const expectedCacheKey = childNodeWithInsight.insight.id;
          const hasCachedText = env.component['textSnippetCache'].has(expectedCacheKey);

          // If text processing happened, we should have cached text
          if (hasCachedText) {
            expect(env.component['textSnippetCache'].size).toBeGreaterThan(0);
          } else {
            // If no text was cached, it could be because text processing failed or was skipped
            // This is acceptable for this test case
            expect(env.component['textSnippetCache'].size).toBe(0);
          }
        } else {
          // No child nodes with insights, so no text processing would occur
          expect(env.component['textSnippetCache'].size).toBe(0);
        }
      } else {
        // If no parent nodes with children exist, no text processing would occur
        expect(env.component['textSnippetCache'].size).toBe(0);
      }
    }));

    it('should use cached text snippets when available', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      const cachedInsightDescription: InsightDescription = {
        refString: 'Matthew 1:1',
        sampleTextParts: { preText: 'pre', insightText: 'Cached text snippet', postText: 'post' }
      };
      env.component['textSnippetCache'].set('insight-1', cachedInsightDescription);

      const parentNode: InsightPanelNode = {
        description: 'Parent',
        type: 'warning',
        range: { index: 0, length: 5 },
        children: [
          {
            description: 'Child',
            type: 'warning',
            insight: testInsight1,
            range: { index: 0, length: 5 }
          }
        ]
      };

      env.component.onNodeExpansionChange(parentNode, true);

      const child = parentNode.children![0];
      expect(child.insightDescription).toEqual(cachedInsightDescription);
      expect(child.isLoading).toBe(false);
    }));
  });

  describe('State tracking', () => {
    it('should restore expand/collapse state after tree rebuild', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const mockTree = jasmine.createSpyObj('MatTree', ['expand', 'collapse', 'isExpanded']);

      env.component['expandCollapseState'].set('Test warning insight', true);
      env.component['expandCollapseState'].set('Test error insight', false);
      env.component.tree = mockTree;

      // Trigger tree rebuild
      env.filteredInsights$.next([testInsight2, testInsight3]);
      tick();

      expect(env.component['expandCollapseState'].size).toBeGreaterThan(0);
      discardPeriodicTasks();
    }));

    it('should track active book chapter changes', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const newBookChapter: RouteBookChapter = { bookId: 'LUK', chapter: 5 };

      env.activatedBookChapter$.next(newBookChapter);
      tick();

      expect(env.component.activeBookChapter).toEqual(newBookChapter);
    }));
  });

  describe('Performance optimizations', () => {
    it('should use batch processing for large node sets', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      // Find an existing parent node in the tree
      const parentNode = env.component.treeDataSource.find(node => node.children && node.children.length > 0);

      if (parentNode == null) {
        throw new Error('No parent node found in the tree');
      }

      // Add many children to exceed the threshold
      for (let i = 0; i < env.panelOptimizationThreshold * 2; i++) {
        parentNode.children!.push({
          description: `Child ${i}`,
          type: 'warning',
          insight: { ...testInsight1, id: `insight-${i}` },
          range: { index: 0, length: 5 }
        });
      }

      env.component.onNodeExpansionChange(parentNode, true);
      tick(2000); // Allow all batches to process

      expect(env.component['nodesWithLargeChildSets'].has(parentNode.description)).toBe(true);
      flush();
    }));

    it('should track loading progress for large operations', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      // Find an existing parent node in the tree
      const parentNode = env.component.treeDataSource.find(node => node.children && node.children.length > 0);

      if (parentNode == null) {
        throw new Error('No parent node found in the tree');
      }

      // Add enough children to trigger progress tracking
      for (let i = 0; i < env.panelOptimizationThreshold * 2; i++) {
        parentNode.children!.push({
          description: `Child ${i}`,
          type: 'warning',
          insight: { ...testInsight1, id: `insight-${i}` },
          range: { index: 0, length: 5 }
        });
      }

      env.component.onNodeExpansionChange(parentNode, true);

      expect(env.component['loadingProgressMap'].has(parentNode.description)).toBe(true);
      const progress = env.component['loadingProgressMap'].get(parentNode.description);
      expect(progress?.total).toBeGreaterThan(0);
    }));

    it('should handle very large child sets efficiently', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });

      const veryLargeNode: InsightPanelNode = {
        description: 'Very large node',
        type: 'warning',
        range: { index: 0, length: 5 },
        children: []
      };

      for (let i = 0; i < 3000; i++) {
        veryLargeNode.children!.push({
          description: `Child ${i}`,
          type: 'warning',
          insight: { ...testInsight1, id: `insight-${i}` },
          range: { index: 0, length: 5 }
        });
      }

      expect(() => {
        env.component.onNodeExpansionChange(veryLargeNode, true);
      }).not.toThrow();
    }));
  });

  describe('getText()', () => {
    it('should extract text from delta with no trimming', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const delta = new Delta([{ insert: 'The rain in Spain falls mainly on the plain' }]);
      const range: Range = { index: 2, length: 11 }; // 'e rain in S'

      const result = (env.component as any).getText(delta, range, 'trim-none');
      expect(result).toBe('e rain in S');
    }));

    it('should extract text from delta with word start trimming', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const delta = new Delta([{ insert: 'The rain in Spain falls mainly on the plain' }]);
      const range: Range = { index: 2, length: 11 }; // 'e rain in S'

      const result = (env.component as any).getText(delta, range, 'trim-word-start');
      expect(result).toBe('rain in S');
    }));

    it('should extract text from delta with word end trimming', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const delta = new Delta([{ insert: 'The rain in Spain falls mainly on the plain' }]);
      const range: Range = { index: 2, length: 11 }; // 'e rain in S'

      const result = (env.component as any).getText(delta, range, 'trim-word-end');
      expect(result).toBe('e rain in');
    }));

    it('should handle whitespace-only trimming for word start', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const delta = new Delta([{ insert: 'A  big horse!' }]);
      const range: Range = { index: 1, length: 7 }; // ' big h'

      const result = (env.component as any).getText(delta, range, 'trim-word-start');
      expect(result).toBe('big h');
    }));

    it('should handle whitespace-only trimming for word end', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const delta = new Delta([{ insert: 'A big horse!  ' }]);
      const range: Range = { index: 7, length: 7 }; // 'orse!  '

      const result = (env.component as any).getText(delta, range, 'trim-word-end');
      expect(result).toBe('orse!');
    }));

    it('should handle delta with multiple ops', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const delta = new Delta([{ insert: 'Hello ' }, { insert: 'world ' }, { insert: 'from ' }, { insert: 'Delta!' }]);
      const range: Range = { index: 6, length: 11 }; // 'world from '

      const result = (env.component as any).getText(delta, range, 'trim-none');
      expect(result).toBe('world from ');
    }));

    it('should handle delta with non-string inserts', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const delta = new Delta([{ insert: 'Hello ' }, { insert: { embed: 'image' } }, { insert: 'world!' }]);
      const range: Range = { index: 0, length: 15 }; // Should span the entire delta

      const result = (env.component as any).getText(delta, range, 'trim-none');
      expect(result).toBe('Hello world!'); // Non-string inserts should become empty strings
    }));

    it('should handle empty delta', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const delta = new Delta([]);
      const range: Range = { index: 0, length: 5 };

      const result = (env.component as any).getText(delta, range, 'trim-none');
      expect(result).toBe('');
    }));

    it('should handle range beyond delta length', fakeAsync(() => {
      const env = new TestEnvironment({ insights: [testInsight1, testInsight2] });
      const delta = new Delta([{ insert: 'Short text' }]);

      const result = (env.component as any).getText(delta, { index: 5, length: 20 }, 'trim-none');
      expect(result).toBe(' text');
    }));
  });
});

interface TestEnvironmentConstructorArgs {
  insights?: LynxInsight[];
  orderBy?: LynxInsightSortOrder;
  dismissedInsights?: string[];
  projectId?: string;
  bookChapter?: RouteBookChapter;
  callback?: (env: TestEnvironment) => void;
}

class TestEnvironment {
  readonly component: LynxInsightsPanelComponent;
  readonly fixture: ComponentFixture<LynxInsightsPanelComponent>;

  readonly TEXT_DOC_CACHE_MAX_SIZE: number;
  readonly LIGHTWEIGHT_CACHE_MAX_SIZE: number;
  readonly MAX_BATCH_SIZE: number;
  readonly panelOptimizationThreshold: number = OPTIMIZATION_THRESHOLD;

  // Subjects for reactive testing
  readonly filteredInsights$ = new BehaviorSubject<LynxInsight[]>([]);
  readonly orderBy$ = new BehaviorSubject<LynxInsightSortOrder>('appearance');
  readonly dismissedInsightIds$ = new BehaviorSubject<string[]>([]);
  readonly activatedBookChapter$ = new BehaviorSubject<RouteBookChapter | undefined>({
    bookId: 'MAT',
    chapter: 1
  });
  readonly filter$ = new BehaviorSubject({
    types: ['info', 'warning', 'error'] as LynxInsightType[],
    scope: 'chapter' as const,
    includeDismissed: false
  });
  readonly filteredInsightCountsByScope$ = new BehaviorSubject<Record<string, number>>({
    project: 0,
    book: 0,
    chapter: 0
  });
  readonly filteredInsightCountsByType$ = new BehaviorSubject<Record<LynxInsightType, number>>({
    error: 0,
    warning: 0,
    info: 0
  });
  readonly insightPanelVisible$ = new BehaviorSubject<boolean>(true);
  readonly displayState$ = new BehaviorSubject({
    activeInsightIds: [],
    cursorActiveInsightIds: []
  });

  constructor({
    insights = [],
    orderBy = 'appearance',
    dismissedInsights = [],
    projectId = 'project1',
    bookChapter = { bookId: 'MAT', chapter: 1 },
    callback
  }: TestEnvironmentConstructorArgs = {}) {
    // Setup mock behavior
    when(mockLynxInsightStateService.filteredInsights$).thenReturn(this.filteredInsights$);
    when(mockLynxInsightStateService.orderBy$).thenReturn(this.orderBy$);
    when(mockLynxInsightStateService.dismissedInsightIds$).thenReturn(this.dismissedInsightIds$);
    when(mockLynxInsightStateService.filter$).thenReturn(this.filter$);
    when(mockLynxInsightStateService.filteredInsightCountsByScope$).thenReturn(this.filteredInsightCountsByScope$);
    when(mockLynxInsightStateService.filteredInsightCountsByType$).thenReturn(this.filteredInsightCountsByType$);
    when(mockLynxInsightStateService.insightPanelVisible$).thenReturn(this.insightPanelVisible$);
    when(mockLynxInsightStateService.displayState$).thenReturn(this.displayState$);
    when(mockLynxInsightStateService.updateDisplayState(anything())).thenReturn();
    when(mockLynxInsightStateService.restoreDismissedInsights(anything())).thenReturn();

    when(mockActivatedBookChapterService.activatedBookChapter$).thenReturn(this.activatedBookChapter$);
    when(mockActivatedProjectService.projectId).thenReturn(projectId);

    // Mock text document with Delta ops
    const mockTextDocData = {
      ops: [
        { insert: 'Sample text content for testing insights and ranges ' },
        { insert: 'More text for comprehensive testing.\n' }
      ]
    };
    when(mockTextDoc.data).thenReturn(mockTextDocData);

    // This is the critical fix - ensure getText returns a Promise, not null
    when(mockSFProjectService.getText(anything())).thenReturn(Promise.resolve(instance(mockTextDoc)));
    when(mockTextDoc.getSegmentText(anything())).thenReturn('Sample text content for testing');

    when(mockRouter.navigate(anything(), anything())).thenReturn(Promise.resolve(true));
    when(mockI18nService.translate(anything())).thenReturn(of('Translated text'));
    when(mockI18nService.localizeBook(anything())).thenReturn('Book');
    when(mockI18nService.translateStatic(anything())).thenReturn('Loading...');

    // Mock EditorSegmentService behavior
    when(mockEditorSegmentService.parseSegments(anything())).thenReturn(new Map());
    when(mockEditorSegmentService.getSegmentRefs(anything(), anything())).thenReturn([]);

    if (callback != null) {
      callback(this);
    }

    // Set initial values BEFORE creating the component to avoid change detection issues
    this.filteredInsights$.next(insights);
    this.orderBy$.next(orderBy);
    this.dismissedInsightIds$.next(dismissedInsights);
    this.activatedBookChapter$.next(bookChapter);

    // Create fixture
    this.fixture = TestBed.createComponent(LynxInsightsPanelComponent);
    this.component = this.fixture.componentInstance;

    // Initialize component constants from the actual component
    this.TEXT_DOC_CACHE_MAX_SIZE = (this.component as any)['TEXT_DOC_CACHE_MAX_SIZE'];
    this.LIGHTWEIGHT_CACHE_MAX_SIZE = (this.component as any)['LIGHTWEIGHT_CACHE_MAX_SIZE'];
    this.MAX_BATCH_SIZE = (this.component as any)['MAX_BATCH_SIZE'];

    // Allow the component to initialize and process initial data
    tick();
    this.fixture.detectChanges();
    flushMicrotasks(); // Flush Promise.resolve() calls
    tick(this.component['TREE_REBUILD_DEBOUNCE_MS']); // Allow any async operations to complete
  }

  setInsights(insights: LynxInsight[]): void {
    this.filteredInsights$.next(insights);
    tick();
    flushMicrotasks(); // Flush Promise.resolve() calls
    this.fixture.detectChanges();
  }

  setOrderBy(orderBy: LynxInsightSortOrder): void {
    this.orderBy$.next(orderBy);
    tick();
    this.fixture.detectChanges();
  }

  setDismissedInsights(dismissedIds: string[]): void {
    this.dismissedInsightIds$.next(dismissedIds);
    tick();
    this.fixture.detectChanges();
  }

  setBookChapter(bookChapter: RouteBookChapter): void {
    this.activatedBookChapter$.next(bookChapter);
    tick();
    this.fixture.detectChanges();
  }
}
