import { Canon, VerseRef } from '@sillsdev/scripture';

export function toVerseRef(verseRefData: VerseRefData): VerseRef {
  return new VerseRef(
    Canon.bookNumberToId(verseRefData.bookNum),
    verseRefData.chapterNum.toString(),
    verseRefData.verse != null ? verseRefData.verse : verseRefData.verseNum.toString()
  );
}

export function fromVerseRef(input: VerseRef): VerseRefData {
  return {
    bookNum: input.bookNum,
    chapterNum: input.chapterNum,
    verseNum: input.verseNum,
    verse: input.verse === input.verseNum.toString() ? undefined : input.verse
  };
}

export function toStartAndEndVerseRefs(verseRefOrVerseRefData: VerseRefData | VerseRef): {
  startVerseRef: VerseRef;
  endVerseRef?: VerseRef;
} {
  const verseRef =
    verseRefOrVerseRefData instanceof VerseRef ? verseRefOrVerseRefData : toVerseRef(verseRefOrVerseRefData);
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
