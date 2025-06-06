import { Component, DestroyRef, Input, OnInit } from '@angular/core';
import { LynxInsightType } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { combineLatest, debounceTime, filter, fromEvent, map, startWith, switchMap } from 'rxjs';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { LynxableEditor, LynxEditor, LynxEditorAdapterFactory } from '../lynx-editor';
import { LynxInsight } from '../lynx-insight';
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
  @Input() set editor(value: LynxableEditor | undefined) {
    this.lynxEditor = value == null ? undefined : this.lynxEditorAdapterFactory.getAdapter(value);
  }

  scrollPositions: LynxInsightScrollPosition[] = [];

  private lynxEditor?: LynxEditor;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly editorInsightState: LynxInsightStateService,
    private readonly editorReadyService: EditorReadyService,
    private readonly lynxEditorAdapterFactory: LynxEditorAdapterFactory
  ) {}

  ngOnInit(): void {
    if (this.lynxEditor == null) {
      return;
    }

    combineLatest([
      this.editorReadyService.listenEditorReadyState(this.lynxEditor.getEditor()).pipe(filter(loaded => loaded)),
      fromEvent(window, 'resize').pipe(debounceTime(200), startWith(undefined))
    ])
      .pipe(
        switchMap(() => this.editorInsightState.filteredChapterInsights$),
        map(insights => insights.map(insight => this.getScrollPosition(insight, this.lynxEditor!))),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(scrollPositions => {
        this.scrollPositions = scrollPositions;
      });
  }

  /**
   * Gets a map of insight id -> vertical scroll position as a percent of the total scroll height.
   */
  private getScrollPosition(insight: LynxInsight, editor: LynxEditor): LynxInsightScrollPosition {
    const scrollPosition: LynxInsightScrollPosition = {
      id: insight.id,
      type: insight.type,
      percent: undefined
    };

    if (insight.range != null) {
      const container = editor.getScrollingContainer();
      const bounds = editor.getBounds(insight.range.index, 1);
      const absoluteTop = bounds.top + container.scrollTop; // Absolute position (viewport-relative + scroll offset)
      scrollPosition.percent = (absoluteTop / container.scrollHeight) * 100;
    }

    return scrollPosition;
  }
}
