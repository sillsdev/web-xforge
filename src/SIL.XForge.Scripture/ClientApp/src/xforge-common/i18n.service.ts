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

export type LocaleCode = 'en' | 'zh_CN';

interface Locale {
  localName: string;
  englishName: string;
  localeCode: LocaleCode;
  direction: 'ltr' | 'rtl';
  production: boolean;
}

export const en = merge(enChecking, enNonChecking);

@Injectable()
export class TranslationLoader implements TranslocoLoader {
  constructor(private http: HttpClient) {}

  getTranslation(code: string) {
    if (code === 'en') {
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
      localName: 'English',
      englishName: 'English',
      localeCode: 'en',
      direction: 'ltr',
      production: true
    },
    {
      localName: '简体中文',
      englishName: 'Chinese (Simplified)',
      localeCode: 'zh_CN',
      direction: 'ltr',
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

  static getLocale(code: LocaleCode) {
    return this.locales.find(locale => locale.localeCode === code)!;
  }

  private currentLocale: Locale = I18nService.defaultLocale;
  constructor(private readonly transloco: TranslocoService) {}

  get localeCode() {
    return this.currentLocale.localeCode;
  }

  get locales() {
    return I18nService.availableLocales;
  }

  setLocale(newLocale: LocaleCode) {
    this.currentLocale = I18nService.getLocale(newLocale);
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
}
