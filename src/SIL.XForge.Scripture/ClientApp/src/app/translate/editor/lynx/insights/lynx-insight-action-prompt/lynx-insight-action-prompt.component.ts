import { Directionality } from '@angular/cdk/bidi';
import { Component, DestroyRef, ElementRef, Input, OnInit, Renderer2 } from '@angular/core';
import { Bounds } from 'quill';
import {
  combineLatest,
  debounceTime,
  EMPTY,
  filter,
  fromEvent,
  iif,
  map,
  Observable,
  startWith,
  switchMap,
  tap
} from 'rxjs';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { LynxableEditor, LynxEditor, LynxEditorAdapterFactory, LynxTextModelConverter } from '../lynx-editor';
import { LynxInsight } from '../lynx-insight';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { getMostNestedInsight } from '../lynx-insight-util';

@Component({
  selector: 'app-lynx-insight-action-prompt',
  templateUrl: './lynx-insight-action-prompt.component.html',
  styleUrl: './lynx-insight-action-prompt.component.scss',
  standalone: false
})
export class LynxInsightActionPromptComponent implements OnInit {
  @Input() set editor(value: LynxableEditor | undefined) {
    this.lynxEditor = value == null ? undefined : this.lynxEditorAdapterFactory.getAdapter(value);
  }

  @Input() lynxTextModelConverter?: LynxTextModelConverter;

  activeInsights: LynxInsight[] = [];
  isRtl: boolean = this.dir.value === 'rtl';

  // Adjust to move prompt up so less text is hidden
  private readonly defaultLineHeight = 9;
  private yOffsetAdjustment = this.defaultLineHeight;
  private xOffsetAdjustment = -9;

  private lynxEditor?: LynxEditor;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly renderer: Renderer2,
    private readonly el: ElementRef,
    private readonly editorInsightState: LynxInsightStateService,
    private readonly editorReadyService: EditorReadyService,
    private readonly lynxEditorAdapterFactory: LynxEditorAdapterFactory,
    private readonly dir: Directionality
  ) {}

  ngOnInit(): void {
    if (this.lynxEditor == null || this.lynxTextModelConverter == null) {
      return;
    }

    // Adjust prompt vertical position based on line-height
    this.yOffsetAdjustment = -this.getLineHeight() / 2;

    const activeInsights$: Observable<LynxInsight[]> = this.editorReadyService
      .listenEditorReadyState(this.lynxEditor.getEditor())
      .pipe(
        filter(loaded => loaded),
        switchMap(() => this.editorInsightState.displayState$),
        map(displayState =>
          displayState.activeInsightIds
            .map(id => {
              const insight: LynxInsight | undefined = this.editorInsightState.getInsight(id);

              if (insight == null) {
                return undefined;
              }

              return {
                ...insight,
                range: this.lynxTextModelConverter!.dataRangeToEditorRange(insight.range)
              };
            })
            .filter((insight): insight is LynxInsight => insight != null)
        ),
        tap(activeInsights => {
          // Keep local copy for click handler
          this.activeInsights = activeInsights;
        })
      );

    const windowResize$ = fromEvent(window, 'resize').pipe(debounceTime(100), startWith(undefined));

    const editorScroll$ = iif(
      () => this.lynxEditor?.getScrollingContainer() != null,
      fromEvent(this.lynxEditor.getScrollingContainer(), 'scroll').pipe(startWith(undefined)),
      EMPTY
    );

    combineLatest([activeInsights$, windowResize$, editorScroll$])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updatePosition();
      });
  }

  onPromptClick(event: MouseEvent): void {
    // Don't bubble, as the 'insight user event service' will clear display state on non-insight clicks that bubble
    event.stopPropagation();

    if (this.activeInsights.length === 0) {
      return;
    }

    // Toggle action menu
    this.editorInsightState.toggleDisplayState(['actionOverlayActive']);
  }

  private updatePosition(): void {
    const offsetBounds: Bounds | undefined = this.getPromptOffset();

    if (offsetBounds != null) {
      const boundsEnd: number = this.isRtl ? offsetBounds.left : offsetBounds.right;
      this.setHostStyle('top', `${offsetBounds.top + this.yOffsetAdjustment}px`);
      this.setHostStyle('left', `${boundsEnd + this.xOffsetAdjustment}px`);
      this.setHostStyle('display', 'flex');
    } else {
      this.setHostStyle('display', 'none');
    }
  }

  private getPromptOffset(): Bounds | undefined {
    if (this.lynxEditor != null) {
      const insight: LynxInsight | undefined = getMostNestedInsight(this.activeInsights);

      if (insight?.range != null) {
        // Get bounds of last character in range to ensure bounds isn't for multiple lines
        const bounds = this.lynxEditor.getBounds(insight.range.index + insight.range.length - 1, 1);
        return bounds;
      }
    }

    return undefined;
  }

  private getLineHeight(): number {
    if (this.lynxEditor != null) {
      const editorElement = this.lynxEditor.getRoot();
      const lineHeight = window.getComputedStyle(editorElement).lineHeight;
      return Number.parseFloat(lineHeight);
    }

    return this.defaultLineHeight;
  }

  private setHostStyle(styleName: string, value: string): void {
    this.renderer.setStyle(this.el.nativeElement, styleName, value);
  }
}
