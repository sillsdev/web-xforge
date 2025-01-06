import { Component, OnInit } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { switchMap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectService } from '../core/sf-project.service';
import { EventMetric } from './event-metric';

interface Row {
  eventType: string;
  scope: string;
  timeStamp: string;
  userId: string;
  successful: boolean;
}

@Component({
  selector: 'app-event-metrics-log',
  templateUrl: './event-metrics-log.component.html',
  styleUrls: ['./event-metrics-log.component.scss'],
  standalone: true,
  imports: [OwnerComponent, TranslocoModule, UICommonModule]
})
export class EventMetricsLogComponent extends DataLoadingComponent implements OnInit {
  columnsToDisplay: string[] = ['scope', 'eventType', 'successful', 'author'];
  rows: Row[] = [];

  pageIndex: number = 0;
  pageSize: number = 50;

  private eventMetrics?: Readonly<EventMetric[]>;

  constructor(
    noticeService: NoticeService,
    private readonly i18n: I18nService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly projectService: SFProjectService
  ) {
    super(noticeService);
  }

  get isLoading(): boolean {
    return this.eventMetrics == null;
  }

  ngOnInit(): void {
    this.loadingStarted();
    this.subscribe(
      this.activatedProjectService.projectId$.pipe(
        filterNullish(),
        switchMap(async projectId => {
          this.eventMetrics = await this.projectService.onlineEventMetrics(projectId, this.pageIndex, this.pageSize);
          this.generateRows();
          this.loadingFinished();
        })
      )
    );
  }

  private generateRows(): void {
    if (this.eventMetrics == null) {
      return;
    }

    const rows: Row[] = [];
    for (const eventMetric of this.eventMetrics) {
      rows.push({
        eventType: this.getEventType(eventMetric.eventType),
        scope: eventMetric.scope,
        successful: eventMetric.exception == null,
        timeStamp: this.i18n.formatDate(new Date(eventMetric.timeStamp), { showTimeZone: true }),
        userId: eventMetric.userId
      });
    }
    this.rows = rows;
  }

  private getEventType(eventType: string): string {
    // These values are the functions that have the LogEventMetric attribute, where:
    //  - The case is the name of the method
    //  - The return value is a user friendly description of what the method does
    // NOTE: These values are not localized, but can be localized if needed.
    //       I have not localized at this time because these strings are likely to change based on feedback.
    //       When this feature is mature, these should be localized to help Project Administrators.
    switch (eventType) {
      case 'CancelPreTranslationBuildAsync':
        return 'Cancel draft generation';
      case 'CancelSyncAsync':
        return 'Cancel synchronization with Paratext';
      case 'SetDraftAppliedAsync':
        return "Updated the chapter's draft applied status";
      case 'SetIsValidAsync':
        return 'Marked chapter as valid/invalid';
      case 'SetPreTranslateAsync':
        return 'Set drafting as enabled/disabled for the project';
      case 'SetServalConfigAsync':
        return 'Manually update drafting configuration for the project';
      case 'StartBuildAsync':
        return 'Begin training translation suggestions';
      case 'StartPreTranslationBuildAsync':
        return 'Start draft generation';
      case 'SyncAsync':
        return 'Start synchronization with Paratext';
      default:
        return eventType;
    }
  }
}
