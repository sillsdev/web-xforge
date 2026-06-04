import checkingEn from '../assets/i18n/checking_en.json';
import nonCheckingEn from '../assets/i18n/non_checking_en.json';
import { getI18nLocales } from './utils';

// The locale list is driven by getI18nLocales() (backed by locales.json), so new locales are picked up automatically.
// Translation files are fetched at runtime from the Karma test server's assets directory.
const localeData = new Map<string, { checking: unknown; nonChecking: unknown }>();

const nonEnglishLocales = getI18nLocales()
  .filter(l => l.canonicalTag !== 'en' && !l.canonicalTag.startsWith('en-'))
  .map(l => l.canonicalTag);

function flattenObject(obj: unknown, result: Record<string, string> = {}, prefix = ''): Record<string, string> {
  if (typeof obj !== 'object' || obj == null) return result;
  for (const [key, value] of Object.entries(obj as object)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') result[fullKey] = value;
    else if (typeof value === 'object') flattenObject(value, result, fullKey);
  }
  return result;
}

// Handles both {{ named }} and { 1 } numbered placeholder variable styles.
function extractVariables(s: string): Set<string> {
  const vars = new Set<string>();
  for (const match of s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) vars.add(match[1]);
  for (const match of s.matchAll(/(?<!\{)\{\s*(\d+)\s*\}(?!\})/g)) vars.add(match[1]);
  return vars;
}

interface Mismatch {
  key: string;
  englishValue: string;
  englishVars: Set<string>;
  translatedValue: string;
  translatedVars: Set<string>;
}

function formatMismatches(mismatches: Mismatch[]): string {
  return [
    `${mismatches.length} string(s) with mismatched interpolation variables:`,
    ...mismatches.map(
      m =>
        `\n  ${m.key}\n` +
        `    expected: {{ ${[...m.englishVars].sort().join(', ')} }}\n` +
        `    got:      {{ ${[...m.translatedVars].sort().join(', ') || '(none)'} }}\n` +
        `    EN: ${JSON.stringify(m.englishValue)}\n` +
        `    TR: ${JSON.stringify(m.translatedValue)}`
    )
  ].join('\n');
}

function findMismatches(enFlat: Record<string, string>, translation: unknown): Mismatch[] {
  const trFlat = flattenObject(translation);
  const mismatches: Mismatch[] = [];

  for (const [key, englishValue] of Object.entries(enFlat)) {
    const englishVars = extractVariables(englishValue);
    if (englishVars.size === 0) continue;

    const translatedValue = trFlat[key];
    if (translatedValue == null) continue; // Missing keys fall back to English at runtime and therefore aren't mismatches

    const translatedVars = extractVariables(translatedValue);
    const setsMatch = englishVars.size === translatedVars.size && [...englishVars].every(v => translatedVars.has(v));
    if (!setsMatch) {
      mismatches.push({ key, englishValue, englishVars, translatedValue, translatedVars });
    }
  }

  return mismatches;
}

const variants = [
  { prefix: 'checking', enFlat: flattenObject(checkingEn), dataKey: 'checking' as const },
  { prefix: 'non_checking', enFlat: flattenObject(nonCheckingEn), dataKey: 'nonChecking' as const }
];

describe('i18n variable matches', () => {
  beforeAll(async () => {
    await Promise.all(
      nonEnglishLocales.map(async locale => {
        const stem = locale.replace(/-/g, '_');
        const [checking, nonChecking] = await Promise.all([
          fetch(`/assets/i18n/checking_${stem}.json`).then(r => (r.ok ? r.json() : null)),
          fetch(`/assets/i18n/non_checking_${stem}.json`).then(r => (r.ok ? r.json() : null))
        ]);
        localeData.set(locale, { checking, nonChecking });
      })
    );
  });

  for (const locale of nonEnglishLocales) {
    for (const { prefix, enFlat, dataKey } of variants) {
      it(`${prefix}_${locale} has correct interpolation variables`, () => {
        const data = localeData.get(locale)?.[dataKey];
        if (data == null) return pending(`no ${prefix}_${locale}.json`);
        const mismatches = findMismatches(enFlat, data);
        if (mismatches.length > 0) fail(formatMismatches(mismatches));
        expect().nothing();
      });
    }
  }
});
