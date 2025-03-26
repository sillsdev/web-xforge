import { FlatTreeControl } from '@angular/cdk/tree';
import { Component, DestroyRef, Inject, OnInit } from '@angular/core';
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree';
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
  name: string;
  description: string;
  type: LynxInsightType;
  children?: InsightPanelNode[];
  insight?: LynxInsight;
  range: Range;
  count?: number;
  isDismissed?: boolean;
}

interface InsightPanelFlatNode {
  expandable: boolean;
  name: string;
  description: string;
  type: string;
  level: number;
  insight?: LynxInsight;
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
export class LynxInsightsPanelComponent implements OnInit {
  // @Output() insightSelect = new EventEmitter<LynxInsight>();

  treeControl = new FlatTreeControl<InsightPanelFlatNode>(
    node => node.level,
    node => node.expandable
  );

  dataSource = new MatTreeFlatDataSource(
    this.treeControl,
    new MatTreeFlattener(
      this.flattenTransformer,
      node => node.level,
      node => node.expandable,
      node => node.children
    )
  );

  // Preserve expand/collapse state when tree reloads due to insights$ update: code -> expanded
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

  ngOnInit(): void {
    combineLatest([
      this.editorInsightState.filteredInsights$.pipe(switchMap(insights => this.addRangeText(insights))),
      this.editorInsightState.orderBy$.pipe(tap(val => (this.orderBy = val))),
      this.editorInsightState.dismissedInsightIds$
    ])
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        map(([insights, orderBy, dismissedIds]) => this.flattenGrouping(insights, orderBy, dismissedIds))
      )
      .subscribe(flattenedInsightNodes => {
        this.dataSource.data = flattenedInsightNodes;
        this.restoreExpandCollapseState();
      });

    this.activatedBookChapterService.activatedBookChapter$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(bookChapter => {
        this.activeBookChapter = bookChapter;
      });
  }

  hasChild(index: number, node: InsightPanelFlatNode): boolean {
    return node.expandable;
  }

  onNodeClick(node: InsightPanelFlatNode, event: MouseEvent): void {
    if (node.expandable) {
      // Store expand/collapse state
      this.expandCollapseState.set(node.name, this.treeControl.isExpanded(node));
    } else if (node.insight != null) {
      // Stop bubble to user event service, which will clear display state
      event.stopPropagation();

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

  restoreDismissedInsight(insight: LynxInsight): void {
    console.log('Restore', insight.id);
    this.editorInsightState.restoreDismissedInsights([insight.id]);
  }

  /**
   * Transforms InsightPanelNode to InsightPanelFlatNode.
   */
  private flattenTransformer(node: InsightPanelNode, level: number): InsightPanelFlatNode {
    return {
      expandable: !!node.children && node.children.length > 0,
      name: node.name,
      description: node.description,
      type: node.type,
      level: level,
      insight: node.insight,
      count: node.count,
      isDismissed: node.isDismissed
    };
  }

  // TODO: move to service?
  /**
   * Groups insights by code and flattens them into InsightPanelNode.
   */
  private flattenGrouping(
    insights: LynxInsightWithText[],
    orderBy: LynxInsightSortOrder,
    dismissedIds: string[]
  ): InsightPanelNode[] {
    const flattenedInsightNodes: InsightPanelNode[] = [];
    const dismissedIdSet: Set<string> = new Set(dismissedIds);

    for (const [code, byCode] of Object.entries(groupBy(insights, 'code'))) {
      let codeNodeContainsAllDismissed = true;

      const children: InsightPanelNode[] = byCode.map(insight => {
        const isDismissed: boolean = dismissedIdSet.has(insight.id);
        if (!isDismissed) {
          codeNodeContainsAllDismissed = false;
        }

        return {
          name: this.getLinkText(insight),
          description: insight.description,
          type: insight.type,
          insight,
          range: insight.range,
          isDismissed
        };
      });

      const codeNode: InsightPanelNode = {
        name: code,
        description: byCode[0].description,
        type: byCode[0].type,
        children,
        count: byCode.length,
        range: byCode[0].range,
        isDismissed: codeNodeContainsAllDismissed
      };

      flattenedInsightNodes.push(codeNode);
    }

    this.sortNodes(flattenedInsightNodes, orderBy);

    return flattenedInsightNodes;
  }

  private restoreExpandCollapseState(): void {
    if (this.expandCollapseState.size === 0) {
      return;
    }

    for (const node of this.treeControl.dataNodes) {
      if (node.level === 0 && this.expandCollapseState.get(node.name)) {
        this.treeControl.expand(node);
      } else {
        this.treeControl.collapse(node);
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
    const maxLength = this.lynxInsightConfig.panelLinkTextMaxLength;

    if (!textDoc.data?.ops?.length) {
      return { ...insight, rangeText: '' };
    }

    const delta = new Delta(textDoc.data.ops);
    const originalRange: LynxInsightRange = insight.range;

    // Get original insight text
    const originalText: string = getText(delta, originalRange);

    // If original text is long enough, use it directly
    if (originalText.length >= maxLength * 0.7) {
      return { ...insight, rangeText: originalText };
    }

    // Get expanded text with padding
    const padding: number = Math.floor((maxLength - originalText.length) / 2);
    const expandedStart: number = Math.max(0, originalRange.index - padding);
    const expandedEnd: number = Math.min(delta.length(), originalRange.index + originalRange.length + padding);
    const expandedRange: LynxInsightRange = { index: expandedStart, length: expandedEnd - expandedStart };

    const expandedText: string = getText(delta, expandedRange);

    // Trim back toward original text stopping at first space (on both ends)
    const adjustedStart: number = Math.min(originalRange.index, expandedStart + expandedText.indexOf(' '));
    const adjustedEnd: number = Math.max(
      originalRange.index + originalRange.length,
      expandedStart + expandedText.lastIndexOf(' ')
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
      return '...'; // TODO: better default text
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
