import { Injectable } from '@angular/core';
import { Translation, TranslocoInterceptor } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';

/**
 * TranslocoInterceptor to handle bidirectional text for LTR fallbacks in RTL contexts.
 * It prepends LRE (U+202A) and appends PDF (U+202C) characters to a string if the given language
 * is Arabic but no Arabic characters are present.
 */
@Injectable()
export class LtrMarkerInterceptor implements TranslocoInterceptor {
  constructor() {}

  preSaveTranslation(translation: Translation, langOfTranslationFile: string): Translation {
    const activeUiLocale = I18nService.getLocale(langOfTranslationFile);
    const uiIsRtl = activeUiLocale?.direction === 'rtl';

    if (uiIsRtl) {
      const wrappedTranslations: Translation = {};
      for (const key in translation) {
        const value: string = translation[key];
        wrappedTranslations[key] = this.wrapValueIfUnlocalized(value);
      }
      return wrappedTranslations;
    }

    return translation;
  }

  private wrapValueIfUnlocalized(value: string): string {
    // Regex to check if the string contains any character from the UI's script.
    // The 'u' flag is essential for Unicode property escapes.
    const containsArabic = new RegExp(`\\p{Script=Arabic}`, 'u');
    if (value && !containsArabic.test(value)) {
      if (!value.startsWith('\u202A') && !value.endsWith('\u202C')) {
        return `\u202A${value}\u202C`;
      } else {
        return value;
      }
    } else {
      return value;
    }
  }

  preSaveTranslationKey(_key: string, value: string, langOfValue: string): string {
    const activeUiLocale = I18nService.getLocale(langOfValue);
    const uiIsRtl = activeUiLocale?.direction === 'rtl';

    if (uiIsRtl) {
      return this.wrapValueIfUnlocalized(value);
    }
    return value;
  }
}
