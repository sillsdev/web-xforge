import { FlatTreeControl } from '@angular/cdk/tree';
import { Component, DestroyRef, Inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree';
import { Router } from '@angular/router';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { groupBy } from 'lodash-es';
import Quill, { DeltaStatic, RangeStatic } from 'quill';
import { combineLatest, map, switchMap, tap } from 'rxjs';
import { ActivatedBookChapterService, RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { TextDocId } from '../../../../../core/models/text-doc';
import { SFProjectService } from '../../../../../core/sf-project.service';
import { rangeComparer } from '../../../../../shared/text/quill-scripture';
import { combineVerseRefStrs, getVerseRefFromSegmentRef } from '../../../../../shared/utils';
import { EditorSegmentService } from '../base-services/editor-segment.service';
import {
  EDITOR_INSIGHT_DEFAULTS,
  LynxInsight,
  LynxInsightConfig,
  LynxInsightRange,
  LynxInsightSortOrder,
  LynxInsightType,
  LynxInsightTypes
} from '../lynx-insight';
import { LynxInsightStateService } from '../lynx-insight-state.service';

interface InsightPanelNode {
  name: string;
  type: LynxInsightType;
  children?: InsightPanelNode[];
  insight?: LynxInsight;
  range: RangeStatic;
  count?: number;
}

interface InsightPanelFlatNode {
  expandable: boolean;
  name: string;
  type: string;
  level: number;
  insight?: LynxInsight;
  count?: number;
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
      this.transformer,
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

  /** Map of TextDocId string -> Quill instance */
  private quillDocs = new Map<string, Quill>();

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
      // TODO: Should updateSegmentMaps be in a service?
      this.editorInsightState.filteredInsights$.pipe(
        // Call updateSegmentMaps, wait for it to complete, then emit insights
        switchMap(insights => this.updateSegmentMaps(insights).then(() => insights))
      ),
      this.editorInsightState.orderBy$.pipe(tap(val => (this.orderBy = val)))
    ])
      .pipe(
        takeUntilDestroyed(this.destroyRef),

        map(([insights, orderBy]) => this.flatten(insights, orderBy))
      )
      .subscribe(flattenedInsightNodes => {
        this.dataSource.data = flattenedInsightNodes;
        this.restoreExpandCollapseState();
      });

    this.activatedBookChapterService.activatedBookChapter$
      .pipe(takeUntilDestroyed(this.destroyRef))
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
        this.editorInsightState.updateDisplayState(insight.id, {
          promptActive: false,
          actionMenuActive: true
        });

        // TODO: scroll to selected insight
      });

      // this.editor?.setSelection(node.insight.range.index, 0, 'api'); // Scroll to range
      // if (!this.navInsight(node.insight)) {
      //   // this.editor?.setSelection(node.insight.range.index, 0, 'api'); // Scroll to range
      //   this.editorInsightState.updateDisplayState(node.insight.id, {
      //     promptActive: false,
      //     actionMenuActive: true
      //   });
      // }
    }
  }

  private transformer(node: InsightPanelNode, level: number): InsightPanelFlatNode {
    return {
      expandable: !!node.children && node.children.length > 0,
      name: node.name,
      type: node.type,
      level: level,
      insight: node.insight,
      count: node.count
    };
  }

  // TODO: move to service?
  private flatten(insights: LynxInsight[], orderBy: LynxInsightSortOrder): InsightPanelNode[] {
    const flattenedInsightNodes: InsightPanelNode[] = [];

    for (const [code, byCode] of Object.entries(groupBy(insights, 'code'))) {
      const codeNode: InsightPanelNode = {
        name: code,
        type: byCode[0].type,
        children: byCode.map(insight => ({
          name: this.getLinkText(insight),
          type: insight.type,
          insight,
          range: insight.range
        })),
        count: byCode.length,
        range: byCode[0].range
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
      if (node.level === 0 && this.expandCollapseState.has(node.name)) {
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

    if (insight.book !== activeBookNum || insight.chapter !== this.activeBookChapter.chapter) {
      const insightBookId: string = Canon.bookNumberToId(insight.book);

      // Navigate to book/chapter with insight id as query params
      await this.router.navigate(
        ['/projects', this.activatedProject.projectId, 'translate', insightBookId, insight.chapter],
        {
          queryParams: { [this.lynxInsightConfig.queryParamName]: insight.id }
        }
      );

      return true;
    }

    return false;
  }

  private async updateSegmentMaps(insights: LynxInsight[]): Promise<void> {
    if (this.activatedProject.projectId != null) {
      const textRequests: Promise<void>[] = [];
      const textDocIdStrings: Set<string> = new Set<string>();

      for (const insight of insights) {
        const textDocId = new TextDocId(this.activatedProject.projectId!, insight.book, insight.chapter);
        const textDocIdStr: string = textDocId.toString();

        if (!textDocIdStrings.has(textDocIdStr)) {
          textDocIdStrings.add(textDocIdStr);
          textRequests.push(
            this.projectService.getText(textDocId).then(textDoc => {
              // Update segment map for text doc
              this.textDocSegments.set(
                textDocIdStr,
                textDoc.data?.ops != null ? this.editorSegmentService.parseSegments(textDoc.data.ops) : new Map()
              );

              // Create and cache a Quill instance to get text sample from delta
              const quill: Quill = new Quill(document.createElement('div'));
              const delta: DeltaStatic | undefined = textDoc.data as DeltaStatic;

              if (delta != null) {
                quill.setContents(delta, 'api');
                this.quillDocs.set(textDocIdStr, quill);
              }
            })
          );
        }
      }

      await Promise.all(textRequests);
    }
  }

  private getLinkText(insight: LynxInsight): string {
    let textDocIdStr: string = '';

    if (this.activatedProject.projectId != null) {
      const textDocId = new TextDocId(this.activatedProject.projectId, insight.book, insight.chapter);
      textDocIdStr = textDocId.toString();
    }

    const editorSegments = this.textDocSegments.get(textDocIdStr);

    if (editorSegments == null) {
      return '...'; // TODO: better default text
    }

    const linkItems = [];
    const segmentRefs: string[] = this.editorSegmentService.getSegmentRefs(insight.range, editorSegments);
    let combinedVerseRef: VerseRef | undefined;

    for (const segmentRef of segmentRefs) {
      const verseRef: VerseRef | undefined = getVerseRefFromSegmentRef(insight.book, segmentRef);

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

        const bookChapter: string = this.i18n.localizeBookChapter(insight.book, insight.chapter);

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
  private getTextSample(insight: LynxInsight, segmentRef: string, includeRef: boolean): string {
    const textDocId = new TextDocId(this.activatedProject.projectId!, insight.book, insight.chapter);
    const textDocIdStr: string = textDocId.toString();

    // Get the cached Quill instance for the insight's book/chapter
    const quill: Quill | undefined = this.quillDocs.get(textDocIdStr);

    if (quill == null) {
      return segmentRef;
    }

    const maxLength: number = this.lynxInsightConfig.panelLinkTextMaxLength;
    const optionalRefStr: string = includeRef ? `[${segmentRef}] ` : '';
    const text: string = quill.getText(insight.range.index, Math.min(maxLength, insight.range.length));

    // TODO: should '...' be dependent on verse boundaries?
    return `${optionalRefStr}— "...${text}..."`;
  }
}
