import { Injectable } from '@angular/core';
import Quill, { StringMap } from 'quill';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxInsight, LynxInsightTypes } from '../lynx-insight';
import { LynxInsightOverlayService } from '../lynx-insight-overlay.service';

@Injectable({
  providedIn: 'root'
})
export class QuillInsightRenderService extends InsightRenderService {
  readonly prefix = 'lynx-insight';
  readonly editorAttentionClass = `${this.prefix}-attention`;

  constructor(private readonly overlayService: LynxInsightOverlayService) {
    super();
  }

  // TODO: Render just display state changes if insight ids haven't changed?

  render(insights: LynxInsight[], editor: Quill | undefined): void {
    console.log('*** Render insights', insights);

    // Ensure text is more than just '\n'
    if (editor == null || editor.getLength() <= 1) {
      return;
    }

    // TODO: Ensure this is needed so that editor is fresh when adding/removing insights?
    this.removeAllInsightFormatting(editor);

    let actionMenuInsight: LynxInsight | undefined;

    for (const insight of insights) {
      this.renderInsight(insight, editor);

      if (this.renderActionMenu(insight, editor)) {
        actionMenuInsight = insight;
      }
    }

    this.setEditorAttention(actionMenuInsight, editor);
  }

  private renderInsight(insight: LynxInsight, editor: Quill): void {
    editor.formatText(insight.range.index, insight.range.length, `${this.prefix}-${insight.type}`, insight, 'api');
  }

  private renderActionMenu(insight: LynxInsight, editor: Quill): boolean {
    if (!insight.displayState?.actionMenuActive) {
      this.overlayService.close(insight.id);
      return false;
    }

    const overlayAnchor = this.getElementAtIndex(editor, insight.range.index + 1);
    this.overlayService.open(overlayAnchor, insight);

    return true;
  }

  private removeAllInsightFormatting(editor: Quill): void {
    const formats: StringMap = {};

    for (const type of LynxInsightTypes) {
      formats[`${this.prefix}-${type}`] = false;
    }

    editor.formatText(0, editor.getLength(), formats);
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
