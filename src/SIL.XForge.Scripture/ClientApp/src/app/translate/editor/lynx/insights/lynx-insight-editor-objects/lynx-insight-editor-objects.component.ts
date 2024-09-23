import { Component, DestroyRef, Input, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Quill from 'quill';
import { EMPTY, switchMap } from 'rxjs';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { LynxInsightRenderService } from '../lynx-insight-render.service';
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
    private readonly insightRenderService: LynxInsightRenderService,
    private readonly editorReadyService: EditorReadyService
  ) {}

  ngOnInit(): void {
    if (this.editor == null) {
      return;
    }

    this.editorReadyService
      .getEditorReadyState(this.editor)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(ready => (ready ? this.insightState.filteredChapterInsights$ : EMPTY))
      )
      .subscribe(insights => {
        // Ensure text is more than just '\n'
        if (this.editor != null && this.editor.getLength() > 1) {
          this.insightRenderService.render(insights, this.editor);
        }
      });
  }
}
