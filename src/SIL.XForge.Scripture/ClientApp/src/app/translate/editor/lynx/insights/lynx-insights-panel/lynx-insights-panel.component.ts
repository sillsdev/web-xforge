import { AfterViewInit, Component, DestroyRef, Inject, ViewChild } from '@angular/core';
import { MatTree } from '@angular/material/tree';
import { Router } from '@angular/router';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { groupBy } from 'lodash-es';
import { Range } from 'quill';
import Delta from 'quill-delta';
import {
  LynxInsightSortOrder,
  LynxInsightType,
  LynxInsightTypes
} from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { asapScheduler, combineLatest, map, observeOn, tap } from 'rxjs';
import { ActivatedBookChapterService, RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { isWhitespace } from 'xforge-common/util/string-util';
import { TextDoc } from '../../../../../core/models/text-doc';
import { SFProjectService } from '../../../../../core/sf-project.service';
import { rangeComparer } from '../../../../../shared/text/quill-util';
import { combineVerseRefStrs, getVerseRefFromSegmentRef } from '../../../../../shared/utils';
import { EditorSegmentService } from '../base-services/editor-segment.service';
import { EDITOR_INSIGHT_DEFAULTS, LynxInsight, LynxInsightConfig, LynxInsightRange } from '../lynx-insight';
import { LynxInsightStateService } from '../lynx-insight-state.service';

/**
 * The sample text surrounding an insight, broken into pre-text, insight text, and post-text.
 */
export interface InsightRangeSampleText {
  preText: string;
  insightText: string;
  postText: string;
}

export interface InsightDescription {
  /** Formatted as `{Book name} {Chapter}:{Verse}` */
  refString: string;
  /** The sample text surrounding the insight. */
  sampleTextParts: InsightRangeSampleText;
}

export interface InsightPanelNode {
  description: string;
  type: LynxInsightType;
  children?: InsightPanelNode[];
  insight?: LynxInsight;
  insightDescription?: InsightDescription;
  range: Range;
  count?: number;
  isDismissed?: boolean;
  isLoading?: boolean;
  loadingProgressPercent?: number;
  remainingChildCount?: number;
}

interface LynxInsightWithText extends LynxInsight {
  sampleTextParts: InsightRangeSampleText;
}

@Component({
  selector: 'app-lynx-insights-panel',
  templateUrl: './lynx-insights-panel.component.html',
  styleUrl: './lynx-insights-panel.component.scss'
})
export class LynxInsightsPanelComponent implements AfterViewInit {
  @ViewChild(MatTree) tree?: MatTree<InsightPanelNode>;

  treeDataSource: InsightPanelNode[] = [];

  // Preserve expand/collapse state when tree reloads due to insights$ update: description -> expanded
  expandCollapseState = new Map<string, boolean>();
  orderBy?: LynxInsightSortOrder;
  activeBookChapter?: RouteBookChapter;

  /** Map of TextDocId string -> (Map of segment ref -> segment range). */
  private textDocSegments = new Map<string, Map<string, LynxInsightRange>>();

  /** Maps insight id to `InsightDescription` (containing the text snippet). */
  private textSnippetCache = new Map<string, InsightDescription>();

  /** Maps TextDocId string to TextDoc promise. */
  private textDocCache = new Map<string, Promise<TextDoc>>();

  /** Set of all insight ids currently in the tree (used for cache cleanup). */
  private currentInsightIds = new Set<string>();

  /** Tracks which nodes have very large child sets to provide special UI feedback. */
  private nodesWithLargeChildSets = new Set<string>();

  /** Tracks loading progress for large node sets - Maps node description -> {completed: number, total: number}. */
  private loadingProgressMap = new Map<string, { completed: number; total: number }>();

  /** Maps visible node description -> children nodes. */
  private visibleChildrenCache = new Map<string, InsightPanelNode[]>();

  /** Maps node description -> whether a node needs paged loading. */
  private pagedLoadingCache = new Map<string, boolean>();

  /** Track the last visible node count for each node to detect when more are loaded. */
  private lastVisibleCountMap = new Map<string, number>();

  /** Initial batch size for high-priority processing. */
  private readonly INITIAL_BATCH_SIZE = 10;

  /** Maximum number of nodes to process in a single batch. */
  private readonly MAX_BATCH_SIZE = 50;

  /** Prevents memory growth of text doc cache. */
  private readonly TEXT_DOC_CACHE_MAX_SIZE = 100;

  /** Prevents memory growth of visible children cache and paged loading cache. */
  private readonly LIGHTWEIGHT_CACHE_MAX_SIZE = 1000;

  /** Threshold for triggering cache cleanup based on num items processed since last cleanup. */
  private readonly NUM_ITEMS_CACHE_CLEANUP_THRESHOLD = 200;

  /** Num items processed since last memory cleanup. */
  private numItemsProcessedSinceCleanup = 0;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly editorInsightState: LynxInsightStateService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly activatedBookChapterService: ActivatedBookChapterService,
    private readonly editorSegmentService: EditorSegmentService,
    private readonly projectService: SFProjectService,
    private readonly router: Router,
    readonly i18n: I18nService,
    @Inject(EDITOR_INSIGHT_DEFAULTS) readonly lynxInsightConfig: LynxInsightConfig
  ) {}

  ngAfterViewInit(): void {
    combineLatest([
      this.editorInsightState.filteredInsights$,
      this.editorInsightState.orderBy$.pipe(tap(val => (this.orderBy = val))),
      this.editorInsightState.dismissedInsightIds$
    ])
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        map(([insights, orderBy, dismissedIds]) => this.buildTreeNodes(insights, orderBy, dismissedIds)),
        observeOn(asapScheduler) // Avoids ExpressionChangedAfterItHasBeenCheckedError
      )
      .subscribe(treeNodes => {
        this.treeDataSource = treeNodes;
        this.restoreExpandCollapseState();

        // Clear view state caches when tree rebuilds to avoid stale data (node structure may have changed)
        this.visibleChildrenCache.clear();
        this.lastVisibleCountMap.clear();
        this.pagedLoadingCache.clear();

        // After rebuilding tree nodes, clean up unnecessary memory usage
        this.manageMemoryUsage();
      });

    this.activatedBookChapterService.activatedBookChapter$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(bookChapter => {
        this.activeBookChapter = bookChapter;
      });
  }

  // Passed to mat-tree in the template.
  getChildrenAccessor = (node: InsightPanelNode): InsightPanelNode[] => {
    // If paged loading is needed, only return a subset of children
    if (this.needsPagedLoading(node)) {
      const visibleChildren = this.getVisibleChildren(node);
      return visibleChildren;
    }

    return node.children ?? [];
  };

  // 'when' predicate to determine if the group template should be used
  isExpandableNodePredicate = (_index: number, node: InsightPanelNode): boolean => this.hasChildren(node);

  // Handle clicks on leaf nodes (insights) to navigate to the chapter of the insight and show the overlay
  onLeafNodeClick(node: InsightPanelNode): void {
    if (node.insight != null) {
      const insight: LynxInsight = node.insight;

      // Show action menu overlay in editor
      this.navInsight(insight).then(() => {
        this.editorInsightState.updateDisplayState({
          activeInsightIds: [insight.id],
          promptActive: false,
          actionOverlayActive: true
        });
      });
    }
  }

  /**
   * Handles expanding and collapsing nodes in the tree.
   * When a node is expanded, immediately show all children with placeholders,
   * then progressively load and update the text snippets.
   */
  onNodeExpansionChange(node: InsightPanelNode, isExpanded: boolean): void {
    if (!this.hasChildren(node)) {
      return;
    }

    this.expandCollapseState.set(node.description, isExpanded);

    if (isExpanded === true) {
      this.processExpandedNode(node);
    }
  }

  restoreDismissedInsight(insight: LynxInsight): void {
    this.editorInsightState.restoreDismissedInsights([insight.id]);
  }

  /**
   * Checks if a node has a very large number of children.
   * Used by the template to show special UI handling.
   * @param node The node to check.
   * @returns True if the node has a large number of children.
   */
  isLargeNodeSet(node: InsightPanelNode): boolean {
    return this.nodesWithLargeChildSets.has(node.description);
  }

  /**
   * Determines if a node needs paged loading optimization.
   * Uses caching to avoid repeatedly checking the same nodes.
   * @param node The node to check.
   * @returns True if the node should use paged loading.
   */
  needsPagedLoading(node: InsightPanelNode): boolean {
    // If node has no description or no children, it doesn't need paged loading
    if (!node.description || !node.children) {
      return false;
    }

    const cacheKey = node.description;
    const cached = this.pagedLoadingCache.get(cacheKey);
    if (cached != null) {
      return cached;
    }

    // Use paged loading for nodes with large child sets
    const needsPaging = node.children.length > this.lynxInsightConfig.panelOptimizationThreshold;
    this.pagedLoadingCache.set(cacheKey, needsPaging);
    return needsPaging;
  }

  /**
   * Gets the subset of nodes that should be displayed for an extremely large node set.
   * Uses caching to improve performance when tree is repeatedly rendered.
   * @param node The node whose children should be retrieved
   * @returns Array of visible child nodes
   */
  getVisibleChildren(node: InsightPanelNode): InsightPanelNode[] {
    if (node.children == null) {
      return [];
    }

    const cacheKey = node.description;
    const cached = this.visibleChildrenCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Get current visible count, defaulting to the optimization threshold
    const defaultCount = this.lynxInsightConfig.panelOptimizationThreshold;
    const currentCount = this.lastVisibleCountMap.get(node.description) || defaultCount;
    const visibleChildren = node.children.slice(0, currentCount);

    this.visibleChildrenCache.set(cacheKey, visibleChildren);
    return visibleChildren;
  }

  /**
   * Returns the total number of additional nodes that are not currently visible.
   */
  getRemainingNodeCount(node: InsightPanelNode): number {
    if (!node.children) {
      return 0;
    }
    const defaultCount = this.lynxInsightConfig.panelOptimizationThreshold;
    const currentCount = this.lastVisibleCountMap.get(node.description) || defaultCount;
    return Math.max(0, node.children.length - currentCount);
  }

  /**
   * Shows more nodes by incrementing the number of visible nodes.
   */
  showMoreNodes(node: InsightPanelNode): void {
    if (!node.children) {
      return;
    }

    const defaultCount = this.lynxInsightConfig.panelOptimizationThreshold;
    const currentCount = this.lastVisibleCountMap.get(node.description) || defaultCount;
    const nextBatchSize = Math.min(this.MAX_BATCH_SIZE, node.children.length - currentCount);
    const newCount = currentCount + nextBatchSize;

    this.lastVisibleCountMap.set(node.description, newCount);

    // Clear cache to force recalculation
    const cacheKey = node.description;
    this.visibleChildrenCache.delete(cacheKey);

    // Update remaining count immediately so UI is consistent
    if (node.children) {
      node.remainingChildCount = Math.max(0, node.children.length - newCount);
    }
  }

  /**
   * Groups insights by description and prepares them as hierarchical InsightPanelNode.
   */
  private buildTreeNodes(
    insights: LynxInsight[],
    orderBy: LynxInsightSortOrder,
    dismissedIds: string[]
  ): InsightPanelNode[] {
    const groupedNodes: InsightPanelNode[] = [];
    const dismissedIdSet: Set<string> = new Set(dismissedIds);

    // Group insights by description
    const insightsByDescription = groupBy(insights, 'description');

    for (const [desc, byDescGroup] of Object.entries(insightsByDescription)) {
      let descGroupNodeContainsAllDismissed = true;
      const groupRepresentative: LynxInsight = byDescGroup[0];

      const children: InsightPanelNode[] = byDescGroup.map(insight => {
        const isDismissed: boolean = dismissedIdSet.has(insight.id);
        if (!isDismissed) {
          descGroupNodeContainsAllDismissed = false;
        }

        const cachedInsightDescription: InsightDescription | undefined = this.textSnippetCache.get(insight.id);
        const isLoading: boolean = !cachedInsightDescription;

        return {
          description: '', // Only used for parent nodes
          type: insight.type,
          insight,
          insightDescription: cachedInsightDescription || this.getPlaceholderDescription(insight),
          range: insight.range,
          isDismissed,
          isLoading
        };
      });

      const descGroupNode: InsightPanelNode = {
        description: desc,
        type: groupRepresentative.type,
        children,
        count: byDescGroup.length,
        range: groupRepresentative.range,
        isDismissed: descGroupNodeContainsAllDismissed
      };

      groupedNodes.push(descGroupNode);
    }

    this.sortNodes(groupedNodes, orderBy);

    // Calculate progress properties for group nodes with many children
    for (const node of groupedNodes) {
      if (this.isLargeNodeSet(node)) {
        this.calculateNodeProgressProperties(node);
      }
    }

    return groupedNodes;
  }

  private processExpandedNode(node: InsightPanelNode): void {
    if (node.children != null && node.children.length > 0) {
      const isLargeNodeSet = node.children.length > this.lynxInsightConfig.panelOptimizationThreshold;

      if (isLargeNodeSet) {
        this.nodesWithLargeChildSets.add(node.description);

        const existingProgress = this.loadingProgressMap.get(node.description);

        let countToLoad = 0;
        let countAlreadyLoaded = 0;

        for (const child of node.children) {
          if (child.insight) {
            if (this.textSnippetCache.has(child.insight.id)) {
              countAlreadyLoaded++;
            } else {
              countToLoad++;
            }
          }
        }

        const totalCount = countToLoad + countAlreadyLoaded;

        // Only reset progress if no existing progress or if total changed significantly
        if (!existingProgress || Math.abs(existingProgress.total - totalCount) > 5) {
          this.loadingProgressMap.set(node.description, {
            completed: countAlreadyLoaded,
            total: totalCount
          });
        }
      }

      // Initialize the visible subset for large node sets or show all for normal sets
      const visibleChildren: InsightPanelNode[] = isLargeNodeSet
        ? node.children.slice(0, this.lynxInsightConfig.panelOptimizationThreshold)
        : node.children;

      for (const child of visibleChildren) {
        // Only update nodes that don't already have their text snippets
        if (child.insight && !this.textSnippetCache.has(child.insight.id)) {
          // Set initial placeholder based on bookNum and chapterNum
          child.insightDescription = this.getPlaceholderDescription(child.insight);
          child.isLoading = true;
        } else if (child.insight && this.textSnippetCache.has(child.insight.id)) {
          // Use cached text snippet if available
          child.insightDescription = this.textSnippetCache.get(child.insight.id)!;
          child.isLoading = false;
        }
      }

      // Process text for children nodes progressively to avoid blocking UI
      this.processChildrenTextProgressively(node);

      // Calculate progress properties (needed for "show more" button)
      if (node.children.length > this.lynxInsightConfig.panelOptimizationThreshold) {
        this.calculateNodeProgressProperties(node);
      }
    }
  }

  private restoreExpandCollapseState(): void {
    if (this.expandCollapseState.size === 0 || this.tree == null) {
      return;
    }

    for (const node of this.treeDataSource) {
      if (this.hasChildren(node)) {
        const shouldBeExpanded = this.expandCollapseState.get(node.description);

        if (shouldBeExpanded) {
          this.tree.expand(node);
          this.processExpandedNode(node);
        } else {
          this.tree.collapse(node);
        }
      }
    }
  }

  /**
   * Create a placeholder InsightDescription for an insight while its text is loading.
   */
  private getPlaceholderDescription(insight: LynxInsight): InsightDescription {
    let refString: string;

    if (insight.textDocId == null) {
      refString = this.i18n.translateStatic('lynx_insights_panel.unknown_insight_location');
    } else {
      const bookName = this.i18n.localizeBook(insight.textDocId.bookNum);
      const chapterNum = insight.textDocId.chapterNum;
      let verseNum = '';

      const textDocIdStr = insight.textDocId.toString();
      const editorSegments = this.textDocSegments.get(textDocIdStr);

      if (editorSegments) {
        const segmentRefs = this.editorSegmentService.getSegmentRefs(insight.range, editorSegments);

        if (segmentRefs.length > 0) {
          const segmentRef = segmentRefs[0];
          const verseRef = getVerseRefFromSegmentRef(insight.textDocId.bookNum, segmentRef);

          if (verseRef) {
            verseNum = verseRef.verseNum.toString();
          }
        }
      }

      refString = verseNum ? `${bookName} ${chapterNum}:${verseNum}` : `${bookName} ${chapterNum}`;
    }

    return {
      refString,
      sampleTextParts: { preText: '', insightText: '', postText: '' }
    };
  }

  private hasChildren(node: InsightPanelNode): boolean {
    return node.children != null && node.children.length > 0;
  }

  private sortNodes(nodes: InsightPanelNode[], orderBy: LynxInsightSortOrder): InsightPanelNode[] {
    switch (orderBy) {
      case 'severity':
        return nodes.sort((a, b) => LynxInsightTypes.indexOf(b.type) - LynxInsightTypes.indexOf(a.type));
      case 'appearance':
        return nodes.sort(rangeComparer);
      default:
        return nodes;
    }
  }

  private async navInsight(insight: LynxInsight): Promise<boolean> {
    if (this.activeBookChapter?.bookId == null || this.activeBookChapter?.chapter == null) {
      return false;
    }

    const activeBookNum: number = Canon.bookIdToNumber(this.activeBookChapter.bookId);

    if (
      insight.textDocId.bookNum !== activeBookNum ||
      insight.textDocId.chapterNum !== this.activeBookChapter.chapter
    ) {
      const insightBookId: string = Canon.bookNumberToId(insight.textDocId.bookNum);

      // Navigate to book/chapter with insight id as query params
      await this.router.navigate(
        ['/projects', this.activatedProject.projectId, 'translate', insightBookId, insight.textDocId.chapterNum],
        {
          queryParams: { [this.lynxInsightConfig.queryParamName]: insight.id }
        }
      );

      return true;
    }

    return false;
  }

  /**
   * Generate the description (link text) for an insight.  The format for the verse reference is as follows:
   * - If the range is within a single verse, `refString` is the verse reference (Example: `Mark 12:7`).
   * - If the range spans multiple verses, `refString` should reflect that (Example: `Mark 12:7-9`).
   * - Non-verse segments are included as [segment_ref] in the place of verse references.
   */
  private createInsightDescription(insight: LynxInsightWithText): InsightDescription {
    let textDocIdStr: string = '';

    if (this.activatedProject.projectId != null) {
      textDocIdStr = insight.textDocId.toString();
    }

    const editorSegments = this.textDocSegments.get(textDocIdStr);

    if (editorSegments == null) {
      return {
        refString: insight.textDocId?.toString(),
        sampleTextParts: { preText: '', insightText: '…', postText: '' } // '\u2026'
      };
    }

    const segmentRefs: string[] = this.editorSegmentService.getSegmentRefs(insight.range, editorSegments);
    let combinedVerseRef: VerseRef | undefined;
    let refString: string = '';

    for (const segmentRef of segmentRefs) {
      const verseRef: VerseRef | undefined = getVerseRefFromSegmentRef(insight.textDocId.bookNum, segmentRef);

      if (verseRef != null) {
        if (combinedVerseRef != null) {
          combinedVerseRef = combineVerseRefStrs(combinedVerseRef.toString(), verseRef.toString());
        } else {
          combinedVerseRef = verseRef;
        }
      }
    }

    if (combinedVerseRef != null) {
      refString = this.i18n.localizeReference(combinedVerseRef);
    } else if (segmentRefs.length > 0) {
      const bookChapter: string = this.i18n.localizeBookChapter(
        insight.textDocId.bookNum,
        insight.textDocId.chapterNum
      );
      refString = `${bookChapter}:[${segmentRefs[0]}]`;
    } else {
      refString = insight.textDocId?.toString() || 'Unknown';
    }

    // Use the pre-calculated sample text parts from processInsightText
    const sampleTextParts = insight.sampleTextParts || { preText: '', insightText: '…', postText: '' };

    return {
      refString,
      sampleTextParts
    };
  }

  /**
   * Process text snippets for children nodes one at a time
   * to prevent freezing the UI while generating text for many insights.
   */
  private processChildrenTextProgressively(node: InsightPanelNode): void {
    if (!node.children || node.children.length === 0) {
      return;
    }

    this.cleanUpCaches();

    let nodesToProcess = node.children
      .filter(child => child.insight && child.isLoading === true)
      .map(child => ({
        node: child,
        insight: child.insight!
      }));

    // Prioritize nodes for better perceived performance
    nodesToProcess = this.prioritizeVisibleNodes(nodesToProcess);

    if (nodesToProcess.length === 0) {
      return;
    }

    if (nodesToProcess.length > this.lynxInsightConfig.panelOptimizationThreshold) {
      this.processLargeNodeSet(nodesToProcess);
      return;
    }

    let currentIndex = 0;
    const parentNode = node;

    const processNextNode = async (): Promise<void> => {
      if (currentIndex >= nodesToProcess.length) {
        this.markNodeProcessingComplete(parentNode);
        return;
      }

      const { node, insight } = nodesToProcess[currentIndex];
      currentIndex++;

      await this.processNodeAsync(node, insight);

      // Schedule next node processing
      requestAnimationFrame(processNextNode);
    };

    requestAnimationFrame(processNextNode);
  }

  /**
   * Clean up cached snippets that are no longer in the tree.
   * This helps prevent memory leaks when the tree changes frequently.
   */
  private cleanUpCaches(): void {
    this.currentInsightIds.clear();
    this.gatherInsightIds(this.treeDataSource);

    // Clean up text snippets cache - keep only insights currently in tree
    for (const [key] of this.textSnippetCache) {
      if (!this.currentInsightIds.has(key)) {
        this.textSnippetCache.delete(key);
      }
    }

    // Clean up loading progress tracking for nodes no longer in tree
    const { visibleNodeDescriptions } = this.collectVisibleItems(this.treeDataSource);
    for (const [nodeDesc] of this.loadingProgressMap) {
      if (!visibleNodeDescriptions.has(nodeDesc)) {
        this.loadingProgressMap.delete(nodeDesc);
        this.nodesWithLargeChildSets.delete(nodeDesc);
      }
    }
  }

  /**
   * Manages memory usage by cleaning up unused caches periodically.
   * This helps prevent memory leaks and excessive memory usage with large datasets.
   */
  private manageMemoryUsage(): void {
    // Always get currently visible items for cache cleanup decisions
    const { visibleTextDocIds, visibleNodeDescriptions } = this.collectVisibleItems(this.treeDataSource);

    // Clean up text document cache if it exceeds the limit
    if (this.textDocCache.size > this.TEXT_DOC_CACHE_MAX_SIZE) {
      // Remove docs not currently visible, keeping most recently used
      const entriesToKeep: Array<[string, Promise<TextDoc>]> = [];
      for (const [key, value] of this.textDocCache) {
        if (visibleTextDocIds.has(key)) {
          entriesToKeep.push([key, value]);
        }
      }

      // If we still have too many, keep only the most recent ones
      if (entriesToKeep.length > this.TEXT_DOC_CACHE_MAX_SIZE) {
        entriesToKeep.splice(0, entriesToKeep.length - this.TEXT_DOC_CACHE_MAX_SIZE);
      }

      this.textDocCache.clear();
      for (const [key, value] of entriesToKeep) {
        this.textDocCache.set(key, value);
      }
    }

    // Prune non-visible nodes from paged loading cache
    if (this.pagedLoadingCache.size > this.LIGHTWEIGHT_CACHE_MAX_SIZE) {
      for (const [cacheKey] of this.pagedLoadingCache) {
        if (!visibleNodeDescriptions.has(cacheKey)) {
          this.pagedLoadingCache.delete(cacheKey);
        }
      }
    }

    // Prune non-visible nodes from visible children cache
    if (this.visibleChildrenCache.size > this.LIGHTWEIGHT_CACHE_MAX_SIZE) {
      // Keep only cache entries for currently visible nodes
      for (const [cacheKey] of this.visibleChildrenCache) {
        if (!visibleNodeDescriptions.has(cacheKey)) {
          this.visibleChildrenCache.delete(cacheKey);
        }
      }
    }

    // Reset cumulative counter after cleanup
    this.numItemsProcessedSinceCleanup = 0;
  }

  /**
   * Processes a single insight to extract appropriate text snippet.
   * Breaks the snippet text into pre, insight, and post parts.
   */
  private processInsightText(insight: LynxInsight, textDoc: TextDoc): LynxInsightWithText {
    const textGoalLength = this.lynxInsightConfig.panelLinkTextGoalLength;

    if (!textDoc.data?.ops?.length) {
      return {
        ...insight,
        sampleTextParts: { preText: '', insightText: '', postText: '' }
      };
    }

    const delta = new Delta(textDoc.data.ops);
    const insightText: string = this.getText(delta, insight.range, 'trim-none');

    // Pad up to the goal length (and at least 10 characters)
    const padding: number = Math.max(10, textGoalLength - insightText.length);

    const prePadIndex: number = insight.range.index - padding;
    const prePadRange: Range = {
      index: Math.max(0, prePadIndex),
      length: prePadIndex < 0 ? padding - insight.range.index : padding
    };
    const preText: string = this.getText(delta, prePadRange, 'trim-word-start');

    const postPadRange: Range = { index: insight.range.index + insight.range.length, length: padding };
    const postText: string = this.getText(delta, postPadRange, 'trim-word-end');

    return {
      ...insight,
      sampleTextParts: { preText, insightText, postText }
    };
  }

  /**
   * Extracts text from a delta at the given range, trimming if specified.
   * @param delta The Delta object to extract text from.
   * @param range Optional range to limit the text extraction.
   * @param trimOption Trim start of range, end of range, or no trim.
   * @returns The extracted text, trimmed according to the specified option.
   * @example
   *   getText(
   *       'The rain in Spain falls mainly on the plain',
   *       { index: 2, length: 11 },  // 'e rain in S'
   *       'trim-word-start'
   *   ) // returns: 'rain in S'
   *
   *   getText(
   *       'The rain in Spain falls mainly on the plain',
   *       { index: 2, length: 11 },  // 'e rain in S'
   *       'trim-word-end'
   *   ) // returns: 'e rain in'
   *
   *   getText(
   *       'A big horse!',
   *       { index: 1, length: 6 },  // ' big h'
   *       trim-none
   *   ) // returns: ' big h'
   */
  private getText(delta: Delta, range: Range, trimOption: 'trim-none' | 'trim-word-start' | 'trim-word-end'): string {
    const text = delta
      .slice(range.index, range.index + range.length)
      .map(op => (typeof op.insert === 'string' ? op.insert : ''))
      .join('');

    switch (trimOption) {
      case 'trim-word-start':
        if (isWhitespace(text[0])) {
          return text.trimStart();
        }

        let startIndex: number = 1;

        // Find the first whitespace character to determine word bound
        while (startIndex < text.length && !isWhitespace(text[startIndex])) {
          startIndex++;
        }

        return text.substring(startIndex).trimStart();
      case 'trim-word-end':
        if (isWhitespace(text[text.length - 1])) {
          return text.trimEnd();
        }

        let endIndex: number = text.length - 2;

        // Find the last whitespace  character to determine word bound
        while (endIndex >= 0 && !isWhitespace(text[endIndex])) {
          endIndex--;
        }

        return text.substring(0, endIndex).trimEnd();
      case 'trim-none':
      default:
        return text;
    }
  }

  /**
   * Loads a TextDoc lazily when needed.
   * This is part of the lazy-loading strategy to only fetch documents when a node is expanded.
   * @param insight The insight that contains the TextDocId.
   * @returns Promise resolving to the loaded TextDoc.
   */
  private loadTextDocLazily(insight: LynxInsight): Promise<TextDoc> {
    const textDocIdStr = insight.textDocId.toString();

    // Check if we're already loading this text doc
    if (this.textDocCache.has(textDocIdStr)) {
      return this.textDocCache.get(textDocIdStr)!;
    }

    // Create and cache the promise for loading the document
    const textDocPromise = this.projectService.getText(insight.textDocId).then(textDoc => {
      // Update segment map for text doc
      if (textDoc.data?.ops != null) {
        this.textDocSegments.set(textDocIdStr, this.editorSegmentService.parseSegments(textDoc.data.ops));
      } else {
        this.textDocSegments.set(textDocIdStr, new Map());
      }

      return textDoc;
    });

    // Cache the promise so multiple requests for the same doc return the same promise
    this.textDocCache.set(textDocIdStr, textDocPromise);

    return textDocPromise;
  }

  /**
   * Sorts nodes to prioritize those currently visible in the viewport.
   * This helps improve perceived performance by loading visible content first.
   * @param nodesToProcess Array of nodes that need processing.
   * @returns Sorted array with visible nodes first.
   */
  private prioritizeVisibleNodes(
    nodesToProcess: Array<{ node: InsightPanelNode; insight: LynxInsight }>
  ): Array<{ node: InsightPanelNode; insight: LynxInsight }> {
    // Create a copy of the array to sort
    const prioritizedNodes = [...nodesToProcess];

    // Sort by position in text (book -> chapter -> range index)
    // This approximates what would be visible at the top of the viewport
    return prioritizedNodes.sort((a, b) => {
      // First by book
      if (a.insight.textDocId.bookNum !== b.insight.textDocId.bookNum) {
        return a.insight.textDocId.bookNum - b.insight.textDocId.bookNum;
      }

      // Then by chapter
      if (a.insight.textDocId.chapterNum !== b.insight.textDocId.chapterNum) {
        return a.insight.textDocId.chapterNum - b.insight.textDocId.chapterNum;
      }

      // Finally by range index within the chapter (position in text)
      return a.insight.range.index - b.insight.range.index;
    });
  }

  /**
   * Groups nodes by chapter for better processing efficiency.
   * This helps reduce TextDoc loading overhead by processing related nodes together.
   */
  private groupNodesByChapter(
    nodes: Array<{ node: InsightPanelNode; insight: LynxInsight }>
  ): Array<Array<{ node: InsightPanelNode; insight: LynxInsight }>> {
    // Group by book and chapter
    const chapterGroups = new Map<string, Array<{ node: InsightPanelNode; insight: LynxInsight }>>();

    for (const nodeItem of nodes) {
      const { insight } = nodeItem;
      const chapterKey = `${insight.textDocId.bookNum}:${insight.textDocId.chapterNum}`;

      if (!chapterGroups.has(chapterKey)) {
        chapterGroups.set(chapterKey, []);
      }

      chapterGroups.get(chapterKey)!.push(nodeItem);
    }

    // Convert to array of groups
    const groupedNodes: Array<Array<{ node: InsightPanelNode; insight: LynxInsight }>> = [];
    chapterGroups.forEach(group => {
      groupedNodes.push(group);
    });

    // Sort groups by book and chapter for consistent processing
    groupedNodes.sort((a, b) => {
      const aInsight = a[0].insight;
      const bInsight = b[0].insight;

      if (aInsight.textDocId.bookNum !== bInsight.textDocId.bookNum) {
        return aInsight.textDocId.bookNum - bInsight.textDocId.bookNum;
      }

      return aInsight.textDocId.chapterNum - bInsight.textDocId.chapterNum;
    });

    return groupedNodes;
  }

  /**
   * Special handling for large node sets.
   * This processes nodes in chunks with forced UI updates between chunks.
   * @param nodesToProcess The array of nodes that need processing.
   */
  private processLargeNodeSet(nodesToProcess: Array<{ node: InsightPanelNode; insight: LynxInsight }>): void {
    // First, prioritize the nodes
    const prioritizedNodes = this.prioritizeVisibleNodes(nodesToProcess);

    // Then, group them by chapter for more efficient TextDoc loading
    const groupedNodeSets = this.groupNodesByChapter(prioritizedNodes);

    // Get 10 nodes from the highest priority chapter for immediate processing
    let initialBatch: Array<{ node: InsightPanelNode; insight: LynxInsight }> = [];

    if (groupedNodeSets.length > 0) {
      const highestPriorityGroup = groupedNodeSets[0];
      const initialBatchSize = Math.min(this.INITIAL_BATCH_SIZE, highestPriorityGroup.length);
      initialBatch = highestPriorityGroup.slice(0, initialBatchSize);

      // Remove the processed nodes from the group
      groupedNodeSets[0] = highestPriorityGroup.slice(initialBatchSize);

      // Remove empty groups
      if (groupedNodeSets[0].length === 0) {
        groupedNodeSets.shift();
      }
    }

    // Process the initial batch immediately for quick feedback
    this.processNodeBatch(initialBatch, true);

    // Flatten the remaining groups for chunk processing
    const remainingNodes: Array<{ node: InsightPanelNode; insight: LynxInsight }> = [];
    groupedNodeSets.forEach(group => remainingNodes.push(...group));

    // Find the parent node for this batch by looking at the first node's parent
    const parentNode = this.findParentNode(nodesToProcess[0]?.node);

    // Split remaining nodes into chunks and schedule them with longer delays to keep UI responsive
    this.scheduleRemainingNodeBatches(remainingNodes, parentNode);
  }

  /**
   * Find the parent node of a given node.
   */
  private findParentNode(node: InsightPanelNode): InsightPanelNode | null {
    if (!node) {
      return null;
    }

    // Get a unique identifier for the target node
    const targetId = node.insight?.id || node.description;
    if (!targetId) {
      return null;
    }

    const findParentRecursive = (nodes: InsightPanelNode[], target: string): InsightPanelNode | null => {
      for (const current of nodes) {
        if (current.children) {
          // Check if any child matches our target by id
          const hasTargetChild = current.children.some(child => (child.insight?.id || child.description) === target);

          if (hasTargetChild) {
            return current;
          }

          // Recursively search in children
          const result = findParentRecursive(current.children, target);
          if (result) {
            return result;
          }
        }
      }

      return null;
    };

    return findParentRecursive(this.treeDataSource, targetId);
  }

  /**
   * Schedule processing of remaining node batches with lower priority.
   * @param remainingNodes The nodes left to process.
   * @param parentNode The parent node containing these child nodes.
   */
  private scheduleRemainingNodeBatches(
    remainingNodes: Array<{ node: InsightPanelNode; insight: LynxInsight }>,
    parentNode: InsightPanelNode | null
  ): void {
    // If no more nodes, we're done
    if (remainingNodes.length === 0) {
      return;
    }

    // Take the next batch
    const batchSize = Math.min(this.MAX_BATCH_SIZE, remainingNodes.length);
    const nextBatch = remainingNodes.splice(0, batchSize);

    // Process this batch
    this.processNodeBatch(nextBatch, false);

    setTimeout(() => {
      // Schedule the next batch if there are more nodes
      if (remainingNodes.length > 0) {
        this.scheduleRemainingNodeBatches(remainingNodes, parentNode);
      } else {
        // Mark the parent node as fully processed once all batches are complete
        if (parentNode) {
          this.markNodeProcessingComplete(parentNode);
        }
      }
    }, 100);
  }

  /**
   * Process a batch of nodes with manual progress tracking.
   * @param batch The batch of nodes to process.
   * @param useSequentialProcessing Whether to use sequential processing (true) or parallel (false).
   */
  private processNodeBatch(
    batch: Array<{ node: InsightPanelNode; insight: LynxInsight }>,
    useSequentialProcessing: boolean
  ): void {
    // For sequential processing, we process nodes one by one for immediate feedback
    if (useSequentialProcessing) {
      this.processNodeBatchSequentially(batch);
    } else {
      this.processNodeBatchParallel(batch);
    }
  }

  /**
   * Updates the progress tracking for a parent node based on completed items.
   */
  private updateProgressForNode(node: InsightPanelNode): void {
    const parentNode = this.findParentNode(node);

    if (parentNode && this.nodesWithLargeChildSets.has(parentNode.description)) {
      const currentProgress = this.loadingProgressMap.get(parentNode.description) || { completed: 0, total: 0 };

      // Update the progress incrementally
      const newCompleted = Math.min(currentProgress.completed + 1, currentProgress.total);
      this.loadingProgressMap.set(parentNode.description, {
        completed: newCompleted,
        total: currentProgress.total
      });

      parentNode.loadingProgressPercent = this.calculateProgress(parentNode);
    }
  }

  /**
   * Process nodes one at a time for responsive UI updates.
   */
  private processNodeBatchSequentially(batch: Array<{ node: InsightPanelNode; insight: LynxInsight }>): void {
    let index = 0;

    const processNext = (): void => {
      if (index >= batch.length) {
        // Trigger cleanup if threshold reached
        this.numItemsProcessedSinceCleanup += batch.length;
        if (this.numItemsProcessedSinceCleanup > this.NUM_ITEMS_CACHE_CLEANUP_THRESHOLD) {
          this.manageMemoryUsage();
        }
        return;
      }

      const { node, insight } = batch[index++];
      this.processNodeAsync(node, insight).then(() => {
        this.updateProgressForNode(node);

        // Schedule the next node
        requestAnimationFrame(processNext);
      });
    };

    // Start the first node
    processNext();
  }

  /**
   * Process nodes in parallel for better performance.
   */
  private processNodeBatchParallel(batch: Array<{ node: InsightPanelNode; insight: LynxInsight }>): void {
    Promise.all(
      batch.map(item =>
        this.processNodeAsync(item.node, item.insight).then(() => {
          this.updateProgressForNode(item.node);
        })
      )
    ).then(() => {
      // Trigger cleanup if threshold reached
      this.numItemsProcessedSinceCleanup += batch.length;
      if (this.numItemsProcessedSinceCleanup > this.NUM_ITEMS_CACHE_CLEANUP_THRESHOLD) {
        this.manageMemoryUsage();
      }
    });
  }

  private async processNodeAsync(node: InsightPanelNode, insight: LynxInsight): Promise<void> {
    try {
      // Check if we already have a cached insight description (snippet)
      if (this.textSnippetCache.has(insight.id)) {
        node.insightDescription = this.textSnippetCache.get(insight.id)!;
        node.isLoading = false;
        return;
      }

      // Track this insight id
      this.currentInsightIds.add(insight.id);

      // Get and process the text document
      const textDoc = await this.loadTextDocLazily(insight);
      const insightWithText = this.processInsightText(insight, textDoc);
      const insightDescription = this.createInsightDescription(insightWithText);

      // Cache the insight description and update the UI
      this.textSnippetCache.set(insight.id, insightDescription);
      node.insightDescription = insightDescription;
      node.isLoading = false;
    } catch {
      // Set fallback description and remove loading state
      const fallbackDescription: InsightDescription = {
        refString: insight.textDocId?.toString() || 'Unknown',
        sampleTextParts: { preText: '', insightText: 'Error loading', postText: '' }
      };
      node.insightDescription = fallbackDescription;
      node.isLoading = false;
    }
  }

  private calculateProgress(node: InsightPanelNode): number {
    // If all children are already processed, assume 100% completion.
    // This check prevents showing the loading indicator when reopening already loaded nodes.
    if (node.children && node.children.length > 0) {
      const allChildrenProcessed = node.children.every(
        child => !child.isLoading && (child.insight ? this.textSnippetCache.has(child.insight.id) : true)
      );

      if (allChildrenProcessed) {
        // Ensure progress map is updated to reflect 100% completion
        if (this.nodesWithLargeChildSets.has(node.description)) {
          const totalChildren = node.children.length;
          this.loadingProgressMap.set(node.description, {
            completed: totalChildren,
            total: totalChildren
          });
          return 100;
        }
      }
    }

    const progress = this.loadingProgressMap.get(node.description);
    if (!progress || progress.total === 0) {
      return 0;
    }

    return Math.round((progress.completed / progress.total) * 100);
  }

  /**
   * Recursively gather all insight ids from tree nodes into currentInsightIds set.
   */
  private gatherInsightIds(nodes: InsightPanelNode[]): void {
    for (const node of nodes) {
      if (node.insight) {
        this.currentInsightIds.add(node.insight.id);
      }
      if (node.children) {
        this.gatherInsightIds(node.children);
      }
    }
  }

  /**
   * Collects visible text document ids and node descriptions from the tree.
   * @param nodes The nodes to traverse
   * @returns Object containing sets of visible text doc IDs and node descriptions
   */
  private collectVisibleItems(nodes: InsightPanelNode[]): {
    visibleTextDocIds: Set<string>;
    visibleNodeDescriptions: Set<string>;
  } {
    const visibleTextDocIds = new Set<string>();
    const visibleNodeDescriptions = new Set<string>();

    const traverse = (nodeList: InsightPanelNode[]): void => {
      for (const node of nodeList) {
        if (node.insight) {
          visibleTextDocIds.add(node.insight.textDocId.toString());
        }

        if (node.description) {
          visibleNodeDescriptions.add(node.description);
        }

        // Only include children of expanded nodes
        if (node.children && this.expandCollapseState.get(node.description)) {
          traverse(node.children);
        }
      }
    };

    traverse(nodes);
    return { visibleTextDocIds, visibleNodeDescriptions };
  }

  /**
   * Mark node's processing as complete so loading indicator isn't shown when reopening a previously loaded group.
   */
  private markNodeProcessingComplete(node: InsightPanelNode): void {
    this.nodesWithLargeChildSets.delete(node.description);
    this.loadingProgressMap.delete(node.description);
  }

  /**
   * Calculate and set progress-related properties directly on a specific node.
   */
  private calculateNodeProgressProperties(node: InsightPanelNode): void {
    node.loadingProgressPercent = 0;
    node.remainingChildCount = 0;

    if (!this.isLargeNodeSet(node)) {
      return;
    }

    node.loadingProgressPercent = this.calculateProgress(node);

    // Calculate remaining child count for paged loading
    if (node.children) {
      const defaultCount = this.lynxInsightConfig.panelOptimizationThreshold;
      const currentCount = this.lastVisibleCountMap.get(node.description) || defaultCount;
      node.remainingChildCount = Math.max(0, node.children.length - currentCount);
    }
  }
}
