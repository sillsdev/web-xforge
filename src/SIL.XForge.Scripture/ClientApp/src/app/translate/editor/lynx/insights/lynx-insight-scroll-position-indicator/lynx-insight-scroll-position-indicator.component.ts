import { Component, DestroyRef, Input, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Quill from 'quill';
import { combineLatest, debounceTime, filter, fromEvent, map, startWith, switchMap } from 'rxjs';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { LynxInsight, LynxInsightType } from '../lynx-insight';
import { LynxInsightStateService } from '../lynx-insight-state.service';

interface LynxInsightScrollPosition {
  id: string;
  type: LynxInsightType;
  percent: number | undefined;
}

@Component({
  selector: 'app-lynx-insight-scroll-position-indicator',
  templateUrl: './lynx-insight-scroll-position-indicator.component.html',
  styleUrl: './lynx-insight-scroll-position-indicator.component.scss'
})
export class LynxInsightScrollPositionIndicatorComponent implements OnInit {
  @Input() editor?: Quill;

  scrollPositions: LynxInsightScrollPosition[] = [];

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly editorInsightState: LynxInsightStateService,
    private readonly editorReadyService: EditorReadyService
  ) {}

  ngOnInit(): void {
    if (this.editor == null) {
      return;
    }

    combineLatest([
      this.editorReadyService.listenEditorReadyState(this.editor).pipe(filter(loaded => loaded)),
      fromEvent(window, 'resize').pipe(debounceTime(200), startWith(undefined))
    ])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(() => this.editorInsightState.filteredChapterInsights$),
        map(insights => insights.map(insight => this.getScrollPosition(insight, this.editor!)))
      )
      .subscribe(scrollPositions => {
        this.scrollPositions = scrollPositions;
      });
  }

  /**
   * Gets a map of insight id -> vertical scroll position as a percent of the total scroll height.
   * TODO: move to service?
   */
  private getScrollPosition(insight: LynxInsight, editor: Quill): LynxInsightScrollPosition {
    const scrollPosition: LynxInsightScrollPosition = {
      id: insight.id,
      type: insight.type,
      percent: undefined
    };

    if (insight.range != null) {
      const bounds = editor.getBounds(insight.range.index, 1);
      scrollPosition.percent = (bounds.top / editor.scrollingContainer.scrollHeight) * 100;
    }

    return scrollPosition;
  }
}
