import { VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';

/** The build confidences DTO */
export interface BuildConfidences {
  projectId: string;
  buildId: string;
  bookConfidences: BookConfidence[];
  chapterConfidences: ChapterConfidence[];
  verseConfidences: VerseConfidence[];
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

export interface VerseConfidence extends VerseRefData, Confidence {}
