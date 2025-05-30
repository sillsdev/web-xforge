import { AfterViewInit, Component, DestroyRef, Inject, ViewChild } from '@angular/core';
import { MatTree } from '@angular/material/tree';
import { Router } from '@angular/router';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { groupBy } from 'lodash-es';
import { Delta, Range } from 'quill';
import {
  LynxInsightSortOrder,
  LynxInsightType,
  LynxInsightTypes
} from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { combineLatest, map, switchMap, tap } from 'rxjs';
import { ActivatedBookChapterService, RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { TextDoc } from '../../../../../core/models/text-doc';
import { SFProjectService } from '../../../../../core/sf-project.service';
import { getText, rangeComparer } from '../../../../../shared/text/quill-util';
import { combineVerseRefStrs, getVerseRefFromSegmentRef } from '../../../../../shared/utils';
import { EditorSegmentService } from '../base-services/editor-segment.service';
import { EDITOR_INSIGHT_DEFAULTS, LynxInsight, LynxInsightConfig, LynxInsightRange } from '../lynx-insight';
import { LynxInsightStateService } from '../lynx-insight-state.service';

interface InsightPanelNode {
  description: string;
  type: LynxInsightType;
  children?: InsightPanelNode[];
  insight?: LynxInsight;
  range: Range;
  count?: number;
  isDismissed?: boolean;
}

interface LynxInsightWithText extends LynxInsight {
  rangeText: string;
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

  /** Map of TextDocId string -> (Map of segment ref -> segment range) */
  private textDocSegments = new Map<string, Map<string, LynxInsightRange>>();

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly editorInsightState: LynxInsightStateService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly activatedBookChapterService: ActivatedBookChapterService,
    private readonly editorSegmentService: EditorSegmentService,
    private readonly projectService: SFProjectService,
    private readonly router: Router,
    readonly i18n: I18nService,
    @Inject(EDITOR_INSIGHT_DEFAULTS) private readonly lynxInsightConfig: LynxInsightConfig
  ) {}

  ngAfterViewInit(): void {
    combineLatest([
      this.editorInsightState.filteredInsights$.pipe(switchMap(insights => this.addRangeText(insights))),
      this.editorInsightState.orderBy$.pipe(tap(val => (this.orderBy = val))),
      this.editorInsightState.dismissedInsightIds$
    ])
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        map(([insights, orderBy, dismissedIds]) => this.buildTreeNodes(insights, orderBy, dismissedIds))
      )
      .subscribe(treeNodes => {
        this.treeDataSource = treeNodes;
        this.restoreExpandCollapseState();
      });

    this.activatedBookChapterService.activatedBookChapter$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(bookChapter => {
        this.activeBookChapter = bookChapter;
      });
  }

  // Passed to mat-tree in the template
  getChildrenAccessor(node: InsightPanelNode): InsightPanelNode[] {
    return node.children ?? [];
  }

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

  onNodeExpansionChange(node: InsightPanelNode, isExpanded: boolean): void {
    if (this.hasChildren(node)) {
      this.expandCollapseState.set(node.description, isExpanded);
    }
  }

  restoreDismissedInsight(insight: LynxInsight): void {
    this.editorInsightState.restoreDismissedInsights([insight.id]);
  }

  private hasChildren(node: InsightPanelNode): boolean {
    return node.children != null && node.children.length > 0;
  }

  /**
   * Groups insights by description and prepares them as hierarchical InsightPanelNode.
   */
  private buildTreeNodes(
    insights: LynxInsightWithText[],
    orderBy: LynxInsightSortOrder,
    dismissedIds: string[]
  ): InsightPanelNode[] {
    const groupedNodes: InsightPanelNode[] = [];
    const dismissedIdSet: Set<string> = new Set(dismissedIds);

    for (const [_desc, byDescGroup] of Object.entries(groupBy(insights, 'description'))) {
      let descGroupNodeContainsAllDismissed = true;
      const groupRepresentative: LynxInsightWithText = byDescGroup[0];

      const children: InsightPanelNode[] = byDescGroup.map(insight => {
        const isDismissed: boolean = dismissedIdSet.has(insight.id);
        if (!isDismissed) {
          descGroupNodeContainsAllDismissed = false;
        }

        return {
          description: this.getLinkText(insight),
          type: insight.type,
          insight,
          range: insight.range,
          isDismissed
        };
      });

      const descGroupNode: InsightPanelNode = {
        description: groupRepresentative.description,
        type: groupRepresentative.type,
        children,
        count: byDescGroup.length,
        range: groupRepresentative.range,
        isDismissed: descGroupNodeContainsAllDismissed
      };

      groupedNodes.push(descGroupNode);
    }

    this.sortNodes(groupedNodes, orderBy);

    return groupedNodes;
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
        } else {
          this.tree.collapse(node);
        }
      }
    }
  }

  private sortNodes(nodes: InsightPanelNode[], orderBy: LynxInsightSortOrder): InsightPanelNode[] {
    switch (orderBy) {
      case 'severity':
        // Assume types are ordered from least to most severe
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
   * Adds text samples to insights based on their ranges.
   * Ensures text sample meets length requirements and respects word boundaries.
   */
  private addRangeText(insights: LynxInsight[]): Promise<LynxInsightWithText[]> {
    if (!this.activatedProject.projectId || insights.length === 0) {
      return Promise.resolve([]);
    }

    // Cache TextDocs by id to avoid redundant fetches
    const textDocMap = new Map<string, Promise<TextDoc>>();

    // Process each insight to add text
    const insightsWithText: Promise<LynxInsightWithText>[] = insights.map(insight => {
      const textDocIdStr: string = insight.textDocId.toString();

      // Fetch and cache TextDoc if not already cached
      if (!textDocMap.has(textDocIdStr)) {
        textDocMap.set(
          textDocIdStr,
          this.projectService.getText(insight.textDocId).then(textDoc => {
            // Update segment map for text doc
            this.textDocSegments.set(
              textDocIdStr,
              textDoc.data?.ops != null ? this.editorSegmentService.parseSegments(textDoc.data.ops) : new Map()
            );
            return textDoc;
          })
        );
      }

      // Process text for this insight
      return textDocMap.get(textDocIdStr)!.then(textDoc => this.processInsightText(insight, textDoc));
    });

    return Promise.all(insightsWithText);
  }

  /**
   * Processes a single insight to extract appropriate text.
   */
  private processInsightText(insight: LynxInsight, textDoc: TextDoc): LynxInsightWithText {
    const textGoalLength = this.lynxInsightConfig.panelLinkTextGoalLength;

    if (!textDoc.data?.ops?.length) {
      return { ...insight, rangeText: '' };
    }

    const delta = new Delta(textDoc.data.ops);
    const originalRange: LynxInsightRange = insight.range;

    // Get original insight text
    const originalText: string = getText(delta, originalRange);

    // If original text is long enough, use it directly
    if (originalText.length >= textGoalLength * 0.7) {
      return { ...insight, rangeText: originalText };
    }

    // Get expanded text with padding
    const padding: number = Math.floor((textGoalLength - originalText.length) / 2);
    const expandedStart: number = Math.max(0, originalRange.index - padding);
    const expandedEnd: number = Math.min(delta.length(), originalRange.index + originalRange.length + padding);
    const expandedRange: LynxInsightRange = { index: expandedStart, length: expandedEnd - expandedStart };

    const expandedText: string = getText(delta, expandedRange);

    const firstSpace = expandedText.indexOf(' ');
    const lastSpace = expandedText.lastIndexOf(' ');

    // Trim back toward original text stopping at first space (on both ends)
    const adjustedStart: number =
      firstSpace >= 0 ? Math.min(originalRange.index, expandedStart + firstSpace) : expandedStart;
    const adjustedEnd: number = Math.max(
      originalRange.index + originalRange.length,
      lastSpace >= 0 ? expandedStart + lastSpace : expandedEnd
    );

    const adjustedExpandedText: string = getText(delta, { index: adjustedStart, length: adjustedEnd - adjustedStart });

    return { ...insight, rangeText: adjustedExpandedText };
  }

  /**
   * Get the link text for an insight.  The format is as follows:
   * - If the range is within a single verse, the link text is the verse reference followed by a text sample.
   * - If the range spans multiple verses, the link text is a list of verse references followed by a text sample.
   * - Non-verse segments are included as [segment_ref] in the place of verse references.
   */
  private getLinkText(insight: LynxInsightWithText): string {
    let textDocIdStr: string = '';

    if (this.activatedProject.projectId != null) {
      textDocIdStr = insight.textDocId.toString();
    }

    const editorSegments = this.textDocSegments.get(textDocIdStr);

    if (editorSegments == null) {
      return '…'; // '\u2026'
    }

    const linkItems: string[] = [];
    const segmentRefs: string[] = this.editorSegmentService.getSegmentRefs(insight.range, editorSegments);
    let combinedVerseRef: VerseRef | undefined;

    for (const segmentRef of segmentRefs) {
      const verseRef: VerseRef | undefined = getVerseRefFromSegmentRef(insight.textDocId.bookNum, segmentRef);

      if (verseRef != null) {
        if (combinedVerseRef != null) {
          combinedVerseRef = combineVerseRefStrs(combinedVerseRef.toString(), verseRef.toString());
        } else {
          combinedVerseRef = verseRef;
        }
      } else {
        if (combinedVerseRef != null) {
          linkItems.push(
            `${this.i18n.localizeReference(combinedVerseRef)} ${this.getTextSample(insight, combinedVerseRef.toString(), false)}`
          );
          combinedVerseRef = undefined;
        }

        const bookChapter: string = this.i18n.localizeBookChapter(
          insight.textDocId.bookNum,
          insight.textDocId.chapterNum
        );

        linkItems.push(`${bookChapter}:${this.getTextSample(insight, segmentRef, true)}`);
      }
    }

    if (combinedVerseRef != null) {
      linkItems.push(
        `${this.i18n.localizeReference(combinedVerseRef)} ${this.getTextSample(insight, combinedVerseRef.toString(), false)}`
      );
    }

    return linkItems.join(', ');
  }

  /**
   * Get a window of text from the segmentRef that contains insight range.
   */
  private getTextSample(insight: LynxInsightWithText, segmentRef: string, includeRef: boolean): string {
    if (insight.rangeText == null) {
      return segmentRef;
    }

    const prefix: string = includeRef ? `[${segmentRef}] ` : '';
    return `${prefix}— "${insight.rangeText}"`;
  }
}
