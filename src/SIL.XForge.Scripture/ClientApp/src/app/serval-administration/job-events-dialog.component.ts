import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { I18nService } from 'xforge-common/i18n.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { EventMetric } from '../event-metrics/event-metric';

interface JobEventsDialogData {
  projectId: string;
  jobStatus: string;
  events: EventMetric[];
}

const EVENT_TYPE_LABELS: {
  [key: string]: { label: string; icon: string; color: string };
} = {
  StartPreTranslationBuildAsync: { label: 'Job Started', icon: 'play_arrow', color: 'primary' },
  BuildProjectAsync: { label: 'Project Build', icon: 'build', color: 'accent' },
  RetrievePreTranslationStatusAsync: { label: 'Job Completed', icon: 'check_circle', color: 'primary' },
  CancelPreTranslationBuildAsync: { label: 'Job Cancelled', icon: 'cancel', color: '' }
};

/**
 * Dialog component to show all events that were grouped together to create a draft job.
 * This helps administrators understand how jobs are derived from event metrics.
 */
@Component({
    selector: 'app-job-events-dialog',
    templateUrl: './job-events-dialog.component.html',
    styleUrls: ['./job-events-dialog.component.scss'],
    imports: [CommonModule, MatDialogModule, UICommonModule]
})
export class JobEventsDialogComponent {
  constructor(
    readonly i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) public data: JobEventsDialogData
  ) {}

  formatDate(timestamp: string): string {
    return this.i18n.formatDate(new Date(timestamp), { showTimeZone: true });
  }

  hasPayload(payload: any): boolean {
    return payload != null && Object.keys(payload).length > 0;
  }

  getEventTypeLabel(eventType: string): string {
    return EVENT_TYPE_LABELS[eventType]?.label ?? eventType;
  }

  getEventStatusIcon(eventType: string, hasException: boolean): string {
    if (hasException) return 'error';
    else return EVENT_TYPE_LABELS[eventType]?.icon ?? 'info';
  }

  getEventStatusColor(eventType: string, hasException: boolean): string {
    if (hasException) return 'warn';
    else return EVENT_TYPE_LABELS[eventType]?.color ?? '';
  }
}
