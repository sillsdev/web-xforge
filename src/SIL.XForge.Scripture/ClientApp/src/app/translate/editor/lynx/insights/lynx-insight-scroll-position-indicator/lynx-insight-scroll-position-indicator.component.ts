import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import Quill from 'quill';
import { BehaviorSubject, filter, map, switchMap } from 'rxjs';
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
export class LynxInsightScrollPositionIndicatorComponent implements OnChanges {
  @Input() editor?: Quill;

  private editorLoaded$ = new BehaviorSubject<boolean>(false);
  scrollPositions$ = this.editorLoaded$.pipe(
    filter(loaded => loaded),
    switchMap(() => this.editorInsightState.insights$),
    map(insights => insights.map(insight => this.getScrollPosition(insight, this.editor!)))
  );

  constructor(private readonly editorInsightState: LynxInsightStateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.editor?.currentValue?.scrollingContainer != null) {
      this.editorLoaded$.next(true);
    }
  }

  /**
   * From editorInsightState.insights$, gets a map of insight id -> vertical percent of the insight in the quill editor based on the range in the LynxInsight
   * TODO: move to service?
   */
  private getScrollPosition(insight: LynxInsight, editor: Quill): LynxInsightScrollPosition {
    const scrollPosition: LynxInsightScrollPosition = {
      id: insight.id,
      type: insight.type,
      percent: undefined
    };

    if (insight.range != null) {
      const bounds = editor.getBounds(insight.range.index, insight.range.length);
      scrollPosition.percent = (bounds.top / editor.scrollingContainer.scrollHeight) * 100;
    }

    return scrollPosition;
  }
}
