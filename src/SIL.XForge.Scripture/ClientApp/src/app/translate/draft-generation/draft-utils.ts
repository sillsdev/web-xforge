export function englishNameFromCode(code: string): string {
  const locale = new Intl.Locale(code);
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale.language) ?? '';
}

export function areLanguageCodesEquivalent(code1: string, code2: string): boolean {
  return code1 === code2 || englishNameFromCode(code1) === englishNameFromCode(code2);
}

/**
 * Given a list of language codes, counts the number of codes that are "unique" in the sense that they have different
 * English names.
 *
 * This is a *very rough* way of determining whether languages are "equivalent" for the purposes of training a model.
 *
 * As an example, zh and cmn both map to "Chinese" in English, so they would be considered equivalent.
 *
 * TODO Create a more robust way of determining whether languages are equivalent, that isn't browser-dependent.
 */
export function countNonEquivalentLanguageCodes(languageCodes: string[]): number {
  const uniqueTags = new Set(languageCodes);
  return new Set(Array.from(uniqueTags).map(englishNameFromCode)).size;
}
