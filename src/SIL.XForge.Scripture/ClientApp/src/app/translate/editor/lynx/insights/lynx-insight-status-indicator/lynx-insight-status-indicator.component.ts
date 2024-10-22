import { Component, HostListener, Input } from '@angular/core';
import Quill from 'quill';
import { Observable, map } from 'rxjs';
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
export class LynxInsightStatusIndicatorComponent {
  @Input() editor?: Quill;

  private insightTypeOrder: LynxInsightType[] = ['info', 'warning', 'error'];
  readonly insightCountsByType$: Observable<InsightCount[]> = this.editorInsightState.filteredInsightCountsByType$.pipe(
    map(counts =>
      this.insightTypeOrder
        .filter(insightType => counts[insightType] > 0)
        .map(insightType => ({ type: insightType, count: counts[insightType] }))
    )
  );

  constructor(private readonly editorInsightState: LynxInsightStateService) {}

  @HostListener('click')
  onClick(): void {
    this.editorInsightState.togglePanelVisibility();
  }
}
