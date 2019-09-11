import { VerseRef } from '../scripture-utils/verse-ref';

export function toVerseRef(verseRefData: VerseRefData): VerseRef | undefined {
  if (verseRefData == null) {
    return undefined;
  }
  return new VerseRef(
    verseRefData.bookNum,
    verseRefData.chapterNum,
    verseRefData.verse != null ? verseRefData.verse : verseRefData.verseNum
  );
}

export function fromVerseRef(input: VerseRef): VerseRefData | undefined {
  if (input == null || !input.valid) {
    return undefined;
  }
  return {
    bookNum: input.bookNum,
    chapterNum: input.chapterNum,
    verseNum: input.verseNum,
    verse: input.hasMultiple ? input.verse : undefined
  };
}

export function toStartAndEndVerseRefs(
  verseRefData: VerseRefData
): { startVerseRef?: VerseRef; endVerseRef?: VerseRef } {
  const verseRef = toVerseRef(verseRefData);
  if (verseRef == null) {
    return {};
  }
  let startVerseRef = verseRef;
  let endVerseRef: VerseRef | undefined;
  if (verseRef.hasMultiple) {
    const allVerses = verseRef.allVerses(true);
    startVerseRef = allVerses[0];
    endVerseRef = allVerses[allVerses.length - 1];
  }
  return { startVerseRef, endVerseRef };
}

export interface VerseRefData {
  bookNum: number;
  chapterNum: number;
  verseNum: number;
  verse?: string;
}
