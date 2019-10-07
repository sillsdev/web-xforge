import Bowser from 'bowser';
import { ObjectId } from 'bson';
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
  const errorIdString: string = errorId ? `${errorId} (included so we can provide better support)` : 'not available';
  const bowser = Bowser.getParser(window.navigator.userAgent);
  const xForgeVersion: string = version;
  return encodeURI(`mailto:${environment.issueEmail}?subject=${
    environment.siteName
  } issue&body=Thanks for reporting the issue!
It would help us if you fill out some of the information below, but please submit even if you can't fill out much.
If you are requesting a feature many of the fields may not be applicable.
Be aware your bug report will be publicly available. Never submit passwords or other secrets.

Error id: ${errorIdString}

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

Your environment:
Please complete the following information
Software                 Version(s)
-----------------------------------------
Scripture Forge - ${xForgeVersion}
${bowser.getBrowserName()} - ${bowser.getBrowserVersion()}
${bowser.getOSName()} - ${bowser.getOSVersion()}

Additional context
Add any other context about the problem here.

Possible solution
Add any possible solutions to the problem here.`);
}
