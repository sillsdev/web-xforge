import { ChapterSet, ScriptureRange, ScriptureRangeBook } from './scripture-range';

fdescribe('ScriptureRange', () => {
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

  describe('ScriptureRangeBook', () => {
    it('creates a book with no chapters when range omitted', () => {
      const book = new ScriptureRangeBook('MAT');
      expect(book.bookId).toBe('MAT');
      expect(book.chapters).toBeUndefined();
      expect(book.toString()).toBe('MAT');
    });

    it('parses book id and chapters and round-trips toString', () => {
      const book = new ScriptureRangeBook('MRK', '1-2,4');
      expect(book.toString()).toBe('MRK1-2,4');
    });
  });

  describe('ScriptureRange', () => {
    it('creates an empty range when no input', () => {
      const range = new ScriptureRange([]);
      expect(range.books).toEqual([]);
      expect(range.toString()).toBe('');
    });

    it('parses multiple books and round-trips toString', () => {
      const range = new ScriptureRange('GEN1-3,5;EXO2;LEV');
      expect(range.toString()).toBe('GEN1-3,5;EXO2;LEV');
    });
  });
});
