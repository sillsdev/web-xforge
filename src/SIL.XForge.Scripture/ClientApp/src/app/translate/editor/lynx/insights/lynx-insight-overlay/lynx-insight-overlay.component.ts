import { DOCUMENT } from '@angular/common';
import { Component, EventEmitter, Inject, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { MAT_TOOLTIP_DEFAULT_OPTIONS } from '@angular/material/tooltip';
import { take } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { LynxEditor } from '../lynx-editor';
import { EDITOR_INSIGHT_DEFAULTS, LynxInsight, LynxInsightConfig } from '../lynx-insight';
import { LynxInsightAction, LynxInsightActionService } from '../lynx-insight-action.service';
import { LynxInsightCodeService } from '../lynx-insight-code.service';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';

interface LynxInsightFlattened extends LynxInsight {
  description: string;
  moreInfo?: string;
}

@Component({
  selector: 'app-lynx-insight-overlay',
  templateUrl: './lynx-insight-overlay.component.html',
  styleUrl: './lynx-insight-overlay.component.scss',
  providers: [{ provide: MAT_TOOLTIP_DEFAULT_OPTIONS, useValue: { showDelay: 500 } }]
})
export class LynxInsightOverlayComponent implements OnInit, OnDestroy {
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

  @Input() editor?: LynxEditor;

  /** Emits when insight is dismissed by user. */
  @Output() insightDismiss = new EventEmitter<LynxInsight>();

  /** Emits when overlay goes to single insight mode. */
  @Output() insightFocus = new EventEmitter<LynxInsight>();

  /** Emits hovered insight when overlay displays multi-insight selection list. Emits `null` when hover ceases. */
  @Output() insightHover = new EventEmitter<LynxInsight | null>();

  focusedInsight?: LynxInsightFlattened;
  menuActions: LynxInsightAction[] = [];
  primaryAction?: LynxInsightAction;

  // Create single reference to bound method so it can be removed in ngOnDestroy
  private readonly handleKeyDownBound = this.handleKeyDown.bind(this);

  constructor(
    private readonly insightState: LynxInsightStateService,
    private readonly codeService: LynxInsightCodeService,
    private readonly actionService: LynxInsightActionService,
    private readonly overlayService: LynxInsightOverlayService,
    private readonly i18n: I18nService,
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(EDITOR_INSIGHT_DEFAULTS) private readonly config: LynxInsightConfig
  ) {}

  ngOnInit(): void {
    this.document.addEventListener('keydown', this.handleKeyDownBound);
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('keydown', this.handleKeyDownBound);
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (this.primaryAction == null) {
      return;
    }

    // Apply primary action if configured hotkey chord is pressed
    if (this.chordPressed(event, this.config.actionOverlayApplyPrimaryActionChord)) {
      this.selectAction(this.primaryAction);
    }
  }

  toggleMoreInfo(): void {
    this.showMoreInfo = !this.showMoreInfo;
  }

  focusInsight(insight: LynxInsightFlattened): void {
    this.focusedInsight = insight;
    this.fetchInsightActions(insight);
    this.insightFocus.emit(insight);
  }

  /**
   * Highlight the specified insight.  Brings lower severity insights to the front.  `null` means hover ceased.
   */
  highlightInsight(insight: LynxInsight | null): void {
    this.insightHover.emit(insight);
  }

  selectAction(action: LynxInsightAction): void {
    if (this.editor == null) {
      return;
    }

    this.actionService.performAction(action, this.editor);

    if (this.focusedInsight == null) {
      throw new Error('No focused insight');
    }

    this.overlayService.close();
  }

  dismissInsight(insight: LynxInsight): void {
    console.log('Dismiss', insight.id);
    this.insightDismiss.emit(insight);
    this.insightState.dismissInsights([insight.id]);
  }

  private flattenInsight(insight: LynxInsight): LynxInsightFlattened {
    const insightCode = this.codeService.lookupCode(insight.code, this.i18n.localeCode);
    return {
      ...insight,
      description: insightCode?.description ?? '',
      moreInfo: insightCode?.moreInfo
    };
  }

  private fetchInsightActions(insight: LynxInsight | undefined): void {
    if (insight == null) {
      return;
    }

    this.actionService
      .getActions(insight, this.i18n.localeCode)
      .pipe(take(1))
      .subscribe(actions => {
        const menuActions: LynxInsightAction[] = [];

        for (const action of actions) {
          if (action.isPrimary) {
            this.primaryAction = action;
          } else {
            menuActions.push(action);
          }
        }

        this.menuActions = menuActions;
      });
  }

  /**
   * Check if the keyboard event matches the given chord.
   */
  private chordPressed(event: KeyboardEvent, chord: Partial<KeyboardEvent>): boolean {
    for (const key of Object.keys(chord)) {
      if (event[key] !== chord[key]) {
        return false;
      }
    }

    return true;
  }
}
