import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TranslocoConfig, TranslocoService } from '@ngneat/transloco';
import { Translation, TranslocoLoader } from '@ngneat/transloco';
import merge from 'lodash/merge';
import { of, zip } from 'rxjs';
import { map } from 'rxjs/operators';
import enChecking from '../assets/i18n/checking_en.json';
import enNonChecking from '../assets/i18n/non_checking_en.json';
import { environment } from '../environments/environment';

export type LocaleCode = 'en' | 'en_GB' | 'az' | 'id' | 'zh_CN';

interface Locale {
  localName: string;
  englishName: string;
  localeCode: LocaleCode;
  direction: 'ltr' | 'rtl';
  tags: string[];
  production: boolean;
  dateFormatOptions?: Intl.DateTimeFormatOptions;
}

export const en = merge(enChecking, enNonChecking);

@Injectable()
export class TranslationLoader implements TranslocoLoader {
  constructor(private http: HttpClient) {}

  getTranslation(code: string) {
    if (code.startsWith('en')) {
      // statically load English so there will always be keys to fall back to
      return of(en);
    } else {
      return zip(
        this.http.get<Translation>(`/assets/i18n/checking_${code}.json`),
        this.http.get<Translation>(`/assets/i18n/non_checking_${code}.json`)
      ).pipe(map(translations => merge(translations[0], translations[1])));
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  static readonly locales: Locale[] = [
    {
      localName: 'English (US)',
      englishName: 'English (US)',
      localeCode: 'en',
      direction: 'ltr',
      tags: ['en', 'en-US'],
      dateFormatOptions: { month: 'short', year: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' },
      production: true
    },
    {
      localName: 'English (UK)',
      englishName: 'English (UK)',
      localeCode: 'en_GB',
      direction: 'ltr',
      tags: ['en-GB'],
      dateFormatOptions: { month: 'short', year: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' },
      production: false
    },
    {
      localName: 'Azərbaycanca',
      englishName: 'Azerbaijani',
      localeCode: 'az',
      direction: 'ltr',
      tags: ['az', 'az-AZ'],
      production: false
    },
    {
      localName: 'Bahasa Indonesia',
      englishName: 'Indonesian',
      localeCode: 'id',
      direction: 'ltr',
      tags: ['id', 'id-ID'],
      production: false
    },
    {
      localName: '简体中文',
      englishName: 'Chinese (Simplified)',
      localeCode: 'zh_CN',
      direction: 'ltr',
      tags: ['zh', 'zh-CN'],
      production: false
    }
  ];

  static readonly defaultLocale = I18nService.getLocale('en');
  static readonly availableLocales = I18nService.locales.filter(locale => locale.production || !environment.production);

  static readonly translocoConfig: TranslocoConfig = {
    availableLangs: I18nService.availableLocales.map(locale => locale.localeCode),
    reRenderOnLangChange: true,
    fallbackLang: 'en',
    defaultLang: I18nService.defaultLocale.localeCode,
    missingHandler: {
      useFallbackTranslation: true
    }
  };

  static getLocale(code: LocaleCode): Locale {
    return this.locales.find(locale => locale.localeCode === code)!;
  }

  static findLocale(tag: string): Locale | undefined {
    return this.locales.find(locale =>
      locale.tags.some(canonicalTag => canonicalTag.toLowerCase() === tag.toLowerCase())
    );
  }

  static getTag(code: LocaleCode): string {
    return code.replace('_', '-');
  }

  private currentLocale: Locale = I18nService.defaultLocale;

  constructor(private readonly transloco: TranslocoService) {}

  get localeCode() {
    return this.currentLocale.localeCode;
  }

  get locales() {
    return I18nService.availableLocales;
  }

  setLocale(code: LocaleCode) {
    this.currentLocale = I18nService.getLocale(code);
    this.transloco.setActiveLang(this.currentLocale.localeCode);
  }

  translateAndInsertTags(key: string, params: object = {}) {
    return this.transloco.translate(key, {
      ...params,
      strongStart: '<strong>',
      strongEnd: '</strong>',
      emStart: '<em>',
      emEnd: '</em>',
      spanStart: params['spanClass'] ? `<span class="${params['spanClass']}">` : '<span>',
      spanEnd: '</span>'
    });
  }

  formatDate(date: Date) {
    // fall back to en in the event the language code isn't valid
    return date.toLocaleString(
      [I18nService.getTag(this.localeCode), I18nService.getTag(I18nService.defaultLocale.localeCode)],
      // Browser default is all numeric, but includes seconds. So this fallback is same as default, but without seconds.
      this.currentLocale.dateFormatOptions || {
        month: 'numeric',
        year: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
      }
    );
  }
}
