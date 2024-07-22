import { Component, DestroyRef, Input, OnDestroy, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isEqual } from 'lodash-es';
import { filter, merge, switchMap, tap } from 'rxjs';
import { pairwise } from 'rxjs/operators';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxableEditor } from '../lynx-editor';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';

@Component({
  selector: 'app-lynx-insight-editor-objects',
  templateUrl: './lynx-insight-editor-objects.component.html',
  styleUrl: './lynx-insight-editor-objects.component.scss'
})
export class LynxInsightEditorObjectsComponent implements OnInit, OnDestroy {
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
}
