import { Component, Input } from '@angular/core';
import { I18nService } from 'xforge-common/i18n.service';
import { LynxInsight } from '../lynx-insight';
import { LynxInsightAction, LynxInsightActionService } from '../lynx-insight-action.service';
import { LynxInsightCodeService } from '../lynx-insight-code.service';

@Component({
  selector: 'app-lynx-insight-overlay',
  templateUrl: './lynx-insight-overlay.component.html',
  styleUrl: './lynx-insight-overlay.component.scss'
})
export class LynxInsightOverlayComponent {
  showMoreInfo = false;

  private _insight?: LynxInsight;
  get insight(): LynxInsight | undefined {
    return this._insight;
  }

  @Input()
  set insight(value: LynxInsight) {
    this._insight = value;
    this.fetchInsightText(value);
    this.fetchInsightActions(value);
  }

  description?: string;
  moreInfo?: string;
  menuActions: LynxInsightAction[] = [];
  primaryAction?: LynxInsightAction;

  constructor(
    private readonly codeService: LynxInsightCodeService,
    private readonly actionService: LynxInsightActionService,
    private readonly i18n: I18nService
  ) {}

  toggleMoreInfo(): void {
    this.showMoreInfo = !this.showMoreInfo;
  }

  private fetchInsightText(insight: LynxInsight | undefined): void {
    if (insight == null) {
      return;
    }

    const insightCode = this.codeService.lookupCode(insight.code, this.i18n.localeCode);

    this.description = insightCode?.description;
    this.moreInfo = insightCode?.moreInfo;
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
