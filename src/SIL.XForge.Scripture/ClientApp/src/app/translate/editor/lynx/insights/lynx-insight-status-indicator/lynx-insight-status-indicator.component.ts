import { Component, DestroyRef, ElementRef, HostListener, Input, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Quill from 'quill';
import { Observable, filter, fromEvent, map, startWith, switchMap } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { LynxInsightType } from '../lynx-insight';
import { LynxInsightStateService } from '../lynx-insight-state.service';

interface InsightCount {
  type: LynxInsightType;
  count: number;
}

@Component({
  selector: 'app-lynx-insight-status-indicator',
  templateUrl: './lynx-insight-status-indicator.component.html',
  styleUrl: './lynx-insight-status-indicator.component.scss'
})
export class LynxInsightStatusIndicatorComponent implements OnInit {
  @Input() editor?: Quill;

  private insightTypeOrder: LynxInsightType[] = ['info', 'warning', 'error'];
  readonly insightCountsByType$: Observable<InsightCount[]> = this.editorInsightState.filteredInsightCountsByType$.pipe(
    map(counts =>
      this.insightTypeOrder
        .filter(insightType => counts[insightType] > 0)
        .map(insightType => ({ type: insightType, count: counts[insightType] }))
    )
  );

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly elementRef: ElementRef,
    private readonly editorInsightState: LynxInsightStateService,
    private readonly editorReadyService: EditorReadyService
  ) {}

  ngOnInit(): void {
    if (this.editor == null) {
      return;
    }

    // TODO: editor will be ready before styles have been applied, so scrollbar may not be present yet
    this.editorReadyService
      .listenEditorReadyState(this.editor)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter(loaded => loaded),
        switchMap(() => fromEvent(window, 'resize').pipe(debounceTime(200), startWith(undefined)))
      )
      .subscribe(() => {
        this.updateScrollbarWidth(this.editor!.scrollingContainer as HTMLElement);
      });
  }

  @HostListener('click')
  onClick(): void {
    this.editorInsightState.togglePanelVisibility();
  }

  private updateScrollbarWidth(scrollContainer: HTMLElement): void {
    const scrollbarWidth = scrollContainer.offsetWidth - scrollContainer.clientWidth;
    this.elementRef.nativeElement.style.setProperty('--lynx-scrollbar-width', `${scrollbarWidth}px`);
  }
}
