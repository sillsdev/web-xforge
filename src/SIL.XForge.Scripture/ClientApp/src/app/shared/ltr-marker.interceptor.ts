import { Injectable, Injector } from '@angular/core';
import { Translation, TranslocoInterceptor, TranslocoService } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';

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
    if (this._translocoService == null) {
      this._translocoService = this.injector.get(TranslocoService);
    }
    return this._translocoService;
  }

  preSaveTranslation(translation: Translation, langOfTranslationFile: string): Translation {
    const activeUiLocale = I18nService.getLocale(langOfTranslationFile);
    const uiIsRtl = activeUiLocale?.direction === 'rtl';

    if (uiIsRtl) {
      const englishTranslations = this.translocoService.getTranslation('en');
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
      if (!currentValue.startsWith('\u202A') && !currentValue.endsWith('\u202C')) {
        return `\u202A${currentValue}\u202C`;
      }
    }
    return currentValue;
  }

  preSaveTranslationKey(key: string, value: string, langOfValue: string): string {
    const activeUiLocale = I18nService.getLocale(langOfValue);
    const uiIsRtl = activeUiLocale?.direction === 'rtl';

    if (uiIsRtl) {
      const englishTranslations = this.translocoService.getTranslation('en');
      const englishValue: string = englishTranslations[key];
      return this.wrapIfSameAsEnglish(value, englishValue);
    }
    return value;
  }
}
