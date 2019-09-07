import { MdcDialog } from '@angular-mdc/web';
import { ErrorHandler, Injectable } from '@angular/core';
import bugsnag from '@bugsnag/js';
import Q from 'q';
import { User } from 'realtime-server/lib/common/models/user';
import { version } from '../../../version.json';
import { ErrorAlert, ErrorComponent } from './error/error.component';
import { UserDoc } from './models/user-doc.js';
import { UserService } from './user.service.js';

type BugsnagStyleUser = User & { id: string };

@Injectable()
export class ExceptionHandlingService implements ErrorHandler {
  private alertQueue: ErrorAlert[] = [];
  private dialogOpen = false;
  private currentUser: UserDoc;
  private constructionTime = Date.now();

  private bugsnagClient = bugsnag({
    apiKey: '<API_KEY>', // TODO reference actual api key
    appVersion: version,
    appType: 'angular',
    notifyReleaseStages: ['live', 'qa'],
    releaseStage: this.releaseStage,
    autoNotify: false,
    trackInlineScripts: false
  });

  constructor(private readonly dialog: MdcDialog, private userService: UserService) {}

  async handleError(error: any) {
    error = error.rejection && error.rejection.message ? error.rejection : error;

    console.log(`Error occured. Reporting to Bugsnag with release stage set to ${this.releaseStage}:`);
    console.error(error);

    let message = typeof error.message === 'string' ? error.message.split('\n')[0] : 'Unknown error';

    if (
      message.includes('A mutation operation was attempted on a database that did not allow mutations.') &&
      window.navigator.userAgent.includes('Gecko/')
    ) {
      message = 'Firefox private browsing mode is not supported because IndexedDB is not avilable.';
    }

    const eventId = this.createEventId();
    this.handleAlert({ message, stack: error.stack, eventId });
    this.reportToBugsnag(error, await this.getUserForBugsnag(), eventId);
  }

  /**
   * Returns a promise that will resolve to a BugsnagStyleUser representing the current user, or, if the user isn't
   * available within a reasonable time (within three seconds of the service being constructed), it will resolve with
   * null.
   */
  private async getUserForBugsnag(): Promise<BugsnagStyleUser | undefined> {
    if (!this.currentUser) {
      try {
        this.currentUser = await Q.timeout(
          Q(this.userService.getCurrentUser()),
          Math.max(0, this.constructionTime + 3000 - Date.now())
        );
      } catch {
        return undefined;
      }
    }
    const user = Object.assign({}, this.currentUser.data);
    (user as any).id = user.authId;
    return user as BugsnagStyleUser;
  }

  private reportToBugsnag(error: any, user: BugsnagStyleUser, eventId: string) {
    this.bugsnagClient.notify(
      error,
      {
        user,
        metaData: {
          eventId
        }
      },
      err => {
        if (err) {
          console.error('Reporting error to Bugsnag failed:');
          console.error(err);
        }
      }
    );
  }

  private handleAlert(error: ErrorAlert) {
    if (!this.alertQueue.some(alert => alert.message === error.message)) {
      this.alertQueue.unshift(error);
      this.showAlert();
    }
  }

  private showAlert() {
    if (!this.dialogOpen && this.alertQueue.length) {
      this.dialogOpen = true;
      const dialog = this.dialog.open(ErrorComponent, { data: this.alertQueue[this.alertQueue.length - 1] });
      dialog.afterClosed().subscribe(() => {
        this.alertQueue.pop();
        this.dialogOpen = false;
        this.showAlert();
      });
    }
  }

  private get releaseStage() {
    const parts = location.hostname.split('.');
    if (parts.pop() === 'org') {
      return parts.includes('qa') ? 'qa' : 'live';
    } else {
      return 'development';
    }
  }

  private createEventId() {
    return ('00000000' + Math.floor(Math.random() * (0xffffffff + 1)).toString(16)).slice(-8) + Date.now().toString(16);
  }
}
