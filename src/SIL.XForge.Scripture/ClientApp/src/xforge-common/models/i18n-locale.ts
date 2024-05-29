export type LocaleDirection = 'ltr' | 'rtl';

export interface Locale {
  localName: string;
  englishName: string;
  canonicalTag: string;
  direction: LocaleDirection;
  tags: string[];
  production: boolean;
  helps?: string;
}
