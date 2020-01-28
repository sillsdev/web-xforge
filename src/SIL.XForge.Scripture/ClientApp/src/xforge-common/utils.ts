import { translate } from '@ngneat/transloco';
import Bowser from 'bowser';
import ObjectID from 'bson-objectid';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { version } from '../../../version.json';
import { environment } from '../environments/environment';

export function nameof<T>(name: Extract<keyof T, string>): string {
  return name;
}

export function objectId(): string {
  return ObjectID.generate();
}

export function promiseTimeout<T>(promise: Promise<T>, timeout: number) {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(reject, timeout);
    })
  ]);
}

export function supportedBrowser(): boolean {
  const bowser = Bowser.getParser(window.navigator.userAgent);

  // See https://caniuse.com/#feat=indexeddb2 for browsers supporting IndexedDB 2.0
  const isSupportedBrowser = bowser.satisfies({
    chrome: '>=58',
    chromium: '>=58',
    edge: '>=76',
    firefox: '>=51',
    safari: '>=10.1',

    mobile: {
      chrome: '>=78',
      firefox: '>=68',
      opera: '>=46',
      safari: '>=10.3',
      'android browser': '>=76',
      'samsung internet': '>=7.2'
    }
  });
  return isSupportedBrowser ? true : false;
}

export function issuesEmailTemplate(errorId?: string): string {
  const bowser = Bowser.getParser(window.navigator.userAgent);
  const template = `mailto:${environment.issueEmail}?subject=${encodeURIComponent(
    environment.siteName + ' issue'
  )}&body=`;
  const body = `Thanks for reporting the issue!
It would help us if you fill out some of the information below, but please submit even if you can't fill out much.
If you are requesting a feature many of the fields may not be applicable.
Be aware your bug report will be publicly available. Never submit passwords or other secrets.

Bug report
A clear and concise description of what the bug is.

Steps to reproduce
For example:
1. Go to ...
2. Click on ...
3. Scroll down to ...
4. See error

Actual behavior
Please describe actual behavior of the issue you are observing.

Expected behavior
A clear and concise description of what you expected to happen.

Screenshots
If applicable, add screenshots to help explain your issue.

Additional context
Add any other context about the problem here.

Possible solution
Add any possible solutions to the problem here.

Your environment:
Software                 Version
-----------------------------------------
Scripture Forge - ${version}
${bowser.getBrowserName()} - ${bowser.getBrowserVersion()}
${bowser.getOSName()} - ${bowser.getOSVersion() || 'unknown'}

Error id: ${errorId || 'not applicable'}`;
  // Encode all reserved characters in the body because some chars cause problems (e.g. truncating the body)
  return template + encodeURIComponent(body);
}

export function parseJSON(str: string): any | undefined {
  try {
    return JSON.parse(str);
  } catch (err) {
    return undefined;
  }
}

export function verseSlug(verse: VerseRef) {
  return 'verse_' + verse.chapterNum + '_' + verse.verseNum;
}

export const ASP_CULTURE_COOKIE_NAME = '.AspNetCore.Culture';

export function aspCultureCookieValue(language: string): string {
  return `c=${language}|uic=${language}`;
}

/**
 * @param {string} cookie expect string of form "c=<tag>|uic=<tag>" where <tag> is a language tag
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

export function browserLinks() {
  return {
    chromeLink: getLinkHTML(translate('error.chrome'), 'https://www.google.com/chrome/'),
    firefoxLink: getLinkHTML(translate('error.firefox'), 'https://firefox.com')
  };
}

export function getLinkHTML(text: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.setAttribute('target', '_blank');
  a.textContent = text;
  return a.outerHTML;
}
