import { Inject, Injectable } from '@angular/core';
import { findKey } from 'lodash-es';
import { NLLB_LANGUAGES, NllbLanguageDict } from './nllb-languages';

/**
 * Methods for working with the No Language Left Behind (NLLB) language codes.
 */
@Injectable({
  providedIn: 'root'
})
export class NllbLanguageService {
  constructor(@Inject(NLLB_LANGUAGES) private readonly nllbLanguages: NllbLanguageDict) {}

  /**
   * Whether the supplied language code is either a ISO 369-1 (two-letter)
   * or ISO 369-2/T (three-letter) code in the NLLB set.
   * @param languageCode The two- or three-letter code for the language.
   * @returns `true` if language code is in the list of NLLB languages.
   */
  isNllbLanguage(languageCode: string | null | undefined): boolean {
    if (!languageCode) {
      return false;
    }

    const code = languageCode.toLowerCase();

    if (this.nllbLanguages[code]) {
      return true;
    }

    return !!findKey(this.nllbLanguages, lang => lang.iso639_1 === code);
  }
}
