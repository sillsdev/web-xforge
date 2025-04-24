import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { TranslocoModule } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { BuildDto } from '../../../../machine-api/build-dto';
import { BuildStates } from '../../../../machine-api/build-states';
import { DraftDownloadButtonComponent } from '../../draft-download-button/draft-download-button.component';
import { DraftPreviewBooksComponent } from '../../draft-preview-books/draft-preview-books.component';

const STATUS_INFO: Record<BuildStates, { icons: string; text: string; color: string }> = {
  ACTIVE: { icons: 'hourglass_empty', text: 'draft_active', color: 'grey' },
  COMPLETED: { icons: 'check_circle', text: 'draft_completed', color: 'green' },
  FAULTED: { icons: 'error', text: 'draft_faulted', color: 'red' },
  CANCELED: { icons: 'cancel', text: 'draft_canceled', color: 'grey' },
  QUEUED: { icons: 'hourglass_empty', text: 'draft_pending', color: 'grey' },
  PENDING: { icons: 'hourglass_empty', text: 'draft_pending', color: 'grey' },
  FINISHING: { icons: 'hourglass_empty', text: 'draft_pending', color: 'grey' }
};

interface TrainingDataRow {
  bookNames: string[];
  source: string;
  target: string;
}

@Component({
  selector: 'app-draft-history-entry',
  standalone: true,
  imports: [
    CommonModule,
    DraftDownloadButtonComponent,
    DraftPreviewBooksComponent,
    MatIconModule,
    MatTableModule,
    TranslocoModule
  ],
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

    // Clear the data for the table
    this._sourceLanguage = undefined;
    this._targetLanguage = undefined;
    this._trainingData = [];

    // Get the training data
    const trainingScriptureRanges = this.entry?.additionalInfo?.trainingScriptureRanges ?? [];
    Promise.all(
      trainingScriptureRanges.map(async r => {
        // The engine ID is the target project ID
        let target: SFProjectProfileDoc | undefined = undefined;
        if (this.entry?.engine.id != null) {
          target = await this.projectService.getProfile(this.entry?.engine.id);
        }

        // Get the target language, if it is not already set
        this._targetLanguage ??= target?.data?.writingSystem.tag;

        // Get the source project
        const source = await this.projectService.getProfile(r.projectId);

        // Get the source language, if it is not already set
        this._sourceLanguage ??= source?.data?.writingSystem.tag;

        // Return the data for this training range
        return {
          bookNames: r.scriptureRange.split(';').map(id => this.i18n.localizeBook(id)),
          source: source?.data?.shortName ?? '',
          target: target?.data?.shortName ?? ''
        } as TrainingDataRow;
      })
    ).then(trainingData => {
      // Set the training data for the table
      this._trainingData = trainingData;

      // If we can only show training data, expand the training data
      if (!this.canDownloadBuild && this.hasTrainingData) {
        this.trainingDataOpen = true;
      }
    });
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

  get columnsToDisplay(): string[] {
    return ['bookNames', 'source', 'target'];
  }

  get hasDetails(): boolean {
    return this.hasTrainingData || this.canDownloadBuild;
  }

  get hasTrainingData(): boolean {
    return this._trainingData.length > 0;
  }

  private _sourceLanguage?: string = undefined;
  get sourceLanguage(): string {
    return this._sourceLanguage ?? '';
  }

  private _targetLanguage?: string = undefined;
  get targetLanguage(): string {
    return this._targetLanguage ?? '';
  }

  private _trainingData: TrainingDataRow[] = [];
  get trainingData(): TrainingDataRow[] {
    return this._trainingData;
  }

  @Input() canDownloadBuild = false;

  detailsOpen = false;
  trainingDataOpen = false;

  constructor(
    readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {}

  get bookNames(): string[] {
    if (this.entry?.additionalInfo?.translationScriptureRanges == null) return [];
    return [
      ...new Set(
        this.entry.additionalInfo.translationScriptureRanges.flatMap(r =>
          r.scriptureRange.split(';').map(id => this.i18n.localizeBook(id))
        )
      )
    ];
  }

  formatDate(date?: string): string {
    return date == null ? '' : this.i18n.formatDate(new Date(date));
  }

  getStatus(state: BuildStates): { icons: string; text: string; color: string } {
    return STATUS_INFO[state] ?? { icons: 'help_outline', text: 'draft_unknown', color: 'grey' };
  }

  headerClicked(): void {
    if (!this.forceDetailsOpen) this.detailsOpen = !this.detailsOpen;
  }
}
