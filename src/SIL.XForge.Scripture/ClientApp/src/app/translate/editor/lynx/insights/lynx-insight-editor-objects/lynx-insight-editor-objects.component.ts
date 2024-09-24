import { Component, DestroyRef, Input, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Quill from 'quill';
import { filter, switchMap, tap } from 'rxjs';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';

@Component({
  selector: 'app-lynx-insight-editor-objects',
  templateUrl: './lynx-insight-editor-objects.component.html',
  styleUrl: './lynx-insight-editor-objects.component.scss'
})
export class LynxInsightEditorObjectsComponent implements OnInit {
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
        switchMap(() => this.insightState.filteredChapterInsights$)
      )
      .subscribe(chapterInsights => {
        this.insightRenderService.render(chapterInsights, this.editor);
      });
  }
}
