import { Injectable } from '@angular/core';
import Quill, { Delta } from 'quill';
import { LynxInsightTypes } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { StringMap } from 'rich-text';
import { take, takeUntil } from 'rxjs';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxEditor } from '../lynx-editor';
import { LynxInsight } from '../lynx-insight';
import { LynxInsightOverlayRef, LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { getLeadingInsight, getMostNestedInsight } from '../lynx-insight-util';
import { LynxInsightBlot } from './blots/lynx-insight-blot';

@Injectable({
  providedIn: 'root'
})
export class QuillInsightRenderService extends InsightRenderService {
  readonly prefix = 'lynx-insight';
  readonly editorAttentionClass = `${this.prefix}-attention`;
  readonly activeInsightClass = `action-overlay-active`;
  readonly cursorActiveClass = `cursor-active`;

  constructor(private readonly overlayService: LynxInsightOverlayService) {
    super();
  }

  /**
   * Renders the insights in the editor, applying formatting, action menus, and attention (opacity overlay).
   */
  render(insights: LynxInsight[], editor: Quill | undefined): void {
    console.log('*** Render insights', insights);

    // Ensure text is more than just '\n'
    if (editor == null || editor.getLength() <= 1) {
      return;
    }

    this.refreshInsightFormatting(insights, editor);
  }

  /**
   * Removes all lynx insight formatting from the editor.
   */
  removeAllInsightFormatting(editor: Quill): void {
    const formats: StringMap = {};

    for (const type of LynxInsightTypes) {
      formats[`${this.prefix}-${type}`] = false;
    }

    editor.formatText(0, editor.getLength(), formats);
  }

  /**
   * Creates a delta with all the insights' formatting applied, and sets the editor contents to that delta.
   * This avoids multiple calls to quill `formatText`, which will re-render the DOM after each call.
   */
  private refreshInsightFormatting(insights: LynxInsight[], editor: Quill): void {
    const formatsToRemove: StringMap = {};

    // Prepare formats to remove
    for (const type of LynxInsightTypes) {
      formatsToRemove[`${this.prefix}-${type}`] = null;
    }

    // Apply removal of formats
    let delta = new Delta().retain(editor.getLength(), formatsToRemove);

    // Apply formats, merging each format op with the result of the prev (let quill handle overlapping formats)
    for (const insight of insights) {
      const deltaToApply = new Delta().retain(insight.range.index).retain(insight.range.length, {
        [`${this.prefix}-${insight.type}`]: insight
      });

      delta = delta.compose(deltaToApply);
    }

    // Update contents with the combined delta
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
            new LynxEditor(editor)
          );

          // Clear editor attention when overlay is closed
          if (ref != null) {
            ref.closed$.pipe(take(1)).subscribe(() => this.setEditorAttention(false, editor));
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
   * Get all elements in the editor that contain the `[data-insight-id]` of the specified insight.
   */
  private getInsightElements(editor: Quill, insightId: string): NodeListOf<HTMLElement> {
    return editor.root.querySelectorAll(`[data-${LynxInsightBlot.idAttributeName}="${insightId}"]`);
  }
}
