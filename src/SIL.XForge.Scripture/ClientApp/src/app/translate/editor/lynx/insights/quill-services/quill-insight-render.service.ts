import { Injectable } from '@angular/core';
import Quill, { DeltaStatic, StringMap } from 'quill';
import { DeltaOperation } from 'rich-text';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxInsight, LynxInsightTypes } from '../lynx-insight';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';

const Delta: new (ops?: DeltaOperation[] | { ops: DeltaOperation[] }) => DeltaStatic = Quill.import('delta');

@Injectable({
  providedIn: 'root'
})
export class QuillInsightRenderService extends InsightRenderService {
  readonly prefix = 'lynx-insight';
  readonly editorAttentionClass = `${this.prefix}-attention`;

  constructor(private readonly overlayService: LynxInsightOverlayService) {
    super();
  }

  render(insights: LynxInsight[], editor: Quill | undefined): void {
    console.log('*** Render insights', insights);

    // Ensure text is more than just '\n'
    if (editor == null || editor.getLength() <= 1) {
      return;
    }

    this.refreshInsightFormatting(insights, editor);

    let actionMenuInsight: LynxInsight | undefined;

    for (const insight of insights) {
      if (this.renderActionMenu(insight, editor)) {
        actionMenuInsight = insight;
      }
    }

    this.setEditorAttention(actionMenuInsight, editor);
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

  private renderActionMenu(insight: LynxInsight, editor: Quill): boolean {
    if (!insight.displayState?.actionMenuActive) {
      this.overlayService.close(insight.id);
      return false;
    }

    const overlayAnchor: HTMLElement = this.getElementAtIndex(editor, insight.range.index + 1);
    this.overlayService.open(overlayAnchor, insight, editor.root);

    return true;
  }

  private setEditorAttention(insight: LynxInsight | undefined, editor: Quill): void {
    if (insight != null) {
      editor.root.classList.add(this.editorAttentionClass);
    } else {
      editor.root.classList.remove(this.editorAttentionClass);
    }
  }

  private getElementAtIndex(editor: Quill, index: number): HTMLElement {
    const [leaf] = editor.getLeaf(index);
    return leaf.domNode.nodeType === Node.TEXT_NODE ? leaf.parent.domNode : leaf;
  }
}
