export interface Locale {
  localName: string;
  englishName: string;
  canonicalTag: string;
  direction: 'ltr' | 'rtl';
  tags: string[];
  production: boolean;
  helps?: string;
}
