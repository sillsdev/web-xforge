import { NgClass } from '@angular/common';
import { Component, DestroyRef, Input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import {
  MatExpansionPanel,
  MatExpansionPanelDescription,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle
} from '@angular/material/expansion';
import { MatIcon } from '@angular/material/icon';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatRow,
  MatRowDef,
  MatTable
} from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { Subject, takeUntil } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { UserService } from 'xforge-common/user.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { PermissionsService } from '../../../../core/permissions.service';
import { SFProjectService } from '../../../../core/sf-project.service';
import { BuildDto } from '../../../../machine-api/build-dto';
import { BuildStates } from '../../../../machine-api/build-states';
import { NoticeComponent } from '../../../../shared/notice/notice.component';
import { booksFromScriptureRange } from '../../../../shared/utils';
import { RIGHT_TO_LEFT_MARK } from '../../../../shared/verse-utils';
import { DraftDownloadButtonComponent } from '../../draft-download-button/draft-download-button.component';
import { DraftImportWizardComponent } from '../../draft-import-wizard/draft-import-wizard.component';
import { DraftOptionsService } from '../../draft-options.service';
import { DraftPreviewBooksComponent } from '../../draft-preview-books/draft-preview-books.component';
import { DraftSourcesAsTranslateSourceArrays, projectToDraftSources } from '../../draft-utils';
import { TrainingDataService } from '../../training-data/training-data.service';

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

interface TrainingConfigurationRow {
  scriptureRange: string;
  source: string;
  target: string;
}

interface SourceInfo {
  projectRef: string;
  shortName?: string;
  writingSystem?: { tag: string };
}

@Component({
  selector: 'app-draft-history-entry',
  imports: [
    NgClass,
    DraftDownloadButtonComponent,
    DraftPreviewBooksComponent,
    MatButton,
    MatExpansionPanel,
    MatExpansionPanelDescription,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    MatIcon,
    MatTable,
    MatColumnDef,
    MatHeaderCell,
    MatHeaderCellDef,
    MatCell,
    MatCellDef,
    MatHeaderRow,
    MatHeaderRowDef,
    MatRow,
    MatRowDef,
    NoticeComponent,
    RouterLink,
    TranslocoModule,
    TranslocoMarkupModule
  ],
  templateUrl: './draft-history-entry.component.html',
  styleUrl: './draft-history-entry.component.scss'
})
export class DraftHistoryEntryComponent {
  private _entry?: BuildDto;
  private entryChanged: Subject<void> = new Subject<void>();

  @Input() set entry(value: BuildDto | undefined) {
    this._entry = value;
    this.entryChanged.next();

    // Only set if a draft can be downloaded if it is not set externally
    if (this._draftIsAvailable == null) {
      this.draftIsAvailable = this._entry?.additionalInfo?.dateGenerated != null;
    }

    // Get the user who requested the build
    this._buildRequestedByUserName = undefined;
    if (this._entry?.additionalInfo?.requestedByUserId != null) {
      void this.userService
        .getProfile(this._entry.additionalInfo.requestedByUserId, new DocSubscription('DraftHistoryEntry', this.destroyRef))
        .then(user => {
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
    const trainingScriptureRanges = this._entry?.additionalInfo?.trainingScriptureRanges ?? [];
    void Promise.all(
      trainingScriptureRanges.map(async r => {
        // The engine ID is the target project ID
        const { target, source } = await this.getProjectSourceInfo(value?.engine.id, r.projectId, 'training');

        // Get the target language, if it is not already set
        this._targetLanguage ??= target?.data?.writingSystem?.tag;

        // Get the source language, if it is not already set
        this._sourceLanguage ??= source?.writingSystem?.tag;

        // Return the data for this training range
        return {
          scriptureRange: r.scriptureRange,
          source: source?.shortName ?? this.i18n.translateStatic('draft_history_entry.draft_unknown'),
          target: target?.data?.shortName ?? this.i18n.translateStatic('draft_history_entry.draft_unknown')
        } as TrainingConfigurationRow;
      })
    ).then(trainingConfiguration => {
      // Set the training data for the table
      this._trainingConfiguration = trainingConfiguration;

      // If we can only show training data, expand the training configuration
      if (!this.draftIsAvailable && this.hasTrainingConfiguration) {
        this.trainingConfigurationOpen = true;
      }
    });

    // Get the translation scripture range and project (usually one, but in the future will be multiple)
    const translationScriptureRanges = this._entry?.additionalInfo?.translationScriptureRanges ?? [];
    this._scriptureRange = translationScriptureRanges.map(item => item.scriptureRange).join(';');
    this._translationSources = [];
    void Promise.all(
      translationScriptureRanges.map(async r => {
        // The engine ID is the target project ID
        const { source } = await this.getProjectSourceInfo(value?.engine.id, r.projectId, 'drafting');
        const sourceShortName = source?.shortName;
        if (sourceShortName != null) this._translationSources.push(sourceShortName);
      })
    );

    const trainingDataFiles: string[] = this._entry?.additionalInfo?.trainingDataFileIds ?? [];
    if (this.activatedProjectService.projectId != null && trainingDataFiles.length > 0) {
      // Deleted training data is needed to show historical builds
      this.trainingDataService
        .getTrainingData(this.activatedProjectService.projectId, this.destroyRef, { includeDeleted: true })
        .pipe(quietTakeUntilDestroyed(this.destroyRef), takeUntil(this.entryChanged))
        .subscribe(allFiles => {
          this._trainingDataFiles = trainingDataFiles
            .map(fileId => allFiles.find(f => f.dataId === fileId))
            .filter(file => file != null)
            .map(file => file!.title);
        });
    }

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

  get buildRequestedAtDate(): string {
    if (this._entry?.additionalInfo?.dateRequested == null) return '';
    return this.formatDate(this._entry?.additionalInfo?.dateRequested);
  }

  get hasDetails(): boolean {
    return (
      this.hasTrainingConfiguration ||
      this.draftIsAvailable ||
      this.buildFaulted ||
      this.buildRequestedByUserName != null
    );
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

  private _trainingDataFiles: string[] = [];
  get trainingDataFiles(): string[] {
    return this._trainingDataFiles;
  }

  get hasTrainingDataFiles(): boolean {
    return this._trainingDataFiles.length > 0;
  }

  private _draftIsAvailable: boolean | undefined;
  @Input() set draftIsAvailable(value: boolean) {
    this._draftIsAvailable = value;
  }
  get draftIsAvailable(): boolean {
    return this._draftIsAvailable ?? false;
  }

  private _scriptureRange?: string = undefined;
  get scriptureRange(): string {
    return this._scriptureRange ?? '';
  }

  private _translationSources: string[] = [];
  get translationSource(): string {
    if (this._translationSources.length === 0) return '';
    return this.i18n.enumerateList(this._translationSources) + ' \u2022'; // &bull; •
  }

  get formattingOptionsSelected(): boolean {
    return this.draftOptionsService.areFormattingOptionsSelected();
  }

  get formattingOptionsSupported(): boolean {
    return this.draftOptionsService.areFormattingOptionsSupportedForBuild(this.entry);
  }

  @Input() isLatestBuild: boolean = false;
  trainingConfigurationOpen = false;

  readonly columnsToDisplay: string[] = ['scriptureRange', 'source', 'target'];

  private readonly showPerChapterRemarksNoticeExpireDate: Date = new Date('2026-12-31T12:00:00.000Z');

  readonly timeframeForPerChapterRemarksNotice: boolean =
    Date.now() < this.showPerChapterRemarksNoticeExpireDate.getTime();

  constructor(
    readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly trainingDataService: TrainingDataService,
    private readonly activatedProjectService: ActivatedProjectService,
    protected readonly draftOptionsService: DraftOptionsService,
    private readonly permissionsService: PermissionsService,
    private readonly destroyRef: DestroyRef,
    private readonly dialog: MatDialog
  ) {}

  formatDate(date?: string): string {
    const formattedDate = date == null ? '' : this.i18n.formatDate(new Date(date));
    return formattedDate.indexOf(RIGHT_TO_LEFT_MARK) !== -1 ? RIGHT_TO_LEFT_MARK + formattedDate : formattedDate;
  }

  versionIsAtLeast(version: string | undefined, isAtLeast: string): boolean {
    const parse = (v: string | undefined): [number, number] => {
      const match = v?.match(/^(\d+)\.(\d+)/);
      if (!match) return [0, 0];
      return [Number(match[1]), Number(match[2])];
    };

    const [major1, minor1] = parse(version);
    const [major2, minor2] = parse(isAtLeast);

    return major1 !== major2 ? major1 > major2 : minor1 >= minor2;
  }

  getStatus(state: BuildStates): { icons: string; text: string; color: string } {
    return STATUS_INFO[state] ?? { icons: 'help_outline', text: 'draft_unknown', color: 'grey' };
  }

  trainingFilesString(files: string[]): string {
    return this.i18n.enumerateList(files);
  }

  getScriptureRangeAsLocalizedBooks(scriptureRange: string): string {
    return this.i18n.enumerateList(booksFromScriptureRange(scriptureRange).map(b => this.i18n.localizeBook(b)));
  }

  openImportWizard(): void {
    if (this._entry == null) return;

    this.dialog.open(DraftImportWizardComponent, {
      data: this._entry,
      width: '800px',
      maxWidth: '90vw',
      disableClose: false,
      panelClass: 'use-application-text-color'
    });
  }

  private async getProjectSourceInfo(
    targetId: string | undefined,
    sourceId: string,
    type: 'training' | 'drafting'
  ): Promise<{ target: SFProjectProfileDoc | undefined; source: SourceInfo | undefined }> {
    let target: SFProjectProfileDoc | undefined = undefined;
    let draftSources: DraftSourcesAsTranslateSourceArrays | undefined;
    if (targetId != null) {
      target = await this.projectService.getProfile(targetId, new DocSubscription('DraftHistoryEntry', this.destroyRef));
      if (target?.data != null) {
        draftSources = projectToDraftSources(target.data);
      }
    }
    let source: SourceInfo | undefined;
    if (await this.permissionsService.isUserOnProject(sourceId)) {
      const translationSource: SFProjectProfileDoc | undefined = await this.projectService.getProfile(
        sourceId,
        new DocSubscription('DraftHistoryEntry', this.destroyRef)
      );
      source = {
        projectRef: sourceId,
        shortName: translationSource?.data?.shortName,
        writingSystem: translationSource?.data?.writingSystem
      };
    } else {
      if (type === 'drafting') {
        source = draftSources?.draftingSources.find(s => s.projectRef === sourceId);
      } else {
        source = draftSources?.trainingSources.find(s => s.projectRef === sourceId);
      }
    }
    return { target, source };
  }
}
