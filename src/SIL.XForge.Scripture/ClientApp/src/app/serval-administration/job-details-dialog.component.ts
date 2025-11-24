import { Component, Inject, OnInit } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTab, MatTabGroup } from '@angular/material/tabs';
import { MatTooltip } from '@angular/material/tooltip';
import { I18nService } from 'xforge-common/i18n.service';
import { L10nNumberPipe } from 'xforge-common/l10n-number.pipe';
import { isPopulatedString } from '../../type-utils';
import { EventMetric } from '../event-metrics/event-metric';
import { JsonViewerComponent } from '../shared/json-viewer/json-viewer.component';
import { NoticeComponent } from '../shared/notice/notice.component';
import { DraftGenerationService } from '../translate/draft-generation/draft-generation.service';

interface JobDetailsDialogData {
  buildId: string;
  projectId: string;
  jobStatus: string;
  events: EventMetric[];
  additionalEvents: EventMetric[];
  eventBasedDuration?: string;
  startTime?: string;
  clearmlUrl?: string;
  buildsStartedSince: number;
  draftGenerationRequestId?: string;
}

const EVENT_TYPE_LABELS: {
  [key: string]: { label: string; icon: string; color: string };
} = {
  StartPreTranslationBuildAsync: { label: 'Job Started', icon: 'play_arrow', color: 'primary' },
  BuildProjectAsync: { label: 'Project Build', icon: 'build', color: 'accent' },
  RetrievePreTranslationStatusAsync: { label: 'Job Completed', icon: 'check_circle', color: 'primary' },
  ExecuteWebhookAsync: { label: 'Webhook Executed', icon: 'webhook', color: 'accent' },
  CancelPreTranslationBuildAsync: { label: 'Job Cancelled', icon: 'cancel', color: '' }
};

/**
 * Dialog component to display comprehensive job details including build information, engine data, and event timeline.
 * Provides a tabbed interface for administrators to view all aspects of a draft generation job.
 */
@Component({
  selector: 'app-job-details-dialog',
  templateUrl: './job-details-dialog.component.html',
  styleUrls: ['./job-details-dialog.component.scss'],
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIcon,
    MatProgressSpinner,
    MatTab,
    MatTabGroup,
    MatTooltip,
    JsonViewerComponent,
    NoticeComponent,
    L10nNumberPipe
  ]
})
export class JobDetailsDialogComponent implements OnInit {
  rawBuild: any = null;
  engine: any = null;
  isLoadingBuild = true;
  isLoadingEngine = true;
  buildError: string | null = null;
  engineError: string | null = null;

  constructor(
    readonly i18n: I18nService,
    private readonly draftGenerationService: DraftGenerationService,
    @Inject(MAT_DIALOG_DATA) public data: JobDetailsDialogData
  ) {}

  ngOnInit(): void {
    // Load build and engine data in parallel
    const fullBuildId = `${this.data.projectId}.${this.data.buildId}`;

    // Fetch raw build data
    this.draftGenerationService.getRawBuild(fullBuildId).subscribe({
      next: data => {
        this.rawBuild = data;
        this.isLoadingBuild = false;
      },
      error: () => {
        this.buildError = 'Failed to load build information';
        this.isLoadingBuild = false;
      }
    });

    // Fetch raw engine data (pre-translate is true for draft jobs)
    this.draftGenerationService.getRawEngine(this.data.projectId, true).subscribe({
      next: data => {
        this.engine = data;
        this.isLoadingEngine = false;
      },
      error: () => {
        this.engineError = 'Failed to load engine information';
        this.isLoadingEngine = false;
      }
    });
  }

  get languagePair(): string {
    if (this.engine?.sourceLanguage != null && this.engine?.targetLanguage != null) {
      const sourceLang = this.engine.sourceLanguage;
      const targetLang = this.engine.targetLanguage;

      const sourceWithName = this.formatLanguageWithName(sourceLang);
      const targetWithName = this.formatLanguageWithName(targetLang);

      return `${sourceWithName} → ${targetWithName}`;
    }
    return 'Unknown';
  }

  get stringsTrainedOn(): number {
    return this.rawBuild?.executionData?.trainCount ?? NaN;
  }

  get stringsTranslated(): number {
    return this.rawBuild?.executionData?.pretranslateCount ?? NaN;
  }

  get currentProgress(): string | null {
    if (this.rawBuild?.state !== 'Active' && this.rawBuild?.state !== 'Pending') {
      return null;
    }

    const percentCompleted = this.rawBuild?.percentCompleted;
    if (percentCompleted != null) {
      return `${Math.round(percentCompleted * 100)}%`;
    }

    const step = this.rawBuild?.step;
    const message = this.rawBuild?.message;
    if (step != null || message != null) {
      return `${message ?? 'Processing'} (step ${step ?? '?'})`;
    }

    return 'In progress';
  }

  get servalVersion(): string {
    return this.rawBuild?.deploymentVersion ?? 'Unknown';
  }

  get buildStatus(): string {
    const state = this.rawBuild?.state;
    if (state == null) {
      return 'Unknown';
    }
    return state;
  }

  get languagePairTooltip(): string {
    return (
      'This language pair comes from the current engine configuration. ' +
      (this.data.buildsStartedSince === 1 ? '1 build has' : `${this.data.buildsStartedSince} builds have`) +
      ' started since this build, so the language pair may have changed and may not reflect what was used for this build.'
    );
  }

  get engineInfoNoticeType(): 'warning' | 'primary' {
    return this.data.buildsStartedSince > 0 ? 'warning' : 'primary';
  }

  get engineInfoNoticeText(): string {
    const baseText =
      'Each project has one translation engine in Serval that persists across multiple builds. ' +
      'The engine information shown here reflects the current state of the engine, not necessarily what it was when this build ran.';

    if (this.data.buildsStartedSince === 0) {
      return `${baseText} This is the most recent build for this project, so the engine has not changed since this build started.`;
    } else if (this.data.buildsStartedSince === 1) {
      return (
        `${baseText} 1 build has started on this project since this build began, ` +
        `so the engine may have been modified and may not reflect the configuration used for this build.`
      );
    } else {
      return (
        `${baseText} ${this.data.buildsStartedSince} builds have started on this project since this build began, ` +
        `so the engine may have been modified and may not reflect the configuration used for this build.`
      );
    }
  }

  get draftGenerationRequestIdDisplay(): string {
    if (!isPopulatedString(this.data.draftGenerationRequestId)) return 'none';
    return this.data.draftGenerationRequestId;
  }

  formatDate(timestamp: string): string {
    return this.i18n.formatDate(new Date(timestamp), { showTimeZone: true });
  }

  hasPayload(payload: any): boolean {
    return payload != null && Object.keys(payload).length > 0;
  }

  getEventTypeLabel(eventType: string): string {
    const label = EVENT_TYPE_LABELS[eventType]?.label ?? eventType;
    return `${label} (${eventType})`;
  }

  getEventStatusIcon(eventType: string, hasException: boolean): string {
    if (hasException) return 'error';
    return EVENT_TYPE_LABELS[eventType]?.icon ?? 'info';
  }

  getEventStatusColor(eventType: string, hasException: boolean): string {
    if (hasException) return 'warn';
    return EVENT_TYPE_LABELS[eventType]?.color ?? '';
  }

  private formatLanguageWithName(langCode: string): string {
    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
      const languageName = displayNames.of(langCode);

      if (languageName != null && languageName !== langCode) {
        return `${langCode} (${languageName})`;
      }
    } catch {
      // If Intl.DisplayNames fails or doesn't recognize the code, just return the code
    }

    return langCode;
  }
}
