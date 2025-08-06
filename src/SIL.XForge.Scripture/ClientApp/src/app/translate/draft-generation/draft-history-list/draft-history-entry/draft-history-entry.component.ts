import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterModule } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { ProjectScriptureRange } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { forkJoin, from, Observable, of } from 'rxjs';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
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

interface BuildFaultedRow {
  heading: string;
  details: string;
}

interface ConfigurationRow {
  scriptureRange: string;
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
    MatButtonModule,
    MatExpansionModule,
    MatIconModule,
    MatTableModule,
    TranslocoModule,
    RouterModule
  ],
  templateUrl: './draft-history-entry.component.html',
  styleUrl: './draft-history-entry.component.scss'
})
export class DraftHistoryEntryComponent {
  private buildConfigurationRows(scriptureRanges: ProjectScriptureRange[]): Observable<ConfigurationRow[]> {
    if (scriptureRanges.length === 0) {
      return of([]);
    }

    return forkJoin(scriptureRanges.map(r => from(this.resolveConfigurationRow(r))));
  }

  private async resolveConfigurationRow(r: ProjectScriptureRange): Promise<ConfigurationRow> {
    // The engine ID is the target project ID
    let target: SFProjectProfileDoc | undefined = undefined;
    if (this._entry?.engine?.id != null) {
      target = await this.projectService.getProfile(this._entry.engine.id);
    }

    // Get the target language, if it is not already set
    this._targetLanguage ??= target?.data?.writingSystem.tag;

    // Get the source project, if it is configured
    const source =
      r.projectId === '' || r.projectId === target?.id ? undefined : await this.projectService.getProfile(r.projectId);

    // Get the source language, if it is not already set
    this._sourceLanguage ??= source?.data?.writingSystem.tag;

    // Return the data for this training range
    return {
      scriptureRange: this.i18n.formatAndLocalizeScriptureRange(r.scriptureRange),
      source: source?.data?.shortName ?? this.i18n.translateStatic('draft_history_entry.draft_unknown'),
      target: target?.data?.shortName ?? this.i18n.translateStatic('draft_history_entry.draft_unknown')
    } as ConfigurationRow;
  }
  private _entry?: BuildDto;
  @Input() set entry(value: BuildDto | undefined) {
    this._entry = value;

    // Only set if a draft can be downloaded if it is not set externally
    if (this._canDownloadBuild == null) {
      this.canDownloadBuild = this._entry?.additionalInfo?.dateGenerated != null;
    }

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
    this._translationConfiguration = [];

    forkJoin([
      this.buildConfigurationRows(this._entry?.additionalInfo?.trainingScriptureRanges ?? []),
      this.buildConfigurationRows(this._entry?.additionalInfo?.translationScriptureRanges ?? [])
    ]).subscribe(([trainingConfiguration, translationConfiguration]) => {
      // Set the training and translation data for the tables
      this._trainingConfiguration = trainingConfiguration;
      this._translationConfiguration = translationConfiguration;

      // If we can only show training data, expand the training configuration
      if (!this.canDownloadBuild && this.hasTrainingConfiguration) {
        this.trainingConfigurationOpen = true;
      }
    });

    // Populate the exception details, if possible
    if (this._entry?.state === BuildStates.Faulted && this._entry.message != null) {
      this._buildFaulted = true;

      // NOTE: We will not localize the headings, as these are technical details which are primarily for a screenshot
      this._buildFaultDetails.push({
        heading: 'Error\u00A0Message',
        details: this._entry.message
      });
      this._buildFaultDetails.push({
        heading: 'Project\u00A0Id',
        details: this._entry.engine.id
      });
      if (this._entry.additionalInfo?.translationEngineId != null) {
        this._buildFaultDetails.push({
          heading: 'Translation\u00A0Engine\u00A0Id',
          details: this._entry.additionalInfo.translationEngineId
        });
      }
      if (this._entry.additionalInfo?.buildId != null && this._entry.additionalInfo?.buildId !== '') {
        this._buildFaultDetails.push({
          heading: 'Build\u00A0Id',
          details: this._entry.additionalInfo.buildId
        });
      }
      if (this._entry.additionalInfo?.corporaIds != null) {
        this._buildFaultDetails.push({
          heading: 'Corpora\u00A0Id',
          details: this._entry.additionalInfo.corporaIds?.join(', ')
        });
      }
      if (this._entry.additionalInfo?.parallelCorporaIds != null) {
        this._buildFaultDetails.push({
          heading: 'Parallel\u00A0Corpora\u00A0Id',
          details: this._entry.additionalInfo.parallelCorporaIds?.join(', ')
        });
      }
    } else {
      this._buildFaulted = false;
      this._buildFaultDetails = [];
    }
  }
  get entry(): BuildDto | undefined {
    return this._entry;
  }

  private _buildFaulted: boolean = false;
  get buildFaulted(): boolean {
    return this._buildFaulted;
  }

  private _buildFaultDetails: BuildFaultedRow[] = [];
  get buildFaultDetails(): BuildFaultedRow[] {
    return this._buildFaultDetails;
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
    return this.hasTrainingConfiguration || this.canDownloadBuild || this.buildFaulted;
  }

  get hasTrainingConfiguration(): boolean {
    return this._trainingConfiguration.length > 0 || this._translationConfiguration.length > 0;
  }

  private _sourceLanguage?: string = undefined;
  get sourceLanguage(): string {
    return this._sourceLanguage ?? '';
  }

  private _targetLanguage?: string = undefined;
  get targetLanguage(): string {
    return this._targetLanguage ?? '';
  }

  private _trainingConfiguration: ConfigurationRow[] = [];
  get trainingConfiguration(): ConfigurationRow[] {
    return this._trainingConfiguration;
  }

  private _translationConfiguration: ConfigurationRow[] = [];
  get translationConfiguration(): ConfigurationRow[] {
    return this._translationConfiguration;
  }

  private _canDownloadBuild: boolean | undefined;
  @Input() set canDownloadBuild(value: boolean) {
    this._canDownloadBuild = value;
  }
  get canDownloadBuild(): boolean {
    return this._canDownloadBuild ?? false;
  }

  @Input() isLatestBuild = false;

  trainingConfigurationOpen = false;

  readonly columnsToDisplay: string[] = ['scriptureRange', 'source', 'target'];

  constructor(
    readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    readonly featureFlags: FeatureFlagService
  ) {}

  get scriptureRange(): string {
    if (this.entry?.additionalInfo?.translationScriptureRanges == null) return '';
    return this.i18n.formatAndLocalizeScriptureRange(
      this.entry.additionalInfo.translationScriptureRanges.map(item => item.scriptureRange).join(';')
    );
  }

  formatDate(date?: string): string {
    return date == null ? '' : this.i18n.formatDate(new Date(date));
  }

  getStatus(state: BuildStates): { icons: string; text: string; color: string } {
    return STATUS_INFO[state] ?? { icons: 'help_outline', text: 'draft_unknown', color: 'grey' };
  }
}
