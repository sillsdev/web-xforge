import { Component, DestroyRef, Input, OnDestroy, OnInit } from '@angular/core';
import { isEqual } from 'lodash-es';
import { Delta } from 'quill';
import { combineLatest, filter, fromEvent, merge, switchMap, tap } from 'rxjs';
import { map, pairwise } from 'rxjs/operators';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxableEditor } from '../lynx-editor';
import { LynxInsight, LynxInsightDisplayState, LynxInsightRange } from '../lynx-insight';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { LynxWorkspaceService } from '../lynx-workspace.service';
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
    private readonly overlayService: LynxInsightOverlayService,
    private readonly lynxWorkspaceService: LynxWorkspaceService
  ) {}

  ngOnInit(): void {
    if (this.editor == null) {
      return;
    }

    fromEvent(this.editor, 'text-change')
      .pipe(
        filter(([_delta, _oldContents, source]) => source === 'user'),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(([delta]) => this.handleTextChange(delta));

    combineLatest([
      fromEvent(this.editor, 'selection-change').pipe(map(([range]) => range)),
      this.insightState.filteredChapterInsights$
    ])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(([range, insights]) => this.handleSelectionChange(range, insights));

    combineLatest([fromEvent(this.editor.root, 'mouseover'), this.insightState.filteredChapterInsights$])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
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
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    if (this.editor != null) {
      this.insightRenderService.removeAllInsightFormatting(this.editor);
    }
  }

  private handleSelectionChange(selection: LynxInsightRange | undefined, insights: LynxInsight[]): void {
    if (this.overlayService.isOpen) {
      return;
    }
    const ids = insights
      .filter(insight => selection != null && overlaps(insight.range, selection))
      .map(insight => insight.id);

    const displayStateChanges: Partial<LynxInsightDisplayState> = {
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

  private async handleTextChange(delta: Delta): Promise<void> {
    if (this.editor == null) {
      return;
    }
    const edits = await this.lynxWorkspaceService.getOnTypeEdits(delta);
    for (const edit of edits) {
      this.editor.updateContents(edit, 'user');
    }
  }
}

function overlaps(x: LynxInsightRange, y: LynxInsightRange): boolean {
  return x.index <= y.index + y.length && y.index <= x.index + x.length;
}
