import { Directionality } from '@angular/cdk/bidi';
import { Component, DestroyRef, ElementRef, Input, OnInit, Renderer2 } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Bounds } from 'quill';
import { combineLatest, debounceTime, EMPTY, filter, fromEvent, iif, map, startWith, switchMap, tap } from 'rxjs';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { LynxableEditor, LynxEditor } from '../lynx-editor';
import { LynxInsight } from '../lynx-insight';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { getMostNestedInsight } from '../lynx-insight-util';

@Component({
  selector: 'app-lynx-insight-action-prompt',
  templateUrl: './lynx-insight-action-prompt.component.html',
  styleUrl: './lynx-insight-action-prompt.component.scss'
})
export class LynxInsightActionPromptComponent implements OnInit {
  @Input() set editor(value: LynxableEditor) {
    this.lynxEditor = new LynxEditor(value);
  }

  activeInsights: LynxInsight[] = [];
  isLtr: boolean = this.dir.value === 'ltr';

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
    private readonly dir: Directionality
  ) {}

  ngOnInit(): void {
    if (this.lynxEditor == null) {
      return;
    }

    // Adjust prompt vertical position based on line-height
    this.yOffsetAdjustment = -this.getLineHeight() / 2;

    combineLatest([
      this.editorReadyService.listenEditorReadyState(this.lynxEditor.editor).pipe(
        filter(loaded => loaded),
        switchMap(() => this.editorInsightState.displayState$),
        map(displayState =>
          displayState.activeInsightIds
            .map(id => this.editorInsightState.getInsight(id))
            .filter((insight): insight is LynxInsight => insight != null)
        ),
        tap(activeInsights => {
          this.activeInsights = activeInsights;
        })
      ),
      fromEvent(window, 'resize').pipe(debounceTime(200), startWith(undefined)),
      iif(
        () => this.lynxEditor?.getScrollingContainer() != null,
        fromEvent(this.lynxEditor.getScrollingContainer(), 'scroll').pipe(startWith(undefined)),
        EMPTY
      )
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const offsetBounds: Bounds | undefined = this.getPromptOffset();

        if (offsetBounds != null) {
          const boundsEnd: number = this.isLtr ? offsetBounds.right : offsetBounds.left;
          this.setHostStyle('top', `${offsetBounds.top + this.yOffsetAdjustment}px`);
          this.setHostStyle('left', `${boundsEnd + this.xOffsetAdjustment}px`);
          this.setHostStyle('display', 'flex');
        } else {
          this.setHostStyle('display', 'none');
        }
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
      const editorElement = this.lynxEditor.editor.root;
      const lineHeight = window.getComputedStyle(editorElement).lineHeight;
      return Number.parseFloat(lineHeight);
    }

    return this.defaultLineHeight;
  }

  private setHostStyle(styleName: string, value: string): void {
    this.renderer.setStyle(this.el.nativeElement, styleName, value);
  }
}
