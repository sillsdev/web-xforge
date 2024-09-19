import { Component, DestroyRef, Input, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Quill from 'quill';
import { BehaviorSubject, EMPTY, distinctUntilChanged, fromEvent, startWith, switchMap } from 'rxjs';
import { LynxInsightRenderService } from '../lynx-insight-render.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';

@Component({
  selector: 'app-lynx-insight-editor-objects',
  templateUrl: './lynx-insight-editor-objects.component.html',
  styleUrl: './lynx-insight-editor-objects.component.scss'
})
export class LynxInsightEditorObjectsComponent implements OnInit {
  @Input() editor?: Quill;

  private editorReady$ = new BehaviorSubject<boolean>(false);

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly insightState: LynxInsightStateService,
    private readonly insightRenderService: LynxInsightRenderService
  ) {}

  ngOnInit(): void {
    if (this.editor == null) {
      return;
    }

    fromEvent(this.editor, 'editor-change')
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        startWith(['initial']) // Arbitrary event to ensure 'ready' is checked in case editor changes have already fired
      )
      .subscribe(([event]: any) => {
        if (event !== 'text-change' && event !== 'initial') {
          return;
        }

        this.editorReady$.next(this.editor != null && this.editor.getLength() > 1);
      });

    // Render when insights change if editor is ready
    this.editorReady$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        distinctUntilChanged(),
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
