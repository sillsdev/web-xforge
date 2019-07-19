export interface SFProjectUserConfig {
  ownerRef: string;
  selectedTask?: string;
  selectedBookId?: string;
  selectedChapter?: number;
  isTargetTextRight?: boolean;
  confidenceThreshold?: number;
  isSuggestionsEnabled?: boolean;
  selectedSegment?: string;
  selectedSegmentChecksum?: number;
  questionRefsRead?: string[];
  answerRefsRead?: string[];
  commentRefsRead?: string[];
}
