import Bowser from 'bowser';
import { ObjectId } from 'bson';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { environment } from 'src/environments/environment';
import { version } from '../../../version.json';

export function nameof<T>(name: Extract<keyof T, string>): string {
  return name;
}

export function objectId(): string {
  return new ObjectId().toHexString();
}

export function promiseTimeout<T>(promise: Promise<T>, timeout: number) {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(reject, timeout);
    })
  ]);
}

export function issuesEmailTemplate(errorId?: string): string {
  const bowser = Bowser.getParser(window.navigator.userAgent);
  return encodeURI(`mailto:${environment.issueEmail}?subject=${
    environment.siteName
  } issue&body=Thanks for reporting the issue!
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

Error id: ${errorId || 'not applicable'}
`);
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
