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
  // https://caniuse.com/mdn-css_properties_text-align_flow_relative_values_start_and_end
  // https://caniuse.com/mdn-css_properties_column-gap_flex_context
  // https://caniuse.com/mdn-css_properties_inset-inline-start
  // https://developer.mozilla.org/en-US/docs/Web/CSS/margin-inline-start#browser_compatibility
  // ES2022 (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Static_initialization_blocks)
  const isSupportedBrowser = BROWSER.satisfies({
    chrome: '>=94',
    chromium: '>=94',
    edge: '>=94',
    firefox: '>=93',
    safari: '>=16.4',

    mobile: {
      chrome: '>=94',
      firefox: '>=93',
      opera: '>=80',
      safari: '>=16.4',
      'android browser': '>=94',
      'samsung internet': '>=17.0'
    }
  });
  return isSupportedBrowser ? true : false;
}

export function isIosDevice(): boolean {
  return BROWSER.getOSName(true) === 'ios';
}

export function isBrave(): boolean {
  // The officially supported way of detecting Brave is to call navigator.brave.isBrave(), which returns
  // Promise<boolean>. See https://github.com/brave/brave-browser/wiki/Detecting-Brave-(for-Websites)
  // Just checking for the presence of this property works fine though and doesn't require awaiting a promise.
  return 'brave' in window.navigator;
}

export function getBrowserEngine(): string {
  const engine = BROWSER.getEngine().name;
  return engine == null ? '' : engine.toLowerCase();
}

export function isBlink(): boolean {
  return getBrowserEngine() === 'blink';
}

export function isGecko(): boolean {
  return getBrowserEngine() === 'gecko';
}

export function isSafari(): boolean {
  return navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome');
}

export function audioRecordingMimeType(): string {
  // MediaRecorder.isTypeSupported('audio/webm') will erroneously return true on Firefox,
  // and so we must use browser sniffing in this case.
  if (isGecko()) {
    // If OGG is not used on Firefox, recording does not work correctly.
    // See https://github.com/muaz-khan/RecordRTC/issues/166#issuecomment-242942400
    return 'audio/ogg';
  } else if (MediaRecorder.isTypeSupported('audio/webm')) {
    // This is the default format for Chromium based browsers
    return 'audio/webm';
  } else {
    // Safari on iOS/macOS does not support audio/webm
    return 'audio/mp4';
  }
}

export function issuesEmailTemplate(errorInfo?: { errorMessage: string; errorId: string }): string {
  const bowser = Bowser.getParser(window.navigator.userAgent);

  const technicalDetails = Object.entries({
    [environment.siteName]: versionData.version,
    [bowser.getBrowserName()]: bowser.getBrowserVersion(),
    ...(isBrave() ? { Brave: 'Yes' } : {}),
    [bowser.getOSName()]: bowser.getOSVersion() ?? translate('issue_email.unknown'),
    URL: location.href,
    ...(errorInfo?.errorId ? { 'Error ID': errorInfo?.errorId } : {}),
    ...(errorInfo?.errorMessage ? { 'Error Message': errorInfo?.errorMessage } : {})
  })
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  const body: string =
    translate('issue_email.heading') +
    '\n\n\n\n\n' +
    `--- ${translate('issue_email.technical_details')} ---` +
    '\n' +
    technicalDetails;

  return `mailto:${environment.issueEmail}?&body=${encodeURIComponent(body)}`;
}

export function parseJSON(str: string): any | undefined {
  try {
    return JSON.parse(str);
  } catch {
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

export function browserLinks(): { chromeLink: string; firefoxLink: string; safariLink: string } {
  return {
    chromeLink: getLinkHTML(translate('error.chrome'), 'https://www.google.com/chrome/'),
    firefoxLink: getLinkHTML(translate('error.firefox'), 'https://firefox.com'),
    safariLink: getLinkHTML(translate('error.safari'), 'https://www.apple.com/safari/')
  };
}

export function getLinkHTML(text: string, href: string): string {
  const a = document.createElement('a');
  a.href = href;
  a.setAttribute('target', '_blank');
  a.textContent = text;
  return a.outerHTML;
}

/** Attempts to parse a value as JSON. If the value is not a string or cannot be parsed, returns null. */
export function tryParseJSON(data: unknown): unknown {
  if (typeof data !== 'string') return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
