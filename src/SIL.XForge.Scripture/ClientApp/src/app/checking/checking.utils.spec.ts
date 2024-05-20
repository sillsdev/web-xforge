import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { getAudioTimings, getAudioTimingWithHeadings } from './checking-test.utils';
import {
  BookChapter,
  bookChapterMatchesVerseRef,
  CheckingUtils,
  isQuestionScope,
  QuestionScope
} from './checking.utils';

describe('CheckingUtils', () => {
  let env: TestEnvironment;
  beforeAll(() => {
    env = new TestEnvironment();
  });

  it('can parse audio text ref', () => {
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingBasic, 0)).toEqual(undefined);
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingBasic, 0.9)).toEqual({ verseStr: '1' });
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingBasic, 1.9)).toEqual({ verseStr: '2' });
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingBasic, 2.9)).toEqual({ verseStr: '3-4' });
  });

  it('can parse phrase level audio timing files', () => {
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingPhraseLevel, 0.4)).toEqual({ verseStr: '1' });
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingPhraseLevel, 0.9)).toEqual({ verseStr: '1' });
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingPhraseLevel, 1.4)).toEqual({ verseStr: '2' });
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingPhraseLevel, 1.9)).toEqual({ verseStr: '2' });
  });

  it('can parse phrase level audio timing files with letters', () => {
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingPhraseLevelLetters, 0.4)).toEqual({
      verseStr: '1',
      phrase: 'a'
    });
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingPhraseLevelLetters, 0.9)).toEqual({
      verseStr: '1',
      phrase: 'b'
    });
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingPhraseLevelLetters, 1.4)).toEqual({
      verseStr: '2',
      phrase: 'a'
    });
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingPhraseLevelLetters, 1.9)).toEqual({
      verseStr: '2',
      phrase: 'b'
    });
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingPhraseLevelLetters, 2.4)).toEqual({
      verseStr: '3a',
      phrase: 'a'
    });
    expect(CheckingUtils.parseAudioRefByTime(env.audioTimingPhraseLevelLetters, 2.9)).toEqual({
      verseStr: '3a',
      phrase: 'b'
    });
  });

  it('can parse audio heading ref', () => {
    // audio timing files should only ever have 1 chapter
    expect(CheckingUtils.parseAudioHeadingRefByTime(env.audioTimingHearThis, 0.0)).toEqual(undefined);
    expect(CheckingUtils.parseAudioHeadingRefByTime(env.audioTimingHearThis, 0.1)).toEqual({
      label: 'c',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRefByTime(env.audioTimingHearThis, 0.5)).toEqual({
      label: 'ms',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRefByTime(env.audioTimingHearThis, 1.0)).toEqual({
      label: 's',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRefByTime(env.audioTimingHearThis, 2.0)).toEqual({
      label: 's',
      iteration: 2
    });
  });

  it('can parse audio heading ref no iteration values', () => {
    expect(CheckingUtils.parseAudioHeadingRefByTime(env.audioTimingHeadings, 0.75)).toEqual({
      label: 's',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRefByTime(env.audioTimingHeadings, 2.25)).toEqual({
      label: 's',
      iteration: 2
    });
  });
});

describe('Misc checking functions', () => {
  describe('isQuestionScope', () => {
    it('should return true for valid question scopes', () => {
      expect(isQuestionScope('all')).toBe(true);
      expect(isQuestionScope('book')).toBe(true);
      expect(isQuestionScope('chapter')).toBe(true);
    });

    it('should return false for invalid question scopes', () => {
      expect(isQuestionScope('books')).toBe(false);
      expect(isQuestionScope('')).toBe(false);
      expect(isQuestionScope(0)).toBe(false);
      expect(isQuestionScope(null)).toBe(false);
      expect(isQuestionScope(undefined)).toBe(false);
    });

    it('should correctly identify the type', () => {
      const scope: unknown = 'book';

      if (isQuestionScope(scope)) {
        const questionScope: QuestionScope = scope;
        expect(questionScope).toBe('book');
      } else {
        fail('Expected to be a valid question scope');
      }
    });
  });

  describe('bookChapterMatchesVerseRef', () => {
    it('should return true when book and chapter match', () => {
      const bookChapter: BookChapter = { bookNum: 1, chapterNum: 2 };
      const verseRef: VerseRefData = { bookNum: 1, chapterNum: 2, verseNum: 3 };
      expect(bookChapterMatchesVerseRef(bookChapter, verseRef)).toBe(true);
    });

    it('should return false when book or chapter do not match', () => {
      let bookChapter: BookChapter = { bookNum: 1, chapterNum: 2 };
      let verseRef: VerseRefData = { bookNum: 1, chapterNum: 3, verseNum: 2 };
      expect(bookChapterMatchesVerseRef(bookChapter, verseRef)).toBe(false);

      bookChapter = { bookNum: 2, chapterNum: 3 };
      verseRef = { bookNum: 1, chapterNum: 3, verseNum: 2 };
      expect(bookChapterMatchesVerseRef(bookChapter, verseRef)).toBe(false);

      bookChapter = { bookNum: undefined, chapterNum: 3 };
      verseRef = { bookNum: 0, chapterNum: 3, verseNum: 2 };
      expect(bookChapterMatchesVerseRef(bookChapter, verseRef)).toBe(false);

      bookChapter = { bookNum: 1, chapterNum: undefined };
      verseRef = { bookNum: 1, chapterNum: 0, verseNum: 2 };
      expect(bookChapterMatchesVerseRef(bookChapter, verseRef)).toBe(false);
    });
  });
});

class TestEnvironment {
  audioTimingBasic: AudioTiming[] = getAudioTimings();
  audioTimingHeadings: AudioTiming[] = getAudioTimingWithHeadings();
  audioTimingHearThis: AudioTiming[] = [
    { textRef: 'c', from: 0.1, to: 0.5 },
    { textRef: 'ms1', from: 0.5, to: 1.0 },
    { textRef: 's1', from: 1.0, to: 1.5 },
    { textRef: '1', from: 1.5, to: 2.0 },
    { textRef: 's2', from: 2.0, to: 2.5 },
    { textRef: '2', from: 2.5, to: 3.0 },
    { textRef: '3', from: 3.0, to: 3.5 }
  ];
  audioTimingPhraseLevel: AudioTiming[] = [
    { textRef: '1', from: 0.0, to: 0.5 },
    { textRef: '', from: 0.5, to: 1.0 },
    { textRef: '2', from: 1.0, to: 1.5 },
    { textRef: '', from: 1.5, to: 2.0 },
    { textRef: '3', from: 2.0, to: 2.5 }
  ];

  audioTimingPhraseLevelLetters: AudioTiming[] = [
    { textRef: '1a', from: 0.0, to: 0.5 },
    { textRef: '1b', from: 0.5, to: 1.0 },
    { textRef: '2a', from: 1.0, to: 1.5 },
    { textRef: '2b', from: 1.5, to: 2.0 },
    { textRef: '3aa', from: 2.0, to: 2.5 },
    { textRef: '3ab', from: 2.5, to: 3.0 }
  ];

  constructor() {}
}
