import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import Bugsnag from '@bugsnag/js';
import { Translation, TranslocoLoader } from '@ngneat/transloco';
import { TranslocoConfig, TranslocoService } from '@ngneat/transloco';
import merge from 'lodash-es/merge';
import { CookieService } from 'ngx-cookie-service';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { of, zip } from 'rxjs';
import { map } from 'rxjs/operators';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import enChecking from '../assets/i18n/checking_en.json';
import enNonChecking from '../assets/i18n/non_checking_en.json';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';
import { LocationService } from './location.service';
import { Locale } from './models/i18n-locale';
import { aspCultureCookieValue, ASP_CULTURE_COOKIE_NAME, getAspCultureCookieLanguage, getI18nLocales } from './utils';

type DateFormat = Intl.DateTimeFormatOptions | ((date: Date) => string);

export interface TextAroundTemplate {
  before: string;
  templateTagText: string;
  after: string;
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

function pad(number: number) {
  return number.toString().padStart(2, '0');
}

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  static readonly locales: Locale[] = getI18nLocales();

  static dateFormats: { [key: string]: DateFormat } = {
    en: { month: 'short' },
    'en-GB': { month: 'short', hour12: true },
    // Chrome formats az dates as en-US. This manual override is the format Firefox uses for az
    az: (d: Date) =>
      `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  };

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

  constructor(
    locationService: LocationService,
    private readonly authService: AuthService,
    private readonly transloco: TranslocoService,
    private readonly cookieService: CookieService,
    private readonly reportingService: ErrorReportingService
  ) {
    // Note that if the user is already logged in, and the user has a different interface language specified in their
    // Auth0 profile, then the locale from the URL will end up being overridden.
    const urlLocale = new URLSearchParams(locationService.search).get('locale');
    if (urlLocale != null) {
      this.trySetLocale(urlLocale, false);
    } else {
      const cookieLocale = this.cookieService.get(ASP_CULTURE_COOKIE_NAME);
      if (cookieLocale != null) {
        this.trySetLocale(getAspCultureCookieLanguage(cookieLocale), false);
      }
    }
  }

  get locale(): Locale {
    return this.currentLocale;
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

  trySetLocale(tag: string, doAuthUpdate: boolean = true) {
    const locale = I18nService.getLocale(tag);
    if (locale == null) {
      this.reportingService.silentError(`Failed attempt to set locale to unsupported locale ${tag}`);
      return;
    }

    this.currentLocale = locale;
    this.transloco.setActiveLang(locale.canonicalTag);
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    this.cookieService.set(
      ASP_CULTURE_COOKIE_NAME,
      aspCultureCookieValue(locale.canonicalTag),
      date,
      '/',
      undefined,
      true,
      'Strict'
    );
    if (doAuthUpdate) {
      this.authService.updateInterfaceLanguage(locale.canonicalTag);
    }
    Bugsnag.leaveBreadcrumb(
      'Set Locale',
      {
        localeId: this.localeCode
      },
      'log'
    );
    this.reportingService.addMeta({ localeId: this.localeCode });
  }

  localizeBook(book: number | string) {
    if (typeof book === 'number') {
      book = Canon.bookNumberToId(book);
    }
    return this.transloco.translate(`canon.book_names.${book}`);
  }

  localizeReference(verse: VerseRef) {
    return `${this.localizeBook(verse.bookNum)} ${verse.chapterNum}:${verse.verse}`;
  }

  localizeRole(role: string) {
    return this.transloco.translate(`roles.${role}`);
  }

  translateAndInsertTags(key: string, params: object = {}) {
    return this.transloco.translate(key, {
      ...params,
      boldStart: '<strong>',
      boldEnd: '</strong>',
      italicsStart: '<em>',
      italicsEnd: '</em>',
      newLine: '<br />',
      spanStart: params['spanClass'] ? `<span class="${params['spanClass']}">` : '<span>',
      spanEnd: '</span>'
    });
  }

  formatDate(date: Date) {
    // fall back to en in the event the language code isn't valid
    const format = I18nService.dateFormats[this.localeCode] || {};
    return typeof format === 'function'
      ? format(date)
      : date.toLocaleString(
          [this.localeCode, I18nService.defaultLocale.canonicalTag],
          // Browser default is all numeric, but includes seconds. This is same as default, but without seconds
          { month: 'numeric', year: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', ...format }
        );
  }

  translateTextAroundTemplateTags(key: string, params: object = {}): TextAroundTemplate | undefined {
    const boundary = '{{ boundary }}';
    const text: string = this.translateAndInsertTags(key, {
      ...params,
      templateTagBoundary: boundary
    });
    const textParts: string[] = text.split(boundary);
    if (textParts != null) {
      return { before: textParts[0], templateTagText: textParts[1], after: textParts[2] };
    }
    return undefined;
  }
}
