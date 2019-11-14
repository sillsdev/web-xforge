import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { translate, TranslocoConfig, TranslocoService } from '@ngneat/transloco';
import { Translation, TranslocoLoader } from '@ngneat/transloco';
import { of } from 'rxjs';
import en from '../assets/i18n/en.json';
import { environment } from '../environments/environment.pwa-test';

export type LocaleCode = 'en' | 'zh_CN';

interface Locale {
  localName: string;
  englishName: string;
  localeCode: LocaleCode;
  direction: 'ltr' | 'rtl';
  production: boolean;
}

@Injectable()
export class TranslationLoader implements TranslocoLoader {
  constructor(private http: HttpClient) {}

  getTranslation(code: string) {
    if (code === 'en') {
      // statically load English so there will always be keys to fall back to
      return of(en);
    } else {
      return this.http.get<Translation>(`/assets/i18n/${code}.json`);
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
  static readonly availableLocales = environment.production
    ? I18nService.locales.filter(locale => locale.production)
    : I18nService.locales;

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
  constructor(private readonly transloco: TranslocoService) {
    console.log('i18n service created');
  }

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

  translate(key: string, params: object = {}) {
    return translate(key, {
      ...params,
      strongStart: '<strong>',
      strongEnd: '</strong>',
      emStart: '<em>',
      emEnd: '</em>'
    });
  }
}

@Injectable({
  providedIn: 'root'
})
export class TranslateHelper {
  translate(key: string, params: object = {}) {
    return translate(key, {
      ...params,
      strongStart: '<strong>',
      strongEnd: '</strong>',
      emStart: '<em>',
      emEnd: '</em>'
    });
  }
}
