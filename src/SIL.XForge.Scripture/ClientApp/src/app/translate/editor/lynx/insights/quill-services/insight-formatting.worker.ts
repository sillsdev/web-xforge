import * as Comlink from 'comlink';
import Delta from 'quill-delta';
import { FormatOperation, processFormatOperations } from './insight-formatting-utils';

/**
 * Interface for the insight formatting worker api.
 * Shared between worker implementation and service usage.
 */
export interface InsightFormattingWorkerApi {
  formatInsights(
    editorLength: number,
    formatsToRemove: { [key: string]: null },
    formatOperations: FormatOperation[]
  ): Promise<Delta>;
}

class InsightFormattingWorker implements InsightFormattingWorkerApi {
  async formatInsights(
    editorLength: number,
    formatsToRemove: { [key: string]: null },
    formatOperations: FormatOperation[]
  ): Promise<Delta> {
    try {
      // Apply removal of formats
      const delta: Delta = new Delta().retain(editorLength, formatsToRemove);

      return processFormatOperations(delta, formatOperations);
    } catch (error) {
      console.error('Worker: Error in formatInsights:', error);
      throw error;
    }
  }
}

const worker = new InsightFormattingWorker();
Comlink.expose(worker);
