import { formatBookListForSILNLP } from './draft-request-detail-utils';

function createRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

describe('formatBookListForSILNLP', () => {
  it('should format a list of books with all OT books as "OT"', () => {
    const otBooks = createRange(1, 39);
    const formatted = formatBookListForSILNLP(otBooks);
    expect(formatted).toBe('OT');
  });

  it('should format a list of books with all NT books as "NT"', () => {
    const ntBooks = createRange(40, 66);
    const formatted = formatBookListForSILNLP(ntBooks);
    expect(formatted).toBe('NT');
  });

  it('should format a mixed list of books correctly', () => {
    const books = [1, 2, 40, 41, 50];
    const formatted = formatBookListForSILNLP(books);
    expect(formatted).toBe('GEN;EXO;MAT;MRK;PHP');
  });

  it('should format an empty list as an empty string', () => {
    const formatted = formatBookListForSILNLP([]);
    expect(formatted).toBe('');
  });

  it('should format a list with all OT and NT books as "OT;NT"', () => {
    const allBooks = createRange(1, 66);
    const formatted = formatBookListForSILNLP(allBooks);
    expect(formatted).toBe('OT;NT');
  });

  it('should format a list with all OT books and some NT books as "OT;[NT books]"', () => {
    const books = [...createRange(1, 39), 40, 41];
    const formatted = formatBookListForSILNLP(books);
    expect(formatted).toBe('OT;MAT;MRK');
  });

  it('should format a list with some OT books and all NT books as "[OT books];NT"', () => {
    const books = [1, 2, ...createRange(40, 66)];
    const formatted = formatBookListForSILNLP(books);
    expect(formatted).toBe('GEN;EXO;NT');
  });

  it('should format a list with duplicate books by removing duplicates', () => {
    const books = [1, 1, 2, 2, 40, 40];
    const formatted = formatBookListForSILNLP(books);
    expect(formatted).toBe('GEN;EXO;MAT');
  });

  it('should sort the books in the output', () => {
    const books = [40, 1, 41, 2];
    const formatted = formatBookListForSILNLP(books);
    expect(formatted).toBe('GEN;EXO;MAT;MRK');
  });
});
