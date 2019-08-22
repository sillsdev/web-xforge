import { VerseRef } from './scripture/verse-ref';

export interface VerseRefData {
  book?: string;
  chapter?: string;
  verse?: string;
  versification?: string;
}

export class VerseRefFunctions {
  static fromData(verseRefData: VerseRefData): VerseRef {
    let result: string = verseRefData.book ? verseRefData.book : '';
    result += verseRefData.chapter ? ' ' + verseRefData.chapter : '';
    result += verseRefData.verse ? ':' + verseRefData.verse : '';
    return VerseRef.fromStr(result);
  }

  static verseRefDataToString(verseRefData: VerseRefData): string {
    let result: string = verseRefData.book ? verseRefData.book : '';
    result += verseRefData.chapter ? ' ' + verseRefData.chapter : '';
    result += verseRefData.verse ? ':' + verseRefData.verse : '';
    return result;
  }

  static verseRefToVerseRefData(input: VerseRef): VerseRefData {
    const refData: VerseRefData = {};
    refData.book = input.book;
    refData.chapter = input.chapter;
    refData.verse = input.verse;
    refData.versification = input.versification.name;
    return refData;
  }
}
