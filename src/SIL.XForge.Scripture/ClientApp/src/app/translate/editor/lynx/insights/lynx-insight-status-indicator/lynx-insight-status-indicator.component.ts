import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Quill from 'quill';
import { BehaviorSubject, Observable, filter, fromEvent, map, startWith, switchMap } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
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
export class LynxInsightStatusIndicatorComponent implements OnChanges, OnInit {
  @Input() editor?: Quill;

  private editorLoaded$ = new BehaviorSubject<boolean>(false);
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
    private readonly editorInsightState: LynxInsightStateService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.editor?.currentValue?.scrollingContainer != null) {
      this.editorLoaded$.next(true);
    }
  }

  ngOnInit(): void {
    this.editorLoaded$
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
    this.elementRef.nativeElement.style.setProperty('--editor-scrollbar-width', `${scrollbarWidth}px`);
  }
}
