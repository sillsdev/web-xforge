// Book templates for seeding project repos and DBL resources. Deliberately tiny USFM — enough
// for SF to parse and render; extend as scenarios demand.
// Provenance: hand-written; structure follows USFM 3 basics.
//
// Project files themselves (Settings.xml, ProjectUserAccess.xml, book file naming) are NOT
// templated here — they are produced by ParatextData via src/ParatextProjectTool (see
// ptda-tool.ts), so they are always faithful to real Paratext output. Only DBL resource .p8z
// fixtures (dbl/p8z.ts) still assemble files directly, which is why the canon/file-name helpers
// below remain.

export const RUTH_USFM = `\\id RUT - Mock Scripture for testing
\\h Ruth
\\toc1 Ruth
\\toc2 Ruth
\\toc3 Rut
\\mt1 Ruth
\\c 1
\\p
\\v 1 In the days when the judges ruled, there was a famine in the land.
\\v 2 The man's name was Elimelek, his wife's name was Naomi.
\\c 2
\\p
\\v 1 Now Naomi had a relative on her husband's side, a man of standing, whose name was Boaz.
\\v 2 And Ruth the Moabite said to Naomi, "Let me go to the fields and pick up the leftover grain."
`;

export const JONAH_USFM = `\\id JON - Mock Scripture for testing
\\h Jonah
\\toc1 Jonah
\\toc2 Jonah
\\toc3 Jon
\\mt1 Jonah
\\c 1
\\p
\\v 1 The word of the LORD came to Jonah son of Amittai:
\\v 2 "Go to the great city of Nineveh and preach against it."
\\c 2
\\p
\\v 1 From inside the fish Jonah prayed to the LORD his God.
\\v 2 He said: "In my distress I called to the LORD, and he answered me."
`;

// Full Paratext canon, in order (index i → canonical book number i+1). Matches ParatextData's
// book list (@sillsdev/scripture), 123 books: Protestant 66 + deuterocanon + extras.
// prettier-ignore
export const CANON: string[] = [
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH',
  'EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON',
  'MIC','NAM','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL',
  'EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN',
  'JUD','REV','TOB','JDT','ESG','WIS','SIR','BAR','LJE','S3Y','SUS','BEL','1MA','2MA','3MA','4MA',
  '1ES','2ES','MAN','PS2','ODA','PSS','JSA','JDB','TBS','SST','DNT','BLT','XXA','XXB','XXC','XXD',
  'XXE','XXF','XXG','FRT','BAK','OTH','3ES','EZA','5EZ','6EZ','INT','CNC','GLO','TDX','NDX','DAG',
  'PS3','2BA','LBA','JUB','ENO','1MQ','2MQ','3MQ','REP','4BA','LAO'
];

// USFM book code → canonical book number (1 = GEN … 66 = REV … 123 = LAO).
export const BOOK_CODE_TO_NUM: Record<string, number> = Object.fromEntries(CANON.map((code, i) => [code, i + 1]));

/** USFM book code → template USFM. */
export const BOOK_TEMPLATES: Record<string, { usfm: string }> = {
  RUT: { usfm: RUTH_USFM },
  JON: { usfm: JONAH_USFM }
};

/**
 * Paratext file-name digits for a canonical book number, per ParatextData's
 * ProjectSettings.BookFileNameDigits: 01–09, 10–39, then a +1 offset for 40+ (so MAT=40 → "41").
 */
export function bookFileNameDigits(bookNum: number): string {
  if (bookNum < 10) return '0' + bookNum;
  if (bookNum < 40) return String(bookNum);
  if (bookNum < 100) return String(bookNum + 1);
  if (bookNum < 110) return 'A' + (bookNum - 100);
  if (bookNum < 120) return 'B' + (bookNum - 110);
  return 'C' + (bookNum - 120);
}

/**
 * Book file name inside a DBL resource .p8z, matching the resource Settings.xml naming
 * (PostPart ".SFM", BookNameForm "41MAT"): e.g. "08RUT.SFM".
 */
export function resourceBookFileName(bookCode: string): string {
  const bookNum = BOOK_CODE_TO_NUM[bookCode] ?? 99;
  return `${bookFileNameDigits(bookNum)}${bookCode}.SFM`;
}
