import { Injectable, Injector } from '@angular/core';
import { Translation, TranslocoInterceptor, TranslocoService } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { LEFT_TO_RIGHT_EMBEDDING, POP_DIRECTIONAL_FORMATTING } from './utils';

/**
 * TranslocoInterceptor to handle bidirectional text for LTR fallbacks in RTL contexts.
 * When the UI is in an RTL language, this interceptor checks if a translation string
 * is identical to its English counterpart. If so, it assumes the string is an
 * LTR fallback (e.g., untranslated English text) and wraps it with LRE (U+202A)
 * and PDF (U+202C) characters to ensure correct LTR rendering within the RTL UI.
 */
@Injectable()
export class LtrMarkerInterceptor implements TranslocoInterceptor {
  private _translocoService?: TranslocoService;

  constructor(private readonly injector: Injector) {}

  private get translocoService(): TranslocoService {
    this._translocoService ??= this.injector.get(TranslocoService);
    return this._translocoService;
  }

  preSaveTranslation(translation: Translation, langOfTranslationFile: string): Translation {
    const activeUiLocale: Locale | undefined = I18nService.getLocale(langOfTranslationFile);
    const uiIsRtl: boolean = activeUiLocale?.direction === 'rtl';

    if (uiIsRtl) {
      const englishTranslations: Translation = this.translocoService.getTranslation('en');
      const wrappedTranslations: Translation = {};
      for (const key in translation) {
        const currentValue: string = translation[key];
        const englishValue: string = englishTranslations[key];
        wrappedTranslations[key] = this.wrapIfSameAsEnglish(currentValue, englishValue);
      }
      return wrappedTranslations;
    }

    return translation;
  }

  private wrapIfSameAsEnglish(currentValue: string, englishValue: string): string {
    if (currentValue === englishValue) {
      // This suggests the current value is an untranslated fallback to English.
      // Wrap with LTR markers if not already wrapped.
      if (!currentValue.startsWith(LEFT_TO_RIGHT_EMBEDDING) && !currentValue.endsWith(POP_DIRECTIONAL_FORMATTING)) {
        return `${LEFT_TO_RIGHT_EMBEDDING}${currentValue}${POP_DIRECTIONAL_FORMATTING}`;
      }
    }
    return currentValue;
  }

  preSaveTranslationKey(key: string, value: string, langOfValue: string): string {
    const activeUiLocale: Locale | undefined = I18nService.getLocale(langOfValue);
    const uiIsRtl: boolean = activeUiLocale?.direction === 'rtl';

    if (uiIsRtl) {
      const englishTranslations: Translation = this.translocoService.getTranslation('en');
      const englishValue: string = englishTranslations[key];
      return this.wrapIfSameAsEnglish(value, englishValue);
    }
    return value;
  }
}
