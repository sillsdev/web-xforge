import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { browserLinks, getLinkHTML, issuesEmailTemplate, supportedBrowser } from 'xforge-common/utils';
import { environment } from '../../environments/environment';
import { I18nService } from '../i18n.service';

export interface ErrorAlertData {
  message: string;
  stack?: string;
  eventId: string;
}

@Component({
  templateUrl: './error-dialog.component.html',
  styleUrls: ['./error-dialog.component.scss'],
  standalone: false
})
export class ErrorDialogComponent implements OnInit {
  initComplete = false;
  showDetails = false;
  browserUnsupported = !supportedBrowser();
  outsideAngularErrorDialog?: OutsideAngularErrorDialog;

  issueEmailLink = getLinkHTML(
    environment.issueEmail,
    issuesEmailTemplate({
      errorId: this.data.eventId,
      errorMessage: this.data.message
    })
  );

  constructor(
    public dialogRef: MatDialogRef<ErrorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ErrorAlertData,
    readonly i18n: I18nService
  ) {
    // If the dialog doesn't init in the expected time, open the outsideAngularErrorDialog
    setTimeout(() => {
      if (!this.initComplete) this.openOutsideAngularErrorDialog();
    }, 100);
  }

  get browserLinks(): { chromeLink: string; firefoxLink: string; safariLink: string } {
    return browserLinks();
  }

  ngOnInit(): void {
    this.initComplete = true;
    // In the unlikely event that this dialog didn't init in the expected time, but eventually did init, and the
    // outsideAngularErrorDialog was wrongly created, close it.
    if (this.outsideAngularErrorDialog != null) {
      this.outsideAngularErrorDialog.close();
    }
  }

  openOutsideAngularErrorDialog(): void {
    this.outsideAngularErrorDialog = new OutsideAngularErrorDialog(
      this.data.message,
      issuesEmailTemplate({
        errorId: this.data.eventId,
        errorMessage: this.data.message
      })
    );
  }
}

/**
 * This is a last-ditch error dialog for when an error prevents Angular from rendering the error dialog, such as when
 * there's an error happening in every Angular digest cycle.
 * It is not internationalized, and is not intended to look like the normal error dialog.
 */
class OutsideAngularErrorDialog {
  private dialogElement: HTMLDialogElement;

  constructor(message: string, linkUrl: string) {
    // Elements
    this.dialogElement = document.createElement('dialog');
    const titleElement = document.createElement('h1');
    const messageElement = document.createElement('p');
    const issueLinkWrapper = document.createElement('p');
    const issueLinkElement = document.createElement('a');
    const closeElement = document.createElement('button');

    // Text content
    titleElement.textContent = 'An error has occurred';
    messageElement.textContent = `Error: ${message}`;
    issueLinkElement.textContent = `Report error to ${environment.issueEmail}`;
    closeElement.textContent = 'Close';

    // Report issue link
    issueLinkElement.href = linkUrl;
    issueLinkElement.target = '_blank';
    issueLinkWrapper.appendChild(issueLinkElement);

    // Close button
    closeElement.onclick = () => this.close();

    // Assemble element tree
    this.dialogElement.appendChild(titleElement);
    this.dialogElement.appendChild(messageElement);
    this.dialogElement.appendChild(issueLinkWrapper);
    this.dialogElement.appendChild(closeElement);

    // Create and open dialog
    document.body.appendChild(this.dialogElement);
    this.dialogElement.showModal();
  }

  close(): void {
    this.dialogElement.close();
    this.dialogElement.remove();
  }
}
