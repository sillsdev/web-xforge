import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, EventEmitter, Inject, Input, OnInit, Output } from '@angular/core';
import { MAT_TOOLTIP_DEFAULT_OPTIONS } from '@angular/material/tooltip';
import { Delta } from 'quill';
import { fromEvent } from 'rxjs';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { LynxEditor, LynxTextModelConverter } from '../lynx-editor';
import { EDITOR_INSIGHT_DEFAULTS, LynxInsight, LynxInsightAction, LynxInsightConfig } from '../lynx-insight';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { LynxWorkspaceService } from '../lynx-workspace.service';

@Component({
    selector: 'app-lynx-insight-overlay',
    templateUrl: './lynx-insight-overlay.component.html',
    styleUrl: './lynx-insight-overlay.component.scss',
    providers: [{ provide: MAT_TOOLTIP_DEFAULT_OPTIONS, useValue: { showDelay: 500 } }],
    standalone: false
})
export class LynxInsightOverlayComponent implements OnInit {
  showMoreInfo = false;
  applyActionShortcut: string = '';

  private _insights: LynxInsight[] = [];

  get insights(): LynxInsight[] {
    return this._insights;
  }

  @Input()
  set insights(value: LynxInsight[]) {
    this._insights = value;

    // Focus if single insight
    if (this._insights.length === 1) {
      this.focusInsight(this._insights[0]);
    }
  }

  @Input() editor?: LynxEditor;
  @Input() textModelConverter?: LynxTextModelConverter;

  /** Emits when insight is dismissed by user. */
  @Output() insightDismiss = new EventEmitter<LynxInsight>();

  /** Emits when overlay goes to single insight mode. */
  @Output() insightFocus = new EventEmitter<LynxInsight>();

  /** Emits hovered insight when overlay displays multi-insight selection list. Emits `null` when hover ceases. */
  @Output() insightHover = new EventEmitter<LynxInsight | null>();

  focusedInsight?: LynxInsight;
  menuActions: LynxInsightAction[] = [];
  primaryAction?: LynxInsightAction;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly elementRef: ElementRef,
    private readonly insightState: LynxInsightStateService,
    private readonly overlayService: LynxInsightOverlayService,
    private readonly lynxWorkspaceService: LynxWorkspaceService,
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(EDITOR_INSIGHT_DEFAULTS) private readonly config: LynxInsightConfig
  ) {}

  ngOnInit(): void {
    if (this.editor == null) {
      throw new Error('Editor is not set');
    }

    // Listen for keystrokes to apply chord shortcut
    fromEvent<KeyboardEvent>(this.document, 'keydown')
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(event => this.handleKeyDown(event));

    // Prevent editor from stealing focus when overlay is open
    fromEvent<FocusEvent>(this.editor.getRoot(), 'focus')
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.focusOverlay());

    // After overlay renders, focus it to prevent editor edits from keystrokes
    this.focusOverlay();

    this.applyActionShortcut = this.formatKeyChord(this.config.actionOverlayApplyPrimaryActionChord);
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

  focusInsight(insight: LynxInsight): void {
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
    if (this.editor == null || this.textModelConverter == null) {
      return;
    }

    this.editor.updateContents(this.textModelConverter.dataDeltaToEditorDelta(new Delta(action.ops)), 'user');

    if (this.focusedInsight == null) {
      throw new Error('No focused insight');
    }

    this.overlayService.close();
    this.editor.focus();
  }

  dismissInsight(insight: LynxInsight): void {
    this.insightDismiss.emit(insight);
    this.insightState.dismissInsights([insight.id]);
  }

  private focusOverlay(): void {
    setTimeout(() => {
      // Make overlay focusable, then focus it
      this.elementRef.nativeElement.setAttribute('tabindex', '0');
      this.elementRef.nativeElement.focus();
    });
  }

  private fetchInsightActions(insight: LynxInsight | undefined): void {
    if (insight == null) {
      return;
    }

    this.lynxWorkspaceService.getActions(insight).then(actions => {
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

  /**
   * Gets string format for shortcut key chord.
   */
  private formatKeyChord(chord: Partial<KeyboardEvent>): string {
    const parts: string[] = [];

    // Add modifier keys in conventional order
    if (chord.ctrlKey) parts.push('Ctrl');
    if (chord.altKey) parts.push('Alt');
    if (chord.shiftKey) parts.push('Shift');
    if (chord.metaKey) parts.push('Meta');

    // Add the main key
    if (chord.key) {
      parts.push(chord.key);
    }

    return parts.join(' + ');
  }
}
