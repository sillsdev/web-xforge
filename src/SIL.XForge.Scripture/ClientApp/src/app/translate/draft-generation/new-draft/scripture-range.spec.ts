import { ChapterSet, VerboseScriptureRange } from './scripture-range';

describe('ScriptureRange', () => {
  describe('ChapterSet', () => {
    it('parses ranges and single chapters correctly and round-trips toString', () => {
      const cs = new ChapterSet('1-3,7,10-12');
      expect([...cs.chapters!].sort((a, b) => a - b)).toEqual([1, 2, 3, 7, 10, 11, 12]);
      expect(cs.toString()).toBe('1-3,7,10-12');
    });

    it('handles a single chapter', () => {
      const cs = new ChapterSet('5');
      expect([...cs.chapters!]).toEqual([5]);
      expect(cs.toString()).toBe('5');
    });

    it('toStringForDisplay adds a space after each separator', () => {
      expect(new ChapterSet('1-3,7,10-12').toStringForDisplay()).toBe('1-3, 7, 10-12');
      expect(new ChapterSet('5').toStringForDisplay()).toBe('5');
      expect(new ChapterSet('').toStringForDisplay()).toBe('');
    });

    it('throws on invalid tokens', () => {
      expect(() => new ChapterSet('1-3,foo')).toThrowError(/Invalid chapter range/);
    });

    it('throws on a malformed range with more than one separator', () => {
      // Must not silently truncate "1-3-5" to "1-3".
      expect(() => new ChapterSet('1-3-5')).toThrowError(/Invalid chapter range/);
    });

    it('throws when start > end', () => {
      expect(() => new ChapterSet('5-3')).toThrowError(/Start chapter must be less than or equal to end chapter/);
    });

    it('computes intersection correctly', () => {
      const cs1 = new ChapterSet('1-5,7,10-12');
      const cs2 = new ChapterSet('3-4,7-8,10');
      const intersection = cs1.intersection(cs2);
      expect([...intersection.chapters!].sort((a, b) => a - b)).toEqual([3, 4, 7, 10]);
      expect(intersection.toString()).toBe('3-4,7,10');
    });
  });

  describe('ChapterSet.fromUserInput', () => {
    it('accepts the looser input styles a keyboard can produce, canonicalizing them', () => {
      // Maps a user-typed string to the canonical range it should parse to (via toString()). fromUserInput accepts a
      // looser style than the strict constructor, so a user doesn't have to type the exact serialized form.
      const validCases: { [input: string]: string } = {
        // --- Canonical forms still parse (sanity) ---
        '5': '5',
        '1-5': '1-5',
        '1-5,8,11-13': '1-5,8,11-13',
        '': '',

        // --- Whitespace around commas is tolerated ---
        '1-5, 8': '1-5,8',
        '1-5, 8, 11-13': '1-5,8,11-13',
        '1 ,2, 3': '1-3',
        '  1 ,  2 , 3  ': '1-3',

        // --- Whitespace around the hyphen is tolerated ---
        '1 - 5': '1-5',
        '1- 5': '1-5',
        '1 -5': '1-5',
        ' 1 - 5 ': '1-5',

        // --- Tabs and other whitespace are tolerated ---
        '1\t-\t5': '1-5',
        '\t1, 2\t': '1-2',

        // --- "Fullwidth" digits, comma, and hyphen are folded to ASCII. East Asian input methods (Chinese,
        //     Japanese, Korean) have a fullwidth mode that types wide variants of ASCII keys, e.g. the "1" key
        //     produces "１" and the comma key "，". ---
        '１－５': '1-5', // fullwidth digits + fullwidth hyphen
        '１，２': '1-2', // fullwidth comma
        '１-５, ８': '1-5,8', // fullwidth digits with an ASCII hyphen and comma

        // --- Comma keys from non-Latin layouts act as the list separator ---
        '1、2': '1-2', // ideographic comma (Japanese/Chinese)
        '1،2': '1-2', // Arabic comma

        // --- Digits from non-Latin keyboards are mapped to ASCII ---
        '١-٥': '1-5', // Arabic-Indic
        '۱-۵': '1-5', // Extended Arabic-Indic (Persian / Urdu)
        '१-५': '1-5', // Devanagari
        '১-৫': '1-5', // Bengali
        '๑-๕': '1-5', // Thai

        // --- Empty tokens from leading / trailing / doubled commas are dropped ---
        '1,2,': '1-2',
        ',1,2': '1-2',
        '1,,2': '1-2',
        '1, ,2': '1-2',
        '   ': '', // whitespace-only collapses to the empty set

        // --- Result is canonicalized: sorted, merged, de-duplicated ---
        '3,1,2': '1-3',
        '1-3,2-4': '1-4',
        '10-12,1': '1,10-12',
        '5,5': '5',
        '1-5,3': '1-5',

        // --- Several tolerated variations combined in one input: Arabic digits, Arabic comma, fullwidth hyphen,
        //     a doubled comma, and surrounding spaces ---
        '  ٣ ، ١－٢ ,, 5 ': '1-3,5'
      };

      for (const [input, expected] of Object.entries(validCases)) {
        expect(ChapterSet.fromUserInput(input).toString())
          .withContext(`input ${JSON.stringify(input)}`)
          .toBe(expected);
      }
    });

    it('still rejects genuinely malformed input', () => {
      // Maps a malformed user-typed string to the error message it must still be rejected with — leniency must not
      // slip into silently accepting (or truncating) genuinely bad input.
      const errorCases: { [input: string]: RegExp } = {
        // --- Too many separators (must not truncate, e.g. "1-3-5" -> "1-3") ---
        '1-3-5': /Invalid chapter range/,
        '1 - 3 - 5': /Invalid chapter range/,
        '1-2-3-4': /Invalid chapter range/,

        // --- Dashes that are not a single keystroke on a normal keyboard (they come from autocorrect or copy-paste,
        //     not a key) are intentionally NOT accepted ---
        '1–5': /Invalid chapter range/, // en dash
        '1—5': /Invalid chapter range/, // em dash
        '1−5': /Invalid chapter range/, // minus sign

        // --- Non-numeric or stray characters ---
        abc: /Invalid chapter range/,
        '1-foo': /Invalid chapter range/,
        '1.5': /Invalid chapter range/,
        '1;2': /Invalid chapter range/,
        '1:5': /Invalid chapter range/,

        // --- Incomplete ranges ---
        '1-': /Invalid chapter range/,
        '-5': /Invalid chapter range/,
        '1 - ': /Invalid chapter range/,

        // --- Whitespace inside a number is ambiguous, so rejected (not silently joined into "12") ---
        '1 2': /Invalid chapter range/,
        '1 0 - 1 2': /Invalid chapter range/,

        // --- Reversed ranges ---
        '5-3': /Start chapter must be less than or equal to/,
        '10 - 2': /Start chapter must be less than or equal to/
      };

      for (const [input, expectedError] of Object.entries(errorCases)) {
        expect(() => ChapterSet.fromUserInput(input))
          .withContext(`input ${JSON.stringify(input)}`)
          .toThrowError(expectedError);
      }
    });
  });

  describe('ScriptureRange', () => {
    it('creates an empty range when no input', () => {
      const range = new VerboseScriptureRange('');
      expect(range.books).toEqual(new Map());
      expect(range.toString()).toBe('');
    });

    it('parses multiple books and round-trips toString', () => {
      const range = new VerboseScriptureRange('GEN1-3,5;EXO2;LEV1-28');
      expect(range.toString()).toBe('GEN1-3,5;EXO2;LEV1-28');
    });

    it('computes intersection correctly', () => {
      const range1 = new VerboseScriptureRange('GEN1-5,7;EXO2-4');
      const range2 = new VerboseScriptureRange('GEN3-4,6;EXO3;LEV1-2');
      const intersection = range1.intersection(range2);
      expect(intersection.toString()).toBe('GEN3-4;EXO3');
    });

    it('computes union correctly', () => {
      const range1 = new VerboseScriptureRange('GEN1-5,7;EXO2-4');
      const range2 = new VerboseScriptureRange('GEN3-4,6;EXO3;LEV1-2');
      const union = range1.union(range2);
      expect(union.toString()).toBe('GEN1-7;EXO2-4;LEV1-2');
    });

    it('computes difference correctly', () => {
      const range1 = new VerboseScriptureRange('GEN1-5,7;EXO2-4');
      const range2 = new VerboseScriptureRange('GEN3-4,6;EXO3;LEV1-2');
      const difference = range1.difference(range2);
      expect(difference.toString()).toBe('GEN1-2,5,7;EXO2,4');
    });
  });
});
