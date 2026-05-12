/** The build confidences DTO */
export interface BuildConfidences {
  projectId: string;
  buildId: string;
  bookConfidences: BookConfidence[];
  chapterConfidences: ChapterConfidence[];
}

interface BookConfidence {
  bookNum: number;
  confidence: number;
  label: string;
  projectedChrF3: number;
  usability: number;
}

interface ChapterConfidence extends BookConfidence {
  chapterNum: number;
}
