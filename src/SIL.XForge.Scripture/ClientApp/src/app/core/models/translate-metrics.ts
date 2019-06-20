export type TranslateMetricsType = 'edit' | 'navigate';
export type EditEndEvent = 'segment-change' | 'timeout' | 'task-exit';

export interface TranslateMetrics {
  id: string;
  type: TranslateMetricsType;
  sessionId: string;
  bookId: string;
  chapter: number;

  // editing metrics
  segment?: string;
  sourceWordCount?: number;
  targetWordCount?: number;
  keyBackspaceCount?: number;
  keyDeleteCount?: number;
  keyCharacterCount?: number;
  productiveCharacterCount?: number;
  suggestionAcceptedCount?: number;
  suggestionTotalCount?: number;
  timeEditActive?: number;
  editEndEvent?: EditEndEvent;

  // navigation metrics
  keyNavigationCount?: number;
  mouseClickCount?: number;
}
