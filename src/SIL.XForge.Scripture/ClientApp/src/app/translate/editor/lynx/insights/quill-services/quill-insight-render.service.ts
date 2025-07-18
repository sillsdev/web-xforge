import { Injectable, OnDestroy } from '@angular/core';
import * as Comlink from 'comlink';
import Quill, { Delta } from 'quill';
import { LynxInsightTypes } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { StringMap } from 'rich-text';
import { take, takeUntil } from 'rxjs';
import { InsightRenderService } from '../base-services/insight-render.service';
import { LynxTextModelConverter } from '../lynx-editor';
import { LynxInsight } from '../lynx-insight';
import { LynxInsightOverlayRef, LynxInsightOverlayService } from '../lynx-insight-overlay.service';
import { LynxInsightStateService } from '../lynx-insight-state.service';
import { getLeadingInsight, getMostNestedInsight } from '../lynx-insight-util';
import { LynxInsightBlot } from './blots/lynx-insight-blot';
import { FormatOperation, processFormatOperations, WorkerLynxInsight } from './insight-formatting-utils';
import { InsightFormattingWorkerApi } from './insight-formatting.worker';
import { QuillLynxEditorAdapter } from './quill-lynx-editor-adapter';

@Injectable({
  providedIn: 'root'
})
export class QuillInsightRenderService extends InsightRenderService implements OnDestroy {
  readonly prefix = 'lynx-insight';
  readonly editorAttentionClass = `${this.prefix}-attention`;
  readonly activeInsightClass = `action-overlay-active`;
  readonly cursorActiveClass = `cursor-active`;

  private workerApi?: Comlink.Remote<InsightFormattingWorkerApi>;

  constructor(
    private readonly overlayService: LynxInsightOverlayService,
    private insightState: LynxInsightStateService
  ) {
    super();

    // Create worker if browser supports it
    if (Worker != null) {
      try {
        const worker = new Worker(new URL('./insight-formatting.worker', import.meta.url));
        this.workerApi = Comlink.wrap<InsightFormattingWorkerApi>(worker);
      } catch (error) {
        // Log the error for debugging but continue gracefully
        console.error('Failed to initialize insight-formatting worker:', error);
      }
    }
  }

  /**
   * Renders the insights in the editor, applying formatting, action menus, and attention (opacity overlay).
   */
  render(insights: LynxInsight[], editor: Quill | undefined): void {
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
      formats[`${this.prefix}-${type}`] = null;
    }

    editor.formatText(0, editor.getLength(), formats);
  }

  /**
   * Creates a delta with all the insights' formatting applied, and sets the editor contents to that delta.
   * This avoids multiple calls to quill `formatText`, which will re-render the DOM after each call.
   */
  private async refreshInsightFormatting(insights: LynxInsight[], editor: Quill): Promise<void> {
    const formatsToRemove: StringMap = this.getFormatsToRemove();
    const formatOperations: FormatOperation[] = this.prepareFormatOperations(insights);

    let resultDelta: Delta | null = null;

    // Try worker first if available
    if (this.workerApi != null) {
      try {
        resultDelta = await this.workerApi.formatInsights(editor.getLength(), formatsToRemove, formatOperations);
      } catch (error) {
        // Worker failed, will fall back to main thread below
        console.error('Insight formatting worker failed, falling back to main thread processing.', error);
      }
    }

    // Use main thread if worker unavailable or failed
    resultDelta ??= this.formatInsightsOnMainThread(editor.getLength(), formatsToRemove, formatOperations);

    // Update editor
    editor.updateContents(resultDelta, 'api');
  }

  ngOnDestroy(): void {
    if (this.workerApi != null) {
      this.workerApi[Comlink.releaseProxy]();
    }
  }

  private getFormatsToRemove(): StringMap {
    const formatsToRemove: StringMap = {};
    for (const type of LynxInsightTypes) {
      formatsToRemove[`${this.prefix}-${type}`] = null;
    }
    return formatsToRemove;
  }

  private prepareFormatOperations(insights: LynxInsight[]): FormatOperation[] {
    // Group insights by type and range
    const insightsByTypeAndRange = new Map<string, Map<string, LynxInsight[]>>();

    for (const insight of insights) {
      const typeKey: string = `${this.prefix}-${insight.type}`;
      const rangeKey: string = `${insight.range.index}:${insight.range.length}`;

      if (!insightsByTypeAndRange.has(typeKey)) {
        insightsByTypeAndRange.set(typeKey, new Map<string, LynxInsight[]>());
      }

      const rangeMap: Map<string, LynxInsight[]> = insightsByTypeAndRange.get(typeKey)!;

      if (!rangeMap.has(rangeKey)) {
        rangeMap.set(rangeKey, []);
      }

      rangeMap.get(rangeKey)!.push(insight);
    }

    const formatOperations: FormatOperation[] = [];

    for (const [typeKey, rangeMap] of insightsByTypeAndRange.entries()) {
      for (const [rangeKey, rangeInsights] of rangeMap.entries()) {
        const [indexStr, lengthStr]: string[] = rangeKey.split(':');
        const index: number = Number.parseInt(indexStr, 10);
        const length: number = Number.parseInt(lengthStr, 10);
        const formatValue: WorkerLynxInsight[] = rangeInsights as WorkerLynxInsight[];

        formatOperations.push({
          typeKey,
          index,
          length,
          formatValue
        });
      }
    }

    return formatOperations;
  }

  private formatInsightsOnMainThread(
    editorLength: number,
    formatsToRemove: StringMap,
    formatOperations: FormatOperation[]
  ): Delta {
    // Apply removal of formats
    const baseDelta: Delta = new Delta().retain(editorLength, formatsToRemove);

    return processFormatOperations(baseDelta, formatOperations);
  }

  renderActionOverlay(
    insights: LynxInsight[],
    editor: Quill,
    textModelConverter: LynxTextModelConverter,
    actionOverlayActive: boolean
  ): void {
    this.overlayService.close();
    let editorAttention: boolean = false;

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
            new QuillLynxEditorAdapter(editor),
            textModelConverter
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
