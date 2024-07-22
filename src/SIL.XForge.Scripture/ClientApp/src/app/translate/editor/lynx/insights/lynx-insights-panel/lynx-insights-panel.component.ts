import { FlatTreeControl } from '@angular/cdk/tree';
import { Component, DestroyRef, Input, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree';
import { VerseRef } from '@sillsdev/scripture';
import { groupBy } from 'lodash-es';
import Quill, { RangeStatic } from 'quill';
import { combineLatest, map, tap } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { rangeComparer } from '../../../../../shared/text/quill-scripture';
import { combineVerseRefStrs, getVerseRefFromSegmentRef } from '../../../../../shared/utils';
import { LynxInsight, LynxInsightSortOrder, LynxInsightType, LynxInsightTypes } from '../lynx-insight';
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
  @Input() editor?: Quill;
  @Input() editorSegments?: ReadonlyMap<string, RangeStatic> | null;

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

  readonly linkTextMaxLength = 30; // TODO: Make this configurable

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly editorInsightState: LynxInsightStateService,
    readonly i18n: I18nService
  ) {}

  ngOnInit(): void {
    combineLatest([
      this.editorInsightState.insights$,
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

      // Show action menu overlay in editor
      this.editor?.setSelection(node.insight.range.index, 0, 'api'); // Scroll to range
      this.editorInsightState.updateDisplayState(node.insight.id, { promptActiveFull: false, actionMenuActive: true });
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

  /**
   * Get all segment references that intersect the given range.
   * TODO: move to service?
   */
  getSegmentRefs(range: RangeStatic, segments: ReadonlyMap<string, RangeStatic>): string[] {
    const segmentRefs: string[] = [];

    if (range != null) {
      const rangeEnd = range.index + range.length;

      for (const [ref, segmentRange] of segments) {
        const segEnd = segmentRange.index + segmentRange.length;

        if (range.index < segEnd) {
          if (rangeEnd > segmentRange.index) {
            segmentRefs.push(ref);
          }

          if (rangeEnd <= segEnd) {
            break;
          }
        }
      }
    }

    // console.log('segmentRefs', segmentRefs);
    return segmentRefs;
  }

  private getLinkText(insight: LynxInsight): string {
    if (this.editorSegments == null) {
      return '...'; // TODO: better default text
    }

    const linkItems = [];
    const segmentRefs: string[] = this.getSegmentRefs(insight.range, this.editorSegments);
    let combinedVerseRef: VerseRef | undefined;

    for (let i = 0; i < segmentRefs.length; i++) {
      const ref = segmentRefs[i];
      const verseRef: VerseRef | undefined = getVerseRefFromSegmentRef(insight.book, ref);

      if (verseRef != null) {
        if (combinedVerseRef != null) {
          combinedVerseRef = combineVerseRefStrs(combinedVerseRef.toString(), verseRef.toString());
        } else {
          combinedVerseRef = verseRef;
        }
      } else {
        if (combinedVerseRef != null) {
          linkItems.push(this.i18n.localizeReference(combinedVerseRef));
          combinedVerseRef = undefined;
        }

        linkItems.push(this.getTextSample(insight, ref));
      }
    }

    if (combinedVerseRef != null) {
      linkItems.push(this.i18n.localizeReference(combinedVerseRef));
    }

    return linkItems.join(', ');
  }

  /**
   * Get a window of text from the segmentRef that contains insight range.
   */
  private getTextSample(insight: LynxInsight, segmentRef: string, maxLength?: number): string {
    if (this.editor == null) {
      return segmentRef;
    }

    maxLength = maxLength ?? this.linkTextMaxLength;
    const text: string = this.editor?.getText(insight.range.index, Math.min(maxLength, insight.range.length));

    return `[${segmentRef}] "...${text}..."`;
  }
}
