import { VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from './verse-ref';

export function verseRefDataToVerseRef(verseRefData: VerseRefData): VerseRef {
  return VerseRef.fromStr(verseRefDataToString(verseRefData));
}

export function verseRefDataToString(verseRefData: VerseRefData): string {
  if (verseRefData == null) {
    return '';
  }
  let result: string = verseRefData.book ? verseRefData.book : '';
  result += verseRefData.chapter ? ' ' + verseRefData.chapter : '';
  result += verseRefData.verse ? ':' + verseRefData.verse : '';
  return result;
}

export function verseRefToVerseRefData(input: VerseRef): VerseRefData {
  if (input == null || input.verseNum <= 0) {
    return undefined;
  }
  return {
    book: input.book,
    chapter: input.chapter,
    verse: input.verse,
    versification: input.versification.name
  };
}
