import { translate } from '@ngneat/transloco';
import Bowser from 'bowser';
import ObjectID from 'bson-objectid';
import locales from '../../../locales.json';
import versionData from '../../../version.json';
import { environment } from '../environments/environment';
import { Locale } from './models/i18n-locale';

const BROWSER = Bowser.getParser(window.navigator.userAgent);

export function nameof<T>(name: Extract<keyof T, string>): string {
  return name;
}

/**
 * Returns a valid 24 character `ObjectID` hex string.
 */
export function objectId(): string {
  return new ObjectID().toHexString();
}

export function supportedBrowser(): boolean {
  // Minimum required versions are based largely on browser support data for the following features:
  // https://caniuse.com/indexeddb2
  // https://caniuse.com/mdn-javascript_builtins_regexp_property_escapes
  const isSupportedBrowser = BROWSER.satisfies({
    chrome: '>=64',
    chromium: '>=64',
    edge: '>=79',
    firefox: '>=78',
    safari: '>=11.1',

    mobile: {
      chrome: '>=78',
      firefox: '>=79',
      opera: '>=47',
      safari: '>=11.3',
      'android browser': '>=76',
      'samsung internet': '>=9.0'
    }
  });
  return isSupportedBrowser ? true : false;
}

export function isIosDevice(): boolean {
  return BROWSER.getOSName(true) === 'ios';
}

export function getBrowserEngine(): string {
  const engine = BROWSER.getEngine().name;
  return engine == null ? '' : engine.toLowerCase();
}

export function issuesEmailTemplate(errorId?: string): string {
  const bowser = Bowser.getParser(window.navigator.userAgent);
  const subject: string = translate('issue_email.subject', { siteName: environment.siteName });
  const body: string = translate('issue_email.body', {
    siteName: environment.siteName,
    siteVersion: versionData.version,
    browserName: bowser.getBrowserName(),
    browserVersion: bowser.getBrowserVersion(),
    operatingSystem: bowser.getOSName(),
    operatingSystemVersion: bowser.getOSVersion() || translate('issue_email.unknown'),
    url: location.href,
    errorId: errorId || translate('issue_email.not_applicable')
  });

  return `mailto:${environment.issueEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function parseJSON(str: string): any | undefined {
  try {
    return JSON.parse(str);
  } catch (err) {
    return undefined;
  }
}

export const ASP_CULTURE_COOKIE_NAME = '.AspNetCore.Culture';

export function aspCultureCookieValue(language: string): string {
  return `c=${language}|uic=${language}`;
}

/**
 * @param cookie expect string of form "c=<tag>|uic=<tag>" where <tag> is a language tag
 */
export function getAspCultureCookieLanguage(cookie: string): string {
  const parts = cookie.split('|');
  let c: string;
  let uic: string;
  parts.forEach(value => {
    if (value.startsWith('c=')) {
      c = value.slice('c='.length);
    } else if (value.startsWith('uic=')) {
      uic = value.slice('uic='.length);
    }
  });
  return uic! || c! || 'en';
}

export function getI18nLocales(): Locale[] {
  return locales.map(locale => ({
    ...locale,
    canonicalTag: locale.tags[0],
    production: !!locale.production,
    direction: locale['direction'] === 'rtl' ? 'rtl' : 'ltr'
  }));
}

export function browserLinks() {
  return {
    chromeLink: getLinkHTML(translate('error.chrome'), 'https://www.google.com/chrome/'),
    firefoxLink: getLinkHTML(translate('error.firefox'), 'https://firefox.com'),
    safariLink: getLinkHTML(translate('error.safari'), 'https://www.apple.com/safari/')
  };
}

export function getLinkHTML(text: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.setAttribute('target', '_blank');
  a.textContent = text;
  return a.outerHTML;
}
