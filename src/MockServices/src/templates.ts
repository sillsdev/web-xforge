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

/** USFM book code → (bookNumber, template). File names follow the 41MAT naming form. */
export const BOOK_TEMPLATES: Record<string, { bookNumber: string; usfm: string }> = {
  RUT: { bookNumber: '08', usfm: RUTH_USFM },
  JON: { bookNumber: '32', usfm: JONAH_USFM }
};

export function bookFileName(bookCode: string): string {
  const bookNumber = BOOK_TEMPLATES[bookCode]?.bookNumber ?? '99';
  return `${bookNumber}${bookCode}.SFM`;
}

/**
 * Minimal Paratext project Settings.xml.
 * Provenance: hand-written to satisfy ParatextData's ScrText loading; field-for-field capture
 * from a real project dir is still TODO (spec §7 open question).
 */
export function settingsXml(project: MockProject): string {
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
