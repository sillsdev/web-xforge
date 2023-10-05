import { VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';

const scopes = ['all', 'book', 'chapter'] as const;
export type QuestionScope = (typeof scopes)[number];

export function isQuestionScope(scope: any): scope is QuestionScope {
  return scopes.includes(scope);
}

export interface BookChapter {
  bookNum?: number;
  chapterNum?: number;
}

export function bookChapterMatchesVerseRef(bookChapter: BookChapter, verseRef: VerseRefData): boolean {
  return verseRef.bookNum === bookChapter.bookNum && verseRef.chapterNum === bookChapter.chapterNum;
}
