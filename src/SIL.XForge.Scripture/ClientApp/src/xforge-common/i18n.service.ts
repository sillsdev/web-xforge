import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TranslocoConfig, TranslocoService } from '@ngneat/transloco';
import { Translation, TranslocoLoader } from '@ngneat/transloco';
import merge from 'lodash/merge';
import { CookieService } from 'ngx-cookie-service';
import { of, zip } from 'rxjs';
import { map } from 'rxjs/operators';
import enChecking from '../assets/i18n/checking_en.json';
import enNonChecking from '../assets/i18n/non_checking_en.json';
import { environment } from '../environments/environment';
import { ASP_CULTURE_COOKIE_NAME, aspCultureCookieValue, getAspCultureCookieLanguage } from './utils';

interface Locale {
  localName: string;
  englishName: string;
  canonicalTag: string;
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
      code = code.replace(/-/g, '_');
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
      direction: 'ltr',
      tags: ['en', 'en-US'],
      dateFormatOptions: { month: 'short', year: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' },
      production: true
    },
    {
      localName: 'English (UK)',
      englishName: 'English (UK)',
      direction: 'ltr',
      tags: ['en-GB'],
      dateFormatOptions: { month: 'short', year: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' },
      production: false
    },
    {
      localName: 'Azərbaycanca',
      englishName: 'Azerbaijani',
      direction: 'ltr',
      tags: ['az', 'az-AZ'],
      production: false
    },
    {
      localName: 'Bahasa Indonesia',
      englishName: 'Indonesian',
      direction: 'ltr',
      tags: ['id', 'id-ID'],
      production: false
    },
    {
      localName: '简体中文',
      englishName: 'Chinese (Simplified)',
      direction: 'ltr',
      tags: ['zh-CN', 'zh'],
      production: false
    }
  ].map(locale => {
    (locale as Locale).canonicalTag = locale.tags[0];
    return locale as Locale;
  });

  static readonly defaultLocale = I18nService.getLocale('en')!;
  static readonly availableLocales = I18nService.locales.filter(locale => locale.production || !environment.production);

  static readonly translocoConfig: TranslocoConfig = {
    availableLangs: I18nService.availableLocales.map(locale => locale.canonicalTag),
    reRenderOnLangChange: true,
    fallbackLang: I18nService.defaultLocale.canonicalTag,
    defaultLang: I18nService.defaultLocale.canonicalTag,
    missingHandler: {
      useFallbackTranslation: true
    }
  };

  static getLocale(tag: string): Locale | undefined {
    return this.locales.find(locale =>
      locale.tags.some(canonicalTag => canonicalTag.toLowerCase() === tag.toLowerCase())
    );
  }

  private currentLocale: Locale = I18nService.defaultLocale;

  constructor(private readonly transloco: TranslocoService, private readonly cookieService: CookieService) {
    const language = this.cookieService.get(ASP_CULTURE_COOKIE_NAME);
    if (language != null) {
      this.trySetLocale(getAspCultureCookieLanguage(language));
    }
  }

  get localeCode() {
    return this.currentLocale.canonicalTag;
  }

  get locales() {
    return I18nService.availableLocales;
  }

  setLocale(tag: string) {
    const locale = I18nService.getLocale(tag);
    if (locale == null) {
      throw new Error(`Cannot set locale to non-existent locale ${tag}`);
    }
    this.trySetLocale(tag);
  }

  trySetLocale(tag: string) {
    const locale = I18nService.getLocale(tag);
    if (locale != null) {
      this.currentLocale = locale;
      this.transloco.setActiveLang(locale.canonicalTag);
      this.cookieService.set(ASP_CULTURE_COOKIE_NAME, aspCultureCookieValue(locale.canonicalTag));
      // TODO save to Auth0
    } else {
      console.warn(`Failed attempt to set locale to unsupported locale ${tag}`);
    }
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
      [this.localeCode, I18nService.defaultLocale.canonicalTag],
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
