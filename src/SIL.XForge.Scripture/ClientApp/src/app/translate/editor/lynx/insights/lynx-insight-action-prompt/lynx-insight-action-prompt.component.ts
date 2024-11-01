import { Component, DestroyRef, ElementRef, Input, OnInit, Renderer2 } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Quill, { BoundsStatic } from 'quill';
import { EMPTY, combineLatest, debounceTime, filter, fromEvent, iif, map, startWith, switchMap, tap } from 'rxjs';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { LynxInsight } from '../lynx-insight';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { getMostNestedInsight } from '../lynx-insight-util';

@Component({
  selector: 'app-lynx-insight-action-prompt',
  templateUrl: './lynx-insight-action-prompt.component.html',
  styleUrl: './lynx-insight-action-prompt.component.scss'
})
export class LynxInsightActionPromptComponent implements OnInit {
  @Input() editor?: Quill;

  activeInsights: LynxInsight[] = [];

  // Adjust to move prompt up so less text is hidden
  private yOffsetAdjustment = -9; // TODO: Derive from 'line-height'?
  private xOffsetAdjustment = -4;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly renderer: Renderer2,
    private readonly el: ElementRef,
    private readonly editorInsightState: LynxInsightStateService,
    private readonly editorReadyService: EditorReadyService
  ) {}

  ngOnInit(): void {
    if (this.editor == null) {
      return;
    }

    combineLatest([
      this.editorReadyService.listenEditorReadyState(this.editor).pipe(
        filter(loaded => loaded),
        switchMap(() => this.editorInsightState.displayState$),
        map(displayState =>
          displayState.activeInsightIds
            .map(id => this.editorInsightState.getInsight(id))
            .filter((insight): insight is LynxInsight => insight != null)
        ),
        tap(activeInsights => (this.activeInsights = activeInsights))
      ),
      fromEvent(window, 'resize').pipe(debounceTime(200), startWith(undefined)),
      iif(
        () => this.editor?.scrollingContainer != null,
        fromEvent(this.editor.scrollingContainer, 'scroll').pipe(startWith(undefined)),
        EMPTY
      )
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        let offsetBounds: BoundsStatic | undefined = this.getPromptOffset();

        if (offsetBounds != null) {
          this.setHostStyle('top', `${offsetBounds.top + this.yOffsetAdjustment}px`);
          this.setHostStyle('left', `${offsetBounds.right + this.xOffsetAdjustment}px`); // TODO: handle RTL
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

  private getPromptOffset(): BoundsStatic | undefined {
    if (this.editor != null) {
      const insight: LynxInsight | undefined = getMostNestedInsight(this.activeInsights);

      if (insight?.range != null) {
        // Get bounds of last character in range to ensure bounds isn't for multiple lines
        const bounds = this.editor.getBounds(insight.range.index + insight.range.length - 1, 1);
        return bounds;
      }
    }

    return undefined;
  }

  private setHostStyle(styleName: string, value: string): void {
    this.renderer.setStyle(this.el.nativeElement, styleName, value);
  }
}
