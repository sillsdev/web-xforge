import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { UserService } from 'xforge-common/user.service';
import { BuildDto } from '../../../../machine-api/build-dto';
import { BuildStates } from '../../../../machine-api/build-states';
import { DraftDownloadButtonComponent } from '../../draft-download-button/draft-download-button.component';

const STATUS_INFO: Record<BuildStates, { icons: string; text: string; color: string }> = {
  ACTIVE: { icons: 'hourglass_empty', text: 'Running', color: 'grey' },
  COMPLETED: { icons: 'check_circle', text: 'Completed', color: 'green' },
  FAULTED: { icons: 'error', text: 'Failed', color: 'red' },
  CANCELED: { icons: 'cancel', text: 'Cancelled', color: 'grey' },
  QUEUED: { icons: 'hourglass_empty', text: 'pending', color: 'grey' },
  PENDING: { icons: 'hourglass_empty', text: 'pending', color: 'grey' },
  FINISHING: { icons: 'hourglass_empty', text: 'pending', color: 'grey' }
};

@Component({
  selector: 'app-draft-history-entry',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, TranslocoModule, DraftDownloadButtonComponent],
  templateUrl: './draft-history-entry.component.html',
  styleUrl: './draft-history-entry.component.scss'
})
export class DraftHistoryEntryComponent {
  private _entry?: BuildDto;
  @Input() set entry(value: BuildDto | undefined) {
    this._entry = value;

    // See if a draft can be downloaded
    this.canDownloadBuild = this._entry?.additionalInfo?.dateGenerated != null;

    // Get the user who requested the build
    this._buildRequestedByUserName = undefined;
    if (this._entry?.additionalInfo?.requestedByUserId != null) {
      this.userService.getProfile(this._entry.additionalInfo.requestedByUserId).then(user => {
        if (user.data != null) {
          this._buildRequestedByUserName = user.data.displayName;
        }
      });
    }
  }
  get entry(): BuildDto | undefined {
    return this._entry;
  }

  private _forceDetailsOpen = false;
  @Input() set forceDetailsOpen(value: boolean) {
    this._forceDetailsOpen = value;
    if (value) this.detailsOpen = true;
  }
  get forceDetailsOpen(): boolean {
    return this._forceDetailsOpen;
  }

  private _buildRequestedByUserName: string | undefined;
  get buildRequestedByUserName(): string | undefined {
    return this._buildRequestedByUserName;
  }

  get buildRequestedByDate(): string {
    if (this._entry?.additionalInfo?.dateRequested == null) return '';
    return this.i18n.formatDate(new Date(this._entry?.additionalInfo?.dateRequested));
  }

  @Input() canDownloadBuild = false;

  detailsOpen = false;
  trainingDataOpen = false;

  constructor(
    readonly i18n: I18nService,
    private readonly userService: UserService
  ) {}

  get bookIds(): string[] {
    if (this.entry?.additionalInfo == null) return [];
    return [...new Set(this.entry.additionalInfo.translationScriptureRanges.flatMap(r => r.scriptureRange.split(';')))];
  }

  get bookNames(): string[] {
    return this.bookIds.map(id => this.i18n.localizeBook(id));
  }

  formatDate(date?: string): string {
    return date == null ? '' : this.i18n.formatDate(new Date(date));
  }

  getStatus(state: BuildStates): { icons: string; text: string; color: string } {
    return STATUS_INFO[state];
  }

  headerClicked(): void {
    if (!this.forceDetailsOpen) this.detailsOpen = !this.detailsOpen;
  }
}
