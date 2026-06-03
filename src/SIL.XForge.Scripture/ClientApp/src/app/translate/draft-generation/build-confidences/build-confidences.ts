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
  label: UsabilityLabel;
  projectedChrF3: number;
  usability: number;
}

export interface BookConfidence extends Confidence {
  bookNum: number;
}

export interface ChapterConfidence extends BookConfidence {
  chapterNum: number;
}

/** The usability label */
export enum UsabilityLabel {
  Red = 'Red',
  Yellow = 'Yellow',
  Green = 'Green'
}
