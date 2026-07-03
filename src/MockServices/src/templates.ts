import type { MockProject, MockProjectMember } from './types.js';
import { state } from './state.js';

// Book templates for seeding project repos and DBL resources. Deliberately tiny USFM — enough
// for SF to parse and render; extend as scenarios demand.
// Provenance: hand-written; structure follows USFM 3 basics.

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

// USFM book code → canonical book number (1 = GEN … 66 = REV). Standard Protestant canon;
// this is the number ParatextData reports from BooksPresentSet and the number SF's sync uses.
// prettier-ignore
export const BOOK_CODE_TO_NUM: Record<string, number> = {
  GEN:1,EXO:2,LEV:3,NUM:4,DEU:5,JOS:6,JDG:7,RUT:8,'1SA':9,'2SA':10,'1KI':11,'2KI':12,
  '1CH':13,'2CH':14,EZR:15,NEH:16,EST:17,JOB:18,PSA:19,PRO:20,ECC:21,SNG:22,ISA:23,JER:24,
  LAM:25,EZK:26,DAN:27,HOS:28,JOL:29,AMO:30,OBA:31,JON:32,MIC:33,NAM:34,HAB:35,ZEP:36,
  HAG:37,ZEC:38,MAL:39,MAT:40,MRK:41,LUK:42,JHN:43,ACT:44,ROM:45,'1CO':46,'2CO':47,GAL:48,
  EPH:49,PHP:50,COL:51,'1TH':52,'2TH':53,'1TI':54,'2TI':55,TIT:56,PHM:57,HEB:58,JAS:59,
  '1PE':60,'2PE':61,'1JN':62,'2JN':63,'3JN':64,JUD:65,REV:66
};

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

export function bookFileName(bookCode: string): string {
  const bookNum = BOOK_CODE_TO_NUM[bookCode] ?? 99;
  return `${bookFileNameDigits(bookNum)}${bookCode}.SFM`;
}

/**
 * The Paratext BooksPresent string: one character per canonical book, '1' if present.
 * ParatextData's BooksPresentSet is parsed from this, and SF reads it to decide which books to
 * sync — without it, a project syncs as blank.
 */
export function booksPresent(bookCodes: string[]): string {
  const nums = bookCodes.map(code => BOOK_CODE_TO_NUM[code]).filter((n): n is number => n != null);
  const length = Math.max(66, ...nums);
  const chars = Array.from({ length }, () => '0');
  for (const num of nums) chars[num - 1] = '1';
  return chars.join('');
}

/**
 * Minimal Paratext project Settings.xml.
 * Provenance: hand-written to satisfy ParatextData's ScrText loading; field-for-field capture
 * from a real project dir is still TODO (spec §7 open question).
 */
export function settingsXml(project: MockProject, bookCodes: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ScriptureText>
  <Name>${project.shortName}</Name>
  <FullName>${project.fullName}</FullName>
  <Guid>${project.ptId}</Guid>
  <Language>${project.languageName}</Language>
  <LanguageIsoCode>${project.languageIso}:::</LanguageIsoCode>
  <Encoding>65001</Encoding>
  <DefaultFont>Charis SIL</DefaultFont>
  <DefaultFontSize>12</DefaultFontSize>
  <Naming PrePart="" PostPart=".SFM" BookNameForm="41MAT" />
  <FileNamePrePart />
  <FileNameBookNameForm>41MAT</FileNameBookNameForm>
  <FileNamePostPart>.SFM</FileNamePostPart>
  <BooksPresent>${booksPresent(bookCodes)}</BooksPresent>
  <BiblicalTermsListSetting>Major::BiblicalTerms.xml</BiblicalTermsListSetting>
  <Versification>4</Versification>
  <Visibility>Public</Visibility>
  <TranslationInfo>${project.projectType}::</TranslationInfo>
  <MinParatextVersion>8.0.100.76</MinParatextVersion>
  <FullBookContentInProject>True</FullBookContentInProject>
</ScriptureText>
`;
}

const PT_ROLE_TO_ACCESS: Record<string, string> = {
  pt_administrator: 'Administrator',
  pt_consultant: 'Consultant',
  pt_translator: 'Translator',
  pt_observer: 'Observer',
  pt_read: 'Observer',
  pt_write_note: 'Observer'
};

/**
 * ProjectUserAccess.xml served by the archives mock's getfile endpoint.
 * Provenance: hand-written approximation; exact schema capture from a real sync dir is an open
 * question in the spec (§7). Adjust when a real capture is available.
 */
export function projectUserAccessXml(members: MockProjectMember[]): string {
  const users = members
    .map(member => {
      const user = state.findUserByPtUserId(member.ptUserId);
      const username = user?.paratext?.ptUsername ?? member.ptUserId;
      const role = PT_ROLE_TO_ACCESS[member.role] ?? 'Observer';
      return `  <User UserName="${username}" FirstUser="false" UnregisteredUser="false">
    <Role>${role}</Role>
    <AllBooks>true</AllBooks>
    <Books />
    <Permissions />
  </User>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<ProjectUserAccess PeerSharing="false">
${users}
</ProjectUserAccess>
`;
}
