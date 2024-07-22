import { Component, DestroyRef, Input, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Quill from 'quill';
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
    private readonly insightRenderService: LynxInsightRenderService
  ) {}

  ngOnInit(): void {
    this.insightState.insights$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(insights => {
      this.insightRenderService.render(insights, this.editor);
    });
  }
}
