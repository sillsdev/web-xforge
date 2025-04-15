import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { BuildDto } from '../../../../machine-api/build-dto';
import { BuildStates } from '../../../../machine-api/build-states';

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
  imports: [MatButtonModule, MatIconModule, TranslocoModule],
  templateUrl: './draft-history-entry.component.html',
  styleUrl: './draft-history-entry.component.scss'
})
export class DraftHistoryEntryComponent {
  @Input() entry?: BuildDto;
  private _forceDetailsOpen = false;
  @Input() set forceDetailsOpen(value: boolean) {
    this._forceDetailsOpen = value;
    if (value) this.detailsOpen = true;
  }
  get forceDetailsOpen(): boolean {
    return this._forceDetailsOpen;
  }
  detailsOpen = false;
  trainingDataOpen = false;

  constructor(readonly i18n: I18nService) {}

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
