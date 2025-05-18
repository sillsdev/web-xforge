import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
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

interface TrainingConfigurationRow {
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
    MatExpansionModule,
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
    this._trainingConfiguration = [];

    // Get the books used in the training configuration
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

        // Get the source project, if it is configured
        const source = r.projectId === '' ? undefined : await this.projectService.getProfile(r.projectId);

        // Get the source language, if it is not already set
        this._sourceLanguage ??= source?.data?.writingSystem.tag;

        // Return the data for this training range
        return {
          bookNames: r.scriptureRange.split(';').map(id => this.i18n.localizeBook(id)),
          source: source?.data?.shortName ?? this.i18n.translateStatic('draft_history_entry.draft_unknown'),
          target: target?.data?.shortName ?? this.i18n.translateStatic('draft_history_entry.draft_unknown')
        } as TrainingConfigurationRow;
      })
    ).then(trainingConfiguration => {
      // Set the training data for the table
      this._trainingConfiguration = trainingConfiguration;

      // If we can only show training data, expand the training configuration
      if (!this.canDownloadBuild && this.hasTrainingConfiguration) {
        this.trainingConfigurationOpen = true;
      }
    });
  }
  get entry(): BuildDto | undefined {
    return this._entry;
  }

  private _buildRequestedByUserName: string | undefined;
  get buildRequestedByUserName(): string | undefined {
    return this._buildRequestedByUserName;
  }

  get buildRequestedByDate(): string {
    if (this._entry?.additionalInfo?.dateRequested == null) return '';
    return this.i18n.formatDate(new Date(this._entry?.additionalInfo?.dateRequested));
  }

  get hasDetails(): boolean {
    return this.hasTrainingConfiguration || this.canDownloadBuild;
  }

  get hasTrainingConfiguration(): boolean {
    return this._trainingConfiguration.length > 0;
  }

  private _sourceLanguage?: string = undefined;
  get sourceLanguage(): string {
    return this._sourceLanguage ?? '';
  }

  private _targetLanguage?: string = undefined;
  get targetLanguage(): string {
    return this._targetLanguage ?? '';
  }

  private _trainingConfiguration: TrainingConfigurationRow[] = [];
  get trainingConfiguration(): TrainingConfigurationRow[] {
    return this._trainingConfiguration;
  }

  @Input() canDownloadBuild = false;
  @Input() forceDetailsOpen = false;

  trainingConfigurationOpen = false;

  readonly columnsToDisplay: string[] = ['bookNames', 'source', 'target'];

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
}
