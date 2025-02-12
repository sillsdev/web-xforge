import { Component, DestroyRef, Input, OnDestroy, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isEqual } from 'lodash-es';
import { combineLatest, filter, fromEvent, merge, switchMap, tap } from 'rxjs';
import { map, pairwise } from 'rxjs/operators';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxableEditor } from '../lynx-editor';
import { LynxInsight, LynxInsightDisplayState, LynxInsightRange } from '../lynx-insight';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { LynxInsightBlot } from '../quill-services/blots/lynx-insight-blot';

@Component({
  selector: 'app-lynx-insight-editor-objects',
  templateUrl: './lynx-insight-editor-objects.component.html',
  styleUrl: './lynx-insight-editor-objects.component.scss'
})
export class LynxInsightEditorObjectsComponent implements OnInit, OnDestroy {
  readonly insightSelector = `.${LynxInsightBlot.superClassName}`;

  private readonly dataIdProp = LynxInsightBlot.idDatasetPropName;

  @Input() editor?: LynxableEditor;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly insightState: LynxInsightStateService,
    private readonly insightRenderService: InsightRenderService,
    private readonly editorReadyService: EditorReadyService,
    private readonly overlayService: LynxInsightOverlayService
  ) {}

  ngOnInit(): void {
    if (this.editor == null) {
      return;
    }

    combineLatest([
      fromEvent(this.editor, 'selection-change').pipe(map(([range]) => range)),
      this.insightState.filteredChapterInsights$
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([range, insights]) => this.handleSelectionChange(range, insights));

    combineLatest([fromEvent(this.editor.root, 'mouseover'), this.insightState.filteredChapterInsights$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([event]) => this.handleMouseOver(event.target as HTMLElement));

    this.editorReadyService
      .listenEditorReadyState(this.editor)
      .pipe(
        filter(ready => ready),
        tap(() => {
          // When editor becomes ready, close all action overlays,
          // including those for insights from other books/chapters
          this.overlayService.close();
        }),
        switchMap(() =>
          merge(
            // Render blots when insights change
            this.insightState.filteredChapterInsights$.pipe(
              tap(insights => {
                this.insightRenderService.render(insights, this.editor!);
              })
            ),
            // Check display state to render action overlay or cursor active state
            this.insightState.displayState$.pipe(
              pairwise(),
              tap(([prev, curr]) => {
                const activeInsightsChanged: boolean = !isEqual(prev.activeInsightIds, curr.activeInsightIds);
                const actionOverlayActiveChanged: boolean = prev.actionOverlayActive !== curr.actionOverlayActive;
                const cursorActiveInsightIdsChanged: boolean = !isEqual(
                  prev.cursorActiveInsightIds,
                  curr.cursorActiveInsightIds
                );

                if (activeInsightsChanged || actionOverlayActiveChanged) {
                  const activeInsights = curr.activeInsightIds
                    .map(id => this.insightState.getInsight(id))
                    .filter(i => i != null);
                  this.insightRenderService.renderActionOverlay(
                    activeInsights,
                    this.editor!,
                    !!curr.actionOverlayActive
                  );
                }

                if (cursorActiveInsightIdsChanged) {
                  this.insightRenderService.renderCursorActiveState(curr.cursorActiveInsightIds, this.editor!);
                }
              })
            )
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    if (this.editor != null) {
      this.insightRenderService.removeAllInsightFormatting(this.editor);
    }
  }

  private handleSelectionChange(selection: LynxInsightRange | undefined, insights: LynxInsight[]): void {
    console.log('SelectionChange', selection, insights);
    const ids = insights
      .filter(insight => selection != null && overlaps(insight.range, selection))
      .map(insight => insight.id);

    let displayStateChanges: Partial<LynxInsightDisplayState> = {
      activeInsightIds: ids,
      promptActive: ids.length > 0,
      actionOverlayActive: false
    };

    this.insightState.updateDisplayState(displayStateChanges);
  }

  private handleMouseOver(target: HTMLElement): void {
    // Clear any 'hover-insight' classes if the target is not an insight element
    if (!target.matches('.' + LynxInsightBlot.superClassName)) {
      this.insightState.updateDisplayState({ cursorActiveInsightIds: [] });
      return;
    }

    console.log('MouseOver', target);
    const ids: string[] = this.getInsightIds(target);

    // Set 'hover-insight' class on the affected insight elements (clear others)
    this.insightState.updateDisplayState({ cursorActiveInsightIds: ids });
  }

  /**
   * Get all insight ids from the element and its parents that match the lynx insight selector.
   */
  private getInsightIds(el: HTMLElement): string[] {
    const ids: string[] = [];

    if (el.matches(this.insightSelector)) {
      let currentEl: HTMLElement | null | undefined = el;

      while (currentEl != null) {
        const id = currentEl.dataset[this.dataIdProp];

        if (id != null) {
          ids.push(id);
        }

        currentEl = currentEl.parentElement?.closest(this.insightSelector);
      }
    }

    return ids;
  }
}

function overlaps(x: LynxInsightRange, y: LynxInsightRange): boolean {
  return x.index <= y.index + y.length && y.index <= x.index + x.length;
}
