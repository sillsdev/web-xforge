import { Component, HostListener } from '@angular/core';
import { LynxInsightType } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { map, Observable } from 'rxjs';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { LynxWorkspaceService } from '../lynx-workspace.service';

interface InsightCount {
  type: LynxInsightType;
  count: number;
}

@Component({
  selector: 'app-lynx-insight-status-indicator',
  templateUrl: './lynx-insight-status-indicator.component.html',
  styleUrl: './lynx-insight-status-indicator.component.scss',
  standalone: false
})
export class LynxInsightStatusIndicatorComponent {
  isFilterHidingInsights$: Observable<boolean> = this.editorInsightState.filter$.pipe(
    map(filter => filter.types.length === 0)
  );

  private insightTypeOrder: LynxInsightType[] = ['info', 'warning', 'error'];
  readonly insightCountsByType$: Observable<InsightCount[]> = this.editorInsightState.filteredInsightCountsByType$.pipe(
    map(counts =>
      this.insightTypeOrder
        .filter(insightType => counts[insightType] > 0)
        .map(insightType => ({ type: insightType, count: counts[insightType] }))
    )
  );

  readonly isLoading$: Observable<boolean> = this.lynxWorkspaceService.taskRunningStatus$;

  constructor(
    private readonly editorInsightState: LynxInsightStateService,
    private readonly lynxWorkspaceService: LynxWorkspaceService
  ) {}

  @HostListener('click')
  onClick(): void {
    this.editorInsightState.togglePanelVisibility();
  }
}
