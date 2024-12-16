import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, InjectionToken, Optional } from '@angular/core';
import { HashMap, Translation, TranslocoConfig, TranslocoLoader, TranslocoService } from '@ngneat/transloco';
import { Canon, VerseRef } from '@sillsdev/scripture';
import merge from 'lodash-es/merge';
import { CookieService } from 'ngx-cookie-service';
import { BehaviorSubject, Observable, of, zip } from 'rxjs';
import { map } from 'rxjs/operators';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import enChecking from '../assets/i18n/checking_en.json';
import enNonChecking from '../assets/i18n/non_checking_en.json';
import { ObjectPaths } from '../type-utils';
import { DOCUMENT } from './browser-globals';
import { BugsnagService } from './bugsnag.service';
import { FeatureFlagService } from './feature-flags/feature-flag.service';
import { LocationService } from './location.service';
import { Locale, LocaleDirection } from './models/i18n-locale';
import { PseudoLocalization } from './pseudo-localization';
import { ASP_CULTURE_COOKIE_NAME, aspCultureCookieValue, getAspCultureCookieLanguage, getI18nLocales } from './utils';

export type DateFormat = Intl.DateTimeFormatOptions | ((date: Date, options: { showTimeZone?: boolean }) => string);

export interface TextAroundTemplate {
  before: string;
  templateTagText: string;
  after: string;
}

export const en = merge(enChecking, enNonChecking);

export type I18nKey = ObjectPaths<typeof en>;
export type I18nKeyForComponent<T extends keyof typeof en> = ObjectPaths<(typeof en)[T]>;
// TODO create a I18nRoleKey and I18nRoleDescriptionKey type (e.g. `keyof typeof en.roles`). Right now the existence of
// pt_read and pt_write_note in the SFProjectRole definition causes the type system to correctly conclude that there are
// not corresponding localization strings for all of the roles we have defined. Determining the proper way to reconcile
// this mismatch is left to be solved at another time.

export const IGNORE_COOKIE_LOCALE = new InjectionToken<boolean>('IGNORE_COOKIE_LOCALE');

@Injectable()
export class TranslationLoader implements TranslocoLoader {
  constructor(private http: HttpClient) {}

  getTranslation(code: string): Observable<Translation> {
    if (code.startsWith('en')) {
      // statically load English so there will always be keys to fall back to
      return of(en);
    } else if (code === PseudoLocalization.locale.canonicalTag) {
      return of(PseudoLocalization.localize(en));
    } else {
      code = code.replace(/-/g, '_');
      return zip(
        this.http.get<Translation>(`/assets/i18n/checking_${code}.json`),
        this.http.get<Translation>(`/assets/i18n/non_checking_${code}.json`)
      ).pipe(map(translations => merge(translations[0], translations[1])));
    }
  }
}

function pad(number: number): string {
  return number.toString().padStart(2, '0');
}

const locales = getI18nLocales().concat(PseudoLocalization.locale);
const defaultLocale = locales.find(locale => locale.tags.some(canonicalTag => canonicalTag.toLowerCase() === 'en'))!;

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  static readonly locales: Locale[] = locales;

  static dateFormats: { [key: string]: DateFormat } = {
    en: { month: 'short' },
    'en-GB': { month: 'short', hour12: true },
    // Chrome formats az dates as en-US. This manual override is the format Firefox uses for az
    az: (d: Date, options) => {
      let s = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (options.showTimeZone) {
        s += ` ${I18nService.getHumanReadableTimeZoneOffset('az', d)}`;
      }
      return s;
    },
    [PseudoLocalization.locale.canonicalTag]: PseudoLocalization.dateFormat
  };

  static readonly defaultLocale = defaultLocale;

  static readonly translocoConfig: TranslocoConfig = {
    availableLangs: locales.map(locale => locale.canonicalTag),
    reRenderOnLangChange: true,
    fallbackLang: defaultLocale.canonicalTag,
    defaultLang: defaultLocale.canonicalTag,
    missingHandler: {
      useFallbackTranslation: true
    }
  };

  static getLocale(tag: string): Locale | undefined {
    return locales.find(locale => locale.tags.some(canonicalTag => canonicalTag.toLowerCase() === tag.toLowerCase()));
  }

  private currentLocale$ = new BehaviorSubject<Locale>(defaultLocale);

  constructor(
    locationService: LocationService,
    private readonly bugsnagService: BugsnagService,
    private readonly transloco: TranslocoService,
    private readonly cookieService: CookieService,
    private readonly reportingService: ErrorReportingService,
    private readonly featureFlags: FeatureFlagService,
    @Inject(DOCUMENT) private readonly document: Document,
    @Optional() @Inject(IGNORE_COOKIE_LOCALE) ignoreCookieLocale: boolean = false
  ) {
    // This will set the locale to what is specified in the URL first, or fallback to the cookie
    const urlLocale = new URLSearchParams(locationService.search).get('locale');
    if (urlLocale != null) {
      this.trySetLocale(urlLocale);
    } else if (!ignoreCookieLocale) {
      const cookieLocale = this.cookieService.get(ASP_CULTURE_COOKIE_NAME);
      if (cookieLocale != null) {
        this.trySetLocale(getAspCultureCookieLanguage(cookieLocale));
      }
    }
  }

  get locale$(): Observable<Locale> {
    return this.currentLocale$;
  }

  get locale(): Locale {
    return this.currentLocale$.value;
  }

  get localeCode(): string {
    return this.currentLocale$.value.canonicalTag;
  }

  get direction(): LocaleDirection {
    return this.currentLocale$.value.direction;
  }

  get isRtl(): boolean {
    return this.currentLocale$.value.direction === 'rtl';
  }

  get forwardDirectionWord(): 'right' | 'left' {
    return this.currentLocale$.value.direction === 'ltr' ? 'right' : 'left';
  }

  get backwardDirectionWord(): 'right' | 'left' {
    return this.currentLocale$.value.direction === 'ltr' ? 'left' : 'right';
  }

  get locales(): Locale[] {
    return I18nService.locales.filter(
      locale => locale.production || this.featureFlags.showNonPublishedLocalizations.enabled
    );
  }

  setLocale(tag: string): void {
    const locale = I18nService.getLocale(tag);
    if (locale == null) {
      throw new Error(`Cannot set locale to non-existent locale ${tag}`);
    }
    this.trySetLocale(tag);
  }

  /**
   * Attempts to set the locale to the specified locale tag. If the specified locale is not available this will not
   * throw an exception but will report the failure to Bugsnag. If it is available, this will set the active local of
   * the I18nService, write to the ASP .NET Core culture cookie, and log to Bugsnag.
   * @param tag The locale code of the locale to activate. I18nService.locales lists the locales, and each locale has a
   * canonicalTag. This parameter must be one of those tags, or similar to it, by a case-insensitive comparison.
   */
  trySetLocale(tag: string): void {
    const locale = I18nService.getLocale(tag);
    if (locale == null) {
      this.reportingService.silentError(`Failed attempt to set locale to unsupported locale ${tag}`);
      return;
    }

    this.currentLocale$.next(locale);
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

  localizeBook(book: number | string): string {
    if (typeof book === 'number') {
      book = Canon.bookNumberToId(book);
    }
    return this.transloco.translate(`canon.book_names.${book}`);
  }

  localizeReference(verse: VerseRef): string {
    // Add RTL mark before colon and hyphen characters, if in a RTL script.
    // See https://software.sil.org/arabicfonts/support/faq/ for description of this solution, under the section
    // "How do I get correct display for “Chapter:Verse” references using a regular “Roman” colon?"
    // In addition to suggested solution, direction mark is added before chapter number for the case
    // where non-localized book names are in a rtl environment so the chapter number displays with the verse.
    const directionMark = this.locale.direction === 'ltr' ? '' : '\u200F';
    // TODO Some ranges use a comma (and possibly other characters?) as a separator
    const range = verse.verse.split('-').join(directionMark + '-');
    return `${this.localizeBook(verse.bookNum)} ${directionMark}${verse.chapterNum}${directionMark}:${range}`;
  }

  localizeRole(role: string): string {
    // The pt_consultant role has a long name with slashes in it and no spaces. This can lead to layout issues because
    // there aren't spaces to break the line. Insert a zero-width space after each slash.
    // According to https://unicode.org/reports/tr14/#ZW, regarding ZERO WIDTH SPACE:
    // "This character is used to enable additional (invisible) break opportunities wherever SPACE cannot be used."
    return this.transloco.translate(`roles.${role}`).split('/').join('/\u200B');
  }

  localizeRoleDescription(role: string): string {
    return this.transloco.translate(`role_descriptions.${role}`).replace(/\s+-\s+/g, ' • ');
  }

  translate(key: I18nKey, params: object = {}): Observable<string> {
    return this.transloco.selectTranslate<string>(key, params);
  }

  /** Returns a translation for the given I18nKey. A string is returned, so this cannot be used to keep a localization
   * updated without re-calling this whenever the locale changes. Avoid using this when observing a localization is
   * possible. */
  translateStatic(key: I18nKey, params: object = {}): string {
    return this.transloco.translate(key, params);
  }

  translateAndInsertTags(key: I18nKey, params: object = {}): string {
    return this.transloco.translate(key, {
      ...params,
      boldStart: '<strong>',
      boldEnd: '</strong>',
      italicsStart: '<em>',
      italicsEnd: '</em>',
      newLine: '<br />',
      spanStart: params['spanClass'] ? `<span class="${params['spanClass']}">` : '<span>',
      spanEnd: '</span>',
      underlineStart: '<u>',
      underlineEnd: '</u>'
    });
  }

  formatDate(date: Date, options: { showTimeZone?: boolean } = {}): string {
    // fall back to en in the event the language code isn't valid
    const format = I18nService.dateFormats[this.localeCode] || {};
    return typeof format === 'function'
      ? format(date, options)
      : date.toLocaleString(
          [this.localeCode, I18nService.defaultLocale.canonicalTag],
          // Browser default is all numeric, but includes seconds. This is same as default, but without seconds
          {
            month: 'numeric',
            year: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            ...(options?.showTimeZone ? { timeZoneName: 'short' } : {}),
            ...format
          }
        );
  }

  enumerateList(list: string[]): string {
    return new (Intl as any).ListFormat(this.localeCode, { style: 'long', type: 'conjunction' }).format(list) as string;
  }

  translateTextAroundTemplateTags(key: I18nKey, params: object = {}): TextAroundTemplate | undefined {
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
   * Given a translation string like `Please email {{ email }} for help.` and a params object like
   * `{ email: 'help@example.com' }`, this function will return an array of objects like:
   * `[
   *  { text: 'Please email ' },
   *  { text: 'help@example.com', id: 'email' },
   *  { text: ' for help.' }
   * ]`
   * This array can then be iterated in the view and based on the value of the id, either a plain string added to the
   * view, or a link for the email address.
   */
  interpolateVariables(key: I18nKey, params: object = {}): { text: string; id?: string }[] {
    const translation = this.getTranslation(key);

    // find instances of "Some {{ variable }} text"
    const regex = /\{\{\s*(\w+)\s*\}\}/g;

    const sections: { text: string; id?: string }[] = [];
    let i = 0;
    for (const match of translation.matchAll(regex)) {
      const variableWithBraces = match[0];
      const variable = match[1];
      // Add the text before the variable
      sections.push({ text: translation.substring(i, match.index) });
      // Add the variable itself
      sections.push({ text: params[variable], id: variable });
      // The index on a match can only be undefined when calling String.prototype.match with a non-global regex
      i = match.index! + variableWithBraces.length;
    }
    sections.push({ text: translation.substring(i) });

    return sections;
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
  interpolate(key: I18nKey, params?: HashMap): Observable<{ text: string; id?: number }[]> {
    return this.transloco.selectTranslate(key, params).pipe(
      map(translation => {
        // find instances of "{ 1 } text { 2 }"
        const regex = /\{\s*\d+\s*\}(.*?)\{\s*\d+\s*\}/g;

        const sections: { text: string; id?: number }[] = [];
        let i = 0;
        for (const match of translation.matchAll(regex)) {
          const fullMatchText = match[0];
          const matchInnerText = match[1];
          sections.push({ text: translation.substring(i, match.index) });
          const id = Number.parseInt(fullMatchText.match(/\d+/)![0], 10);
          sections.push({ text: matchInnerText, id });
          // The index on a match can only be undefined when calling String.prototype.match with a non-global regex
          i = match.index! + fullMatchText.length;
        }
        sections.push({ text: translation.substring(i) });
        return sections;
      })
    );
  }

  /**
   * Uses browser `Intl` to get the language name for the specified language code rendered in the current locale.
   * @param languageCode The language code for the language name to be displayed.
   * @returns The display name or undefined if language code is not set.
   */
  getLanguageDisplayName(languageCode: string | undefined): string | undefined {
    if (!languageCode) {
      return undefined;
    }

    const languageNames: Intl.DisplayNames = new Intl.DisplayNames([this.localeCode], { type: 'language' });
    try {
      return languageNames.of(languageCode);
    } catch {
      // Some language codes are unsupported in some browsers. For example, Firefox 122 errors on nsk-Cans-CA-x-nasksyl
      return languageCode;
    }
  }

  static getHumanReadableTimeZoneOffset(localeCode: string, date: Date): string {
    return new Intl.DateTimeFormat(localeCode, { timeZoneName: 'short' })
      .formatToParts(date)
      .find(e => e.type === 'timeZoneName').value;
  }

  /** Takes a number and returns a string representing the plural-related rule for the current locale.
   * Possible values include 'zero', 'one', 'two', 'few', 'many', and 'other'.
   */
  getPluralRule(number: number): string {
    return new Intl.PluralRules(this.locale.canonicalTag).select(number);
  }

  private getTranslation(key: I18nKey): string {
    return (
      this.transloco.getTranslation(this.transloco.getActiveLang())[key] ??
      this.transloco.getTranslation(I18nService.defaultLocale.canonicalTag)[key]
    );
  }
}
