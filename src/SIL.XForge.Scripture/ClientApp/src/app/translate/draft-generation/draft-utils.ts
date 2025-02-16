export function englishNameFromCode(code: string): string {
  const locale = new Intl.Locale(code);
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale.language) ?? '';
}
