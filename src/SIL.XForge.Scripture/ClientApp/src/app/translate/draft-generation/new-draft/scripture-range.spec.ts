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
