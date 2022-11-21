import { Locale } from './models/i18n-locale';
import { DateFormat } from './i18n.service';

function pseudoLocalizeCharacter(char: string): string {
  const lowerA = 'a'.charCodeAt(0);
  const upperA = 'A'.charCodeAt(0);
  const lowerZ = 'z'.charCodeAt(0);
  const upperZ = 'Z'.charCodeAt(0);

  const code = char.charCodeAt(0);
  let charCode: number;
  if (code >= lowerA && code <= lowerZ) charCode = lowerA + ((code - lowerA + 1) % (lowerZ - lowerA + 1));
  else if (code >= upperA && code <= upperZ) charCode = upperA + ((code - upperA + 1) % (upperZ - upperA + 1));
  else charCode = code;
  return String.fromCharCode(charCode);
}

function pseudoLocalizeString(input: string): string {
  let output = '';
  let bracketDepth = 0;

  for (const char of input) {
    if (char === '{') bracketDepth++;
    else if (char === '}') bracketDepth--;

    if (bracketDepth === 0) output += pseudoLocalizeCharacter(char);
    else output += char;
  }
  return output;
}

function pseudoLocalizeObject(obj: {}): Object {
  const newObj = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') newObj[key] = pseudoLocalizeString(obj[key]);
    else if (typeof value === 'object' && value != null) newObj[key] = pseudoLocalizeObject(obj[key]);
  }
  return newObj;
}

export const PseudoLocalization = {
  dateFormat: { month: 'short' } as DateFormat,
  locale: {
    localName: 'Pseudo localization',
    englishName: 'Pseudo localization',
    canonicalTag: 'pseudo',
    direction: 'ltr',
    tags: ['pseudo'],
    production: false
  } as Locale,
  localize: pseudoLocalizeObject
} as const;
