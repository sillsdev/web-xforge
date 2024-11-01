import { Component, DestroyRef, Input, OnDestroy, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isEqual } from 'lodash-es';
import Quill from 'quill';
import { filter, map, merge, switchMap, tap } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';

@Component({
  selector: 'app-lynx-insight-editor-objects',
  templateUrl: './lynx-insight-editor-objects.component.html',
  styleUrl: './lynx-insight-editor-objects.component.scss'
})
export class LynxInsightEditorObjectsComponent implements OnInit, OnDestroy {
  @Input() editor?: Quill;

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
        takeUntilDestroyed(this.destroyRef),
        filter(ready => ready),
        tap(() => {
          // When editor becomes ready, close all action overlays,
          // including those for insights from other books/chapters
          this.overlayService.closeAll();
        }),
        switchMap(() =>
          merge(
            // Render blots when insights change
            this.insightState.filteredChapterInsights$.pipe(
              tap(insights => this.insightRenderService.render(insights, this.editor))
            ),
            // Check display state to render action overlay
            this.insightState.displayState$.pipe(
              map(displayState => ({
                activeInsights: displayState.activeInsightIds.map(id => this.insightState.getInsight(id)),
                actionOverlayActive: displayState.actionOverlayActive
              })),
              distinctUntilChanged(isEqual),
              tap(({ activeInsights, actionOverlayActive }) => {
                this.insightRenderService.renderActionOverlay(activeInsights, this.editor, actionOverlayActive);
              })
            )
          )
        )
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.insightRenderService.removeAllInsightFormatting(this.editor);
  }
}
