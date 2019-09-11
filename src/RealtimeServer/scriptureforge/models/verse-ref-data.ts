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

export function toStartAndEndVerseRefs(verseRefData: VerseRefData): [VerseRef?, VerseRef?] {
  const verseRef = toVerseRef(verseRefData);
  if (verseRef == null) {
    return [undefined, undefined];
  }
  let startRef = verseRef;
  let endRef: VerseRef | undefined;
  if (verseRef.hasMultiple) {
    const allVerses = verseRef.allVerses(true);
    startRef = allVerses[0];
    endRef = allVerses[allVerses.length - 1];
  }
  return [startRef, endRef];
}

export interface VerseRefData {
  bookNum: number;
  chapterNum: number;
  verseNum: number;
  verse?: string;
}
