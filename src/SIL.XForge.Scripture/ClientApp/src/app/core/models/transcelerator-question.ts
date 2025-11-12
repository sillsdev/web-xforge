/** Represents a question from Transcelerator that can be imported. */
export interface TransceleratorQuestion {
  book: string;
  startChapter: string;
  startVerse: string;
  endChapter?: string;
  endVerse?: string;
  text: string;
  id: string;
}
