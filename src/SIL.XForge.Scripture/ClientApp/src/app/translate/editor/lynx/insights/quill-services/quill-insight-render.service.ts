import { Injectable } from '@angular/core';
import Quill, { Delta } from 'quill';
import { LynxInsightTypes } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { StringMap } from 'rich-text';
import { take, takeUntil } from 'rxjs';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxRangeConverter } from '../lynx-editor';
import { LynxInsight } from '../lynx-insight';
import { LynxInsightOverlayRef, LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { getLeadingInsight, getMostNestedInsight } from '../lynx-insight-util';
import { LynxInsightBlot } from './blots/lynx-insight-blot';
import { QuillLynxEditorAdapter } from './quill-lynx-editor-adapter';

@Injectable({
  providedIn: 'root'
})
export class QuillInsightRenderService extends InsightRenderService {
  readonly prefix = 'lynx-insight';
  readonly editorAttentionClass = `${this.prefix}-attention`;
  readonly activeInsightClass = `action-overlay-active`;
  readonly cursorActiveClass = `cursor-active`;

  constructor(
    private readonly overlayService: LynxInsightOverlayService,
    private insightState: LynxInsightStateService
  ) {
    super();
  }

  /**
   * Renders the insights in the editor, applying formatting, action menus, and attention (opacity overlay).
   */
  render(insights: LynxInsight[], editor: Quill | undefined, rangeConverter: LynxRangeConverter): void {
    // Ensure text is more than just '\n'
    if (editor == null || editor.getLength() <= 1) {
      return;
    }

    this.refreshInsightFormatting(insights, editor, rangeConverter);
  }

  /**
   * Removes all lynx insight formatting from the editor.
   */
  removeAllInsightFormatting(editor: Quill): void {
    const formats: StringMap = {};

    for (const type of LynxInsightTypes) {
      formats[`${this.prefix}-${type}`] = null;
    }

    editor.formatText(0, editor.getLength(), formats);
  }

  /**
   * Creates a delta with all the insights' formatting applied, and sets the editor contents to that delta.
   * This avoids multiple calls to quill `formatText`, which will re-render the DOM after each call.
   */
  private refreshInsightFormatting(insights: LynxInsight[], editor: Quill, rangeConverter: LynxRangeConverter): void {
    // Group insights by type and range
    const insightsByTypeAndRange = new Map<string, Map<string, LynxInsight[]>>();

    for (const insight of insights) {
      // Translate dataRange to editorRange (adjust for note embeds)
      const editorRange = rangeConverter.dataRangeToEditorRange(insight.range);

      const typeKey = `${this.prefix}-${insight.type}`;
      const rangeKey = `${editorRange.index}:${editorRange.length}`;

      if (!insightsByTypeAndRange.has(typeKey)) {
        insightsByTypeAndRange.set(typeKey, new Map<string, LynxInsight[]>());
      }

      const rangeMap = insightsByTypeAndRange.get(typeKey)!;

      if (!rangeMap.has(rangeKey)) {
        rangeMap.set(rangeKey, []);
      }

      rangeMap.get(rangeKey)!.push(insight);
    }

    // Prepare formats to remove
    const formatsToRemove: StringMap = {};
    for (const type of LynxInsightTypes) {
      formatsToRemove[`${this.prefix}-${type}`] = null;
    }

    // Apply removal of formats
    let delta = new Delta().retain(editor.getLength(), formatsToRemove);

    // Apply formats by group, merging each format op with the result of the prev (let quill handle overlapping formats)
    for (const [typeKey, rangeMap] of insightsByTypeAndRange.entries()) {
      for (const [rangeKey, rangeInsights] of rangeMap.entries()) {
        const [indexStr, lengthStr] = rangeKey.split(':');
        const index = parseInt(indexStr, 10);
        const length = parseInt(lengthStr, 10);

        // Pass single insight or array based on count
        const formatValue = rangeInsights.length === 1 ? rangeInsights[0] : rangeInsights;

        const deltaToApply = new Delta().retain(index).retain(length, { [typeKey]: formatValue });

        delta = delta.compose(deltaToApply);
      }
    }

    // Update editor
    editor.updateContents(delta, 'api');
  }

  renderActionOverlay(insights: LynxInsight[], editor: Quill, actionOverlayActive: boolean): void {
    this.overlayService.close();
    let editorAttention = false;

    if (actionOverlayActive) {
      const leadingInsight: LynxInsight | undefined = getLeadingInsight(insights);
      const overlayAnchorInsight: LynxInsight | undefined = getMostNestedInsight(insights);

      if (leadingInsight != null && overlayAnchorInsight != null) {
        // Scroll to the first occurring active insight in the editor
        editor.setSelection(leadingInsight.range.index, 'api');

        const overlayAnchor: HTMLElement | null = this.getInsightElements(editor, overlayAnchorInsight.id)[0];

        if (overlayAnchor != null) {
          const ref: LynxInsightOverlayRef | undefined = this.overlayService.open(
            overlayAnchor,
            insights,
            new QuillLynxEditorAdapter(editor)
          );

          if (ref != null) {
            ref.closed$.pipe(take(1)).subscribe(() => {
              // Clear editor attention when overlay is closed
              this.setEditorAttention(false, editor);

              // Ensure display state matches closed overlay state
              this.insightState.updateDisplayState({ actionOverlayActive: false });
            });

            ref.hoverMultiInsight$
              .pipe(takeUntil(ref.closed$))
              .subscribe(insight => this.setEditorAttention(true, editor, insight != null ? [insight] : insights));
          }

          editorAttention = true;
        }
      }
    }

    this.setEditorAttention(editorAttention, editor, insights);
  }

  renderCursorActiveState(activeCursorInsightIds: string[], editor: Quill): void {
    // Clear previously set classes
    editor.root.querySelectorAll(`.${this.cursorActiveClass}`).forEach(element => {
      element.classList.remove(this.cursorActiveClass);
    });

    for (const insightId of activeCursorInsightIds) {
      for (const insightEl of this.getInsightElements(editor, insightId)) {
        insightEl.classList.add(this.cursorActiveClass);
      }
    }
  }

  private setEditorAttention(editorAttention: boolean, editor: Quill, insights?: LynxInsight[]): void {
    // Set attention class on editor (dims the editor)
    if (editorAttention) {
      editor.root.classList.add(this.editorAttentionClass);
    } else {
      editor.root.classList.remove(this.editorAttentionClass);
    }

    // Clear any previously set active insight classes
    editor.root.querySelectorAll(`.${this.activeInsightClass}`).forEach(element => {
      element.classList.remove(this.activeInsightClass);
    });

    // Set class on active insights to pull them above the editor dim overlay
    if (editorAttention && insights != null) {
      for (const insight of insights) {
        this.addActiveInsightClass(editor, insight.id);
      }
    }
  }

  private addActiveInsightClass(editor: Quill, insightId: string): void {
    // An insight may be split across multiple elements, so apply the class to all elements with the insight id
    for (const element of this.getInsightElements(editor, insightId)) {
      element.classList.add(this.activeInsightClass);
    }
  }

  /**
   * Get all lynx-insight elements in the editor whose `[data-insight-id]` contains the specified insight id.
   */
  private getInsightElements(editor: Quill, insightId: string): NodeListOf<HTMLElement> {
    // Use 'contains' selector to match elements with multiple ids
    // e.g. data-insight-id="id1,id2,id3"
    return editor.root.querySelectorAll(
      `${LynxInsightBlot.tagName}[data-${LynxInsightBlot.idAttributeName}*="${insightId}"]`
    );
  }
}
