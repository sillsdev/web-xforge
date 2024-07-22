import { Component, DestroyRef, ElementRef, Input, OnChanges, OnInit, Renderer2, SimpleChanges } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Quill, { BoundsStatic } from 'quill';
import {
  BehaviorSubject,
  NEVER,
  Observable,
  combineLatest,
  filter,
  fromEvent,
  iif,
  map,
  startWith,
  switchMap,
  tap
} from 'rxjs';
import { LynxInsight } from '../lynx-insight';
import { LynxInsightStateService } from '../lynx-insight-state.service';

@Component({
  selector: 'app-lynx-insight-action-prompt',
  templateUrl: './lynx-insight-action-prompt.component.html',
  styleUrl: './lynx-insight-action-prompt.component.scss'
})
export class LynxInsightActionPromptComponent implements OnChanges, OnInit {
  @Input() editor?: Quill;

  currentInsight?: LynxInsight | undefined;

  private editorLoaded$ = new BehaviorSubject<boolean>(false);
  private currentInsight$: Observable<LynxInsight | undefined> = this.editorLoaded$.pipe(
    filter(loaded => loaded),
    switchMap(() => this.editorInsightState.insights$),
    map(insights => this.getPromptInsight(insights)),
    tap(insight => (this.currentInsight = insight))
  );

  // Adjust to move prompt up so less text is hidden
  private yOffsetAdjustment = -9; // TODO: Derive from 'line-height'?
  private xOffsetAdjustment = -4;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly renderer: Renderer2,
    private readonly el: ElementRef,
    private readonly editorInsightState: LynxInsightStateService
    // private readonly overlayService: LynxInsightRenderService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.editor?.currentValue?.scrollingContainer != null) {
      this.editorLoaded$.next(true);
    }
  }

  ngOnInit(): void {
    combineLatest([
      this.currentInsight$,
      fromEvent(window, 'resize').pipe(startWith(undefined)),
      iif(
        () => this.editor?.scrollingContainer != null,
        fromEvent(this.editor?.scrollingContainer!, 'scroll').pipe(startWith(undefined)),
        NEVER
      )
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([currentInsight]) => {
        let offsetBounds: BoundsStatic | undefined;
        // const scrollBox: HTMLElement = this.editor?.scrollingContainer as HTMLElement;

        if (currentInsight != null) {
          offsetBounds = this.getPromptOffset(currentInsight, this.editor!);
        }

        if (offsetBounds != null) {
          // const scrollbarWidth: number = scrollBox.offsetWidth - scrollBox.clientWidth;

          this.setHostStyle('top', `${offsetBounds.top + this.yOffsetAdjustment}px`);
          this.setHostStyle('left', `${offsetBounds.right + this.xOffsetAdjustment}px`); // TODO: handle RTL
          // this.setHostStyle('inset-inline-end', `${scrollbarWidth}px`);
          this.setHostStyle('display', 'flex');
        } else {
          this.setHostStyle('display', 'none');
        }
      });
  }

  onPromptClick(event: MouseEvent): void {
    // Don't bubble, as the 'insight user event service' will clear display state on non-insight clicks that bubble
    event.stopPropagation();

    if (this.currentInsight == null) {
      return;
    }

    // Toggle action menu
    const isActionMenuActive: boolean = !!this.currentInsight.displayState?.actionMenuActive;
    this.editorInsightState.updateDisplayState(this.currentInsight.id, { actionMenuActive: !isActionMenuActive });
  }

  // private openActionOverlay(): void {
  //   const overlayAnchor = this.getElementAtIndex(editor, insight.range[0].index + 1);
  //   const ref = this.overlayService.open(this.el.nativeElement, insight);

  //   ref.afterClosed.subscribe(() => {
  //     if (insight.displayState != null) {
  //       insight.displayState.actionMenuActive = false;
  //     }

  //     console.log('*** Action menu closed');
  //   });
  // }

  private getPromptOffset(insight: LynxInsight, editor: Quill): BoundsStatic | undefined {
    if (insight.range != null) {
      // Get bounds of last character in range to ensure bounds isn't for multiple lines
      const bounds = editor.getBounds(insight.range.index + insight.range.length - 1, 1);
      return bounds;
    }

    return undefined;
  }

  private getPromptInsight(insights: LynxInsight[]): LynxInsight | undefined {
    return insights.find(insight => insight.displayState?.promptActive);
  }

  private setHostStyle(styleName: string, value: string): void {
    this.renderer.setStyle(this.el.nativeElement, styleName, value);
  }
}
