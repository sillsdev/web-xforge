/** The build confidences DTO */
export interface BuildConfidences {
  projectId: string;
  buildId: string;
  bookConfidences: BookConfidence[];
  chapterConfidences: ChapterConfidence[];
  lowestConfidence?: Confidence;
}

/** The confidence values */
export interface Confidence {
  confidence: number;
}

export interface BookConfidence extends Confidence {
  bookNum: number;
}

export interface ChapterConfidence extends BookConfidence {
  chapterNum: number;
}
