import { Inject, Injectable } from '@angular/core';
import { catchError, lastValueFrom, map, of } from 'rxjs';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { HttpClient } from '../machine-api/http-client';
import { NLLB_LANGUAGES, NllbLanguage, NllbLanguageDict } from './nllb-languages';

interface LanguageDto {
  isSupported: boolean;
  languageCode: string;
}

/**
 * Methods for working with the No Language Left Behind (NLLB) language codes.
 */
@Injectable({
  providedIn: 'root'
})
export class NllbLanguageService {
  constructor(
    private readonly errorReportingService: ErrorReportingService,
    private readonly httpClient: HttpClient,
    @Inject(NLLB_LANGUAGES) private readonly nllbLanguages: NllbLanguageDict,
    private readonly onlineStatusService: OnlineStatusService
  ) {}

  async isNllbLanguageAsync(languageCode: string | null | undefined): Promise<boolean> {
    if (languageCode != null && this.onlineStatusService.isOnline) {
      return await this.isLanguageSupportedAsync(languageCode);
    } else {
      return this.isNllbLanguage(languageCode);
    }
  }

  /**
   * Queries Serval to see if the language code is supported, and falls back to the local language database.
   * @param languageCode The language code.
   * @returns `true` if the language code is supported; `false` if not; and `undefined` on error.
   */
  private async isLanguageSupportedAsync(languageCode: string): Promise<boolean> {
    const response = await lastValueFrom(
      this.httpClient.get<LanguageDto>(`translation/languages/${encodeURIComponent(languageCode)}`).pipe(
        map(res => res.data),
        catchError(err => {
          this.errorReportingService.silentError(
            'Error while determining if language is supported',
            ErrorReportingService.normalizeError(err)
          );
          return of({ isSupported: this.isNllbLanguage(languageCode) } as LanguageDto);
        })
      )
    );
    return response?.isSupported ?? this.isNllbLanguage(languageCode);
  }

  /**
   * Whether the supplied language code is either a ISO 369-1 (two-letter)
   * or ISO 369-2/T (three-letter) code in the NLLB set.
   * @param languageCode The two- or three-letter code for the language. Language code can have
   * culture information attached with hyphens or underscores ('en-Latn-GB').
   * @returns `true` if language code is in the list of NLLB languages.
   */
  private isNllbLanguage(languageCode: string | null | undefined): boolean {
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
