import { Component, DestroyRef, Input, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Quill from 'quill';
import { Observable, combineLatest, filter } from 'rxjs';
import { LynxInsightRenderService } from '../lynx-insight-render.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';

@Component({
  selector: 'app-lynx-insight-editor-objects',
  templateUrl: './lynx-insight-editor-objects.component.html',
  styleUrl: './lynx-insight-editor-objects.component.scss'
})
export class LynxInsightEditorObjectsComponent implements OnInit {
  @Input() editor?: Quill;
  @Input() editorLoaded$?: Observable<boolean>;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly insightState: LynxInsightStateService,
    private readonly insightRenderService: LynxInsightRenderService
  ) {}

  ngOnInit(): void {
    if (this.editorLoaded$ == null) {
      return;
    }

    combineLatest([this.insightState.insights$, this.editorLoaded$.pipe(filter(loaded => loaded))])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([insights]) => {
        // If text is just '\n', wait for loaded$ to emit again before rendering
        if (this.editor != null && this.editor.getText().length > 1) {
          this.insightRenderService.render(insights, this.editor);
        }
      });
  }
}
