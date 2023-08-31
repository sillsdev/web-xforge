import { Inject, Injectable } from '@angular/core';
import { NllbLanguage, NllbLanguageDict, NLLB_LANGUAGES } from './nllb-languages';

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
   * @param languageCode The two- or three-letter code for the language. Language code can have
   * culture information attached with hyphens or underscores ('en-Latn-GB').
   * @returns `true` if language code is in the list of NLLB languages.
   */
  isNllbLanguage(languageCode: string | null | undefined): boolean {
    if (languageCode == null || languageCode.length < 2) {
      return false;
    }

    // Handle hyphen or underscore delimited
    const code: string = languageCode.split(/[_-]/)[0].toLowerCase();

    // Check if ISO 369-2/T match
    if (this.nllbLanguages[code]) {
      return true;
    }

    // Check if ISO 369-1 match
    return Object.values(this.nllbLanguages).some((lang: NllbLanguage) => lang.iso639_1 === code);
  }
}
