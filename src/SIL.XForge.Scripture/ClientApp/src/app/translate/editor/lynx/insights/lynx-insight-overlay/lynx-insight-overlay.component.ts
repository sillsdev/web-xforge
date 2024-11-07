import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MAT_TOOLTIP_DEFAULT_OPTIONS } from '@angular/material/tooltip';
import { I18nService } from 'xforge-common/i18n.service';
import { LynxInsight } from '../lynx-insight';
import { LynxInsightAction, LynxInsightActionService } from '../lynx-insight-action.service';
import { LynxInsightCodeService } from '../lynx-insight-code.service';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';

interface LynxInsightFlattened extends LynxInsight {
  description: string;
  moreInfo: string;
}

@Component({
  selector: 'app-lynx-insight-overlay',
  templateUrl: './lynx-insight-overlay.component.html',
  styleUrl: './lynx-insight-overlay.component.scss',
  providers: [{ provide: MAT_TOOLTIP_DEFAULT_OPTIONS, useValue: { showDelay: 500 } }]
})
export class LynxInsightOverlayComponent {
  showMoreInfo = false;

  insightsFlattened: LynxInsightFlattened[] = [];

  @Input()
  set insights(value: LynxInsight[]) {
    console.log(`set insights(${value.map(i => i.id).join(', ')})`);
    this.insightsFlattened = value.map(insight => this.flattenInsight(insight));

    // Focus if single insight
    if (value.length === 1) {
      this.focusInsight(this.insightsFlattened[0]);
    }
  }

  @Output() closeOverlay = new EventEmitter<void>();

  focusedInsight?: LynxInsightFlattened;
  menuActions: LynxInsightAction[] = [];
  primaryAction?: LynxInsightAction;

  constructor(
    private readonly insightState: LynxInsightStateService,
    private readonly codeService: LynxInsightCodeService,
    private readonly actionService: LynxInsightActionService,
    private readonly overlayService: LynxInsightOverlayService,
    private readonly i18n: I18nService
  ) {}

  toggleMoreInfo(): void {
    this.showMoreInfo = !this.showMoreInfo;
  }

  focusInsight(insight: LynxInsightFlattened): void {
    this.focusedInsight = insight;
    this.fetchInsightActions(insight);
  }

  selectAction(action: LynxInsightAction): void {
    this.actionService.performAction(action);

    if (this.focusedInsight == null) {
      throw new Error('No focused insight');
    }

    this.overlayService.close(this.focusedInsight.id);
  }

  dismissInsight(insight: LynxInsight): void {
    console.log('Dismiss', insight.id);
    this.closeOverlay.emit();
    this.insightState.dismissInsights([insight.id]);
  }

  private flattenInsight(insight: LynxInsight): LynxInsightFlattened {
    const insightCode = this.codeService.lookupCode(insight.code, this.i18n.localeCode);
    return {
      ...insight,
      description: insightCode?.description ?? '',
      moreInfo: insightCode?.moreInfo ?? ''
    };
  }

  private fetchInsightActions(insight: LynxInsight | undefined): void {
    if (insight == null) {
      return;
    }

    for (const action of this.actionService.getActions(insight.id, this.i18n.localeCode)) {
      if (action.isPrimary) {
        this.primaryAction = action;
      } else {
        this.menuActions.push(action);
      }
    }
  }
}
