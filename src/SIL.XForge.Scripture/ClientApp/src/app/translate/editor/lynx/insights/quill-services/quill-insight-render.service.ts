import { Injectable } from '@angular/core';
import Quill, { DeltaStatic, StringMap } from 'quill';
import { LynxInsightTypes } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { DeltaOperation } from 'rich-text';
import { take } from 'rxjs';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxInsight } from '../lynx-insight';
import { LynxInsightOverlayRef, LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { getLeadingInsight, getMostNestedInsight } from '../lynx-insight-util';

const Delta: new (ops?: DeltaOperation[] | { ops: DeltaOperation[] }) => DeltaStatic = Quill.import('delta');

@Injectable({
  providedIn: 'root'
})
export class QuillInsightRenderService extends InsightRenderService {
  readonly prefix = 'lynx-insight';
  readonly editorAttentionClass = `${this.prefix}-attention`;
  readonly activeInsightClass = `action-overlay-active`;

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
    let delta: DeltaStatic = editor.getContents();
    const formatsToRemove: StringMap = {};

    // Prepare formats to remove
    for (const type of LynxInsightTypes) {
      formatsToRemove[`${this.prefix}-${type}`] = null;
    }

    // Apply removal of formats
    delta = delta.compose(new Delta().retain(delta.length(), formatsToRemove));

    // Apply formats, merging each format op with the result of the prev (let quill handle overlapping formats)
    for (const insight of insights) {
      const deltaToApply = new Delta().retain(insight.range.index).retain(insight.range.length, {
        [`${this.prefix}-${insight.type}`]: insight
      });

      delta = delta.compose(deltaToApply);
    }

    // Set contents with the combined delta
    editor.setContents(delta, 'api');
  }

  renderActionOverlay(insights: LynxInsight[], editor: Quill, actionOverlayActive: boolean): void {
    this.overlayService.closeAll();
    let editorAttention = false;

    if (actionOverlayActive) {
      const leadingInsight: LynxInsight | undefined = getLeadingInsight(insights);
      const overlayAnchorInsight: LynxInsight | undefined = getMostNestedInsight(insights);

      if (leadingInsight != null && overlayAnchorInsight != null) {
        // Scroll to the first occurring active insight in the editor
        editor.setSelection(leadingInsight.range.index, 'api');

        const overlayAnchor: HTMLElement | null = this.getElementAtIndex(editor, overlayAnchorInsight.range.index + 1);

        if (overlayAnchor != null) {
          const ref: LynxInsightOverlayRef | undefined = this.overlayService.open(overlayAnchor, insights, editor.root);

          // Clear editor attention when overlay is closed
          if (ref != null) {
            ref.closed$.pipe(take(1)).subscribe(() => this.setEditorAttention(false, editor));
          }

          editorAttention = true;
        }
      }
    }

    this.setEditorAttention(editorAttention, editor, insights);
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
        const element: HTMLElement | null = this.getElementAtIndex(editor, insight.range.index);
        element?.classList.add(this.activeInsightClass);
      }
    }
  }

  private getElementAtIndex(editor: Quill, index: number): HTMLElement | null {
    const [leaf] = editor.getLeaf(index + 1);

    if (leaf == null) {
      return null;
    }

    return leaf.domNode.nodeType === Node.TEXT_NODE ? leaf.parent.domNode : leaf;
  }
}
