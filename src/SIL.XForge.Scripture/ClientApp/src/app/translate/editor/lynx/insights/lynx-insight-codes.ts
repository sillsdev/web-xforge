import { InjectionToken } from '@angular/core';

export interface LynxInsightCode {
  code: string;
  description: string;
  moreInfo?: string; // Verbose information about the insight (markdown?)
}

const codes = new Map<string, LynxInsightCode>([
  [
    '1000',
    {
      code: '1000',
      description: 'Inconsistently used quotation mark',
      moreInfo: `
        Adhering to typographical standards and guidelines often requires using consistent quotation marks, particularly in publishing and academic writing.
        Using the same style throughout maintains the author's intended tone and style, reinforcing the voice and credibility of the writing.

        [Further reading on using quotation marks](https://en.wikipedia.org/wiki/Quotation_mark)
      `
    }
  ],
  ['1002', { code: '1002', description: 'Closing quotation mark not found' }],
  ['1001', { code: '1001', description: 'Five-digit numbers are whack.' }],
  ['1012', { code: '1012', description: '"Must" is a strong word' }],
  ['2001', { code: '2001', description: 'Crazy parens!' }],
  ['2011', { code: '2011', description: 'I warned you!' }],
  ['2002', { code: '2002', description: 'No such thing as "Information".' }],
  ['3001', { code: '3001', description: 'Better to ask forgiveness.' }],
  ['3002', { code: '3002', description: 'Some error text.' }],
  ['2005', { code: '2005', description: 'Some warning text.' }],
  ['1005', { code: '1005', description: 'Some notice text.' }],
  ['1006', { code: '1006', description: 'Some notice text.' }],
  ['3006', { code: '3006', description: 'Some error text.' }],
  ['1011', { code: '1011', description: 'Some notice text.' }]
]);

export const EDITOR_INSIGHT_CODES = new InjectionToken<Map<string, LynxInsightCode>>('EDITOR_INSIGHT_CODES', {
  providedIn: 'root',
  factory: () => codes
});
