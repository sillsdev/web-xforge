import { Canon } from '@sillsdev/scripture';

const OT_RANGE = [1, 39];
const NT_RANGE = [40, 66];

function isOTBook(book: number): boolean {
  return book >= OT_RANGE[0] && book <= OT_RANGE[1];
}

function isNTBook(book: number): boolean {
  return book >= NT_RANGE[0] && book <= NT_RANGE[1];
}

export function formatBookListForSILNLP(value: number[]): string {
  const bookList = Array.from(new Set(value)).sort((a, b) => a - b); // Remove duplicates and sort
  const otBooks = bookList.filter(isOTBook);
  const ntBooks = bookList.filter(isNTBook);
  const otherBooks = bookList.filter(book => !isOTBook(book) && !isNTBook(book));

  const hasEntireOT = otBooks.length === OT_RANGE[1] - OT_RANGE[0] + 1;
  const hasEntireNT = ntBooks.length === NT_RANGE[1] - NT_RANGE[0] + 1;

  const formattedBooks: string[] = [];
  formattedBooks.push(...(hasEntireOT ? ['OT'] : otBooks.map(book => Canon.bookNumberToId(book))));
  formattedBooks.push(...(hasEntireNT ? ['NT'] : ntBooks.map(book => Canon.bookNumberToId(book))));
  formattedBooks.push(...otherBooks.map(book => Canon.bookNumberToId(book)));

  return formattedBooks.join(';');
}
