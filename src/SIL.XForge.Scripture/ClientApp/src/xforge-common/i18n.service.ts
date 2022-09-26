import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { HashMap, Translation, TranslocoLoader } from '@ngneat/transloco';
import { TranslocoConfig, TranslocoService } from '@ngneat/transloco';
import merge from 'lodash-es/merge';
import { CookieService } from 'ngx-cookie-service';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { Observable, of, zip } from 'rxjs';
import { map } from 'rxjs/operators';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import enChecking from '../assets/i18n/checking_en.json';
import enNonChecking from '../assets/i18n/non_checking_en.json';
import { AuthService } from './auth.service';
import { DOCUMENT } from './browser-globals';
import { BugsnagService } from './bugsnag.service';
import { FeatureFlagService } from './feature-flags/feature-flag.service';
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

  static readonly translocoConfig: TranslocoConfig = {
    availableLangs: I18nService.locales.map(locale => locale.canonicalTag),
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

  private interpolationCache: { [key: string]: { text: string; id?: number }[] } = {};

  constructor(
    locationService: LocationService,
    private readonly bugsnagService: BugsnagService,
    private readonly transloco: TranslocoService,
    private readonly cookieService: CookieService,
    private readonly reportingService: ErrorReportingService,
    private readonly featureFlags: FeatureFlagService,
    @Inject(DOCUMENT) private readonly document: Document
  ) {
    // Note that if the user is already logged in, and the user has a different interface language specified in their
    // Auth0 profile, then the locale from the URL will end up being overridden.
    const urlLocale = new URLSearchParams(locationService.search).get('locale');
    if (urlLocale != null) {
      this.trySetLocale(urlLocale);
    } else {
      const cookieLocale = this.cookieService.get(ASP_CULTURE_COOKIE_NAME);
      if (cookieLocale != null) {
        this.trySetLocale(getAspCultureCookieLanguage(cookieLocale));
      }
    }
  }

  get locale(): Locale {
    return this.currentLocale;
  }

  get localeCode() {
    return this.currentLocale.canonicalTag;
  }

  get direction(): 'ltr' | 'rtl' {
    return this.currentLocale.direction;
  }

  get isRtl(): boolean {
    return this.currentLocale.direction === 'rtl';
  }

  get forwardDirectionWord(): 'right' | 'left' {
    return this.currentLocale.direction === 'ltr' ? 'right' : 'left';
  }

  get backwardDirectionWord(): 'right' | 'left' {
    return this.currentLocale.direction === 'ltr' ? 'left' : 'right';
  }

  get locales() {
    return I18nService.locales.filter(
      locale => locale.production || this.featureFlags.showNonPublishedLocalizations.enabled
    );
  }

  setLocale(tag: string, authService: AuthService) {
    const locale = I18nService.getLocale(tag);
    if (locale == null) {
      throw new Error(`Cannot set locale to non-existent locale ${tag}`);
    }
    this.trySetLocale(tag, authService);
  }

  /**
   * Attempts to set the locale to the specified locale tag. If the specified locale is not available this will not
   * throw an exception but will report the failure to Bugsnag. If it is available, this will set the active local of
   * the I18nService, write to the ASP .NET Core culture cookie, and log to Bugsnag. If the authService parameter is
   * supplied, it will also be written the locale to the user profile.
   * @param tag The locale code of the locale to activate. I18nService.locales lists the locales, and each locale has a
   * canonicalTag. This parameter must be one of those tags, or similar to it, by a case-insensitive comparison.
   * @param authService (optional) The AuthService, which can be used to update the interfaceLanguage on the user. If
   * this is not supplied, the user profile will not be updated.
   */
  trySetLocale(tag: string, authService?: AuthService): void {
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
    if (authService != null) {
      authService.updateInterfaceLanguage(locale.canonicalTag);
    }
    this.bugsnagService.leaveBreadcrumb(
      'Set Locale',
      {
        localeId: this.localeCode
      },
      'log'
    );
    this.reportingService.addMeta({ localeId: this.localeCode });
    this.document.body.setAttribute('dir', this.direction);
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

  translate(key: string, params: object = {}): Observable<string> {
    return this.transloco.selectTranslate<string>(key, params);
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

  /**
   * Looks up a given translation and then breaks it up into chunks according it its numbered tags. For example, a
   * translation of 'A quick brown { 1 }fox{ 2 } jumps over the lazy { 3 }dog{ 4 }.'
   * would result in an array of items as shown below:
   * [
   *   {text: 'A quick brown '},
   *   {text: 'fox', id: 1},
   *   {text: ' jumps over the lazy '},
   *   {text: 'dog', id: 3},
   *   {text: '.'}
   * ]
   * This array can then be iterated in the view and based on the value of the id, either a plain string added to the,
   * view, or a link for the text "fox" or "dog". This system has the advantage of being able to handle translations
   * that reorder "fox" and "dog".
   */
  interpolate(key: string, params?: HashMap): { text: string; id?: number }[] {
    const hashKey = this.localeCode + ' ' + key;
    if (this.interpolationCache[hashKey] != null) {
      return this.interpolationCache[hashKey];
    }

    const translation: string = this.transloco.translate(key, params);
    // find instances of "{ 1 } text { 2 }"
    const regex = /\{\s*\d+\s*\}(.*?)\{\s*\d+\s*\}/g;
    const matches: RegExpExecArray[] = [];

    // ES2020 introduces string.matchAll(regex), but as of the time of writing SF is using ES2018
    let match: RegExpExecArray | null;
    while ((match = regex.exec(translation)) !== null) {
      matches.push(match);
    }

    const sections: { text: string; id?: number }[] = [];
    let i = 0;
    for (const match of matches) {
      const fullMatchText = match[0];
      const matchInnerText = match[1];
      sections.push({ text: translation.substring(i, match.index) });
      const id = Number.parseInt(fullMatchText.match(/\d+/)![0], 10);
      sections.push({ text: matchInnerText, id });
      i = match.index + fullMatchText.length;
    }
    sections.push({ text: translation.substring(i) });

    this.interpolationCache[hashKey] = sections.filter(section => !(section.text === '' && section.id == null));
    return this.interpolationCache[hashKey];
  }
}
