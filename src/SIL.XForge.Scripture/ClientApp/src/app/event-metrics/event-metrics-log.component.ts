import { Component, OnInit } from '@angular/core';
import { MatDialogConfig } from '@angular/material/dialog';
import { TranslocoModule } from '@ngneat/transloco';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { BehaviorSubject, combineLatest, switchMap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectService } from '../core/sf-project.service';
import { EventMetric } from './event-metric';
import { EventMetricDialogComponent } from './event-metric-dialog.component';

interface Row {
  dialogData: EventMetric;
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

  private pageIndex$ = new BehaviorSubject<number>(0);
  private pageSize$ = new BehaviorSubject<number>(10);
  length: number = 0;

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  get pageIndex(): number {
    return this.pageIndex$.value;
  }

  set pageIndex(value: number) {
    this.pageIndex$.next(value);
  }

  get pageSize(): number {
    return this.pageSize$.value;
  }

  set pageSize(value: number) {
    this.pageSize$.next(value);
  }

  private eventMetrics?: EventMetric[];

  constructor(
    noticeService: NoticeService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly authService: AuthService,
    private readonly dialogService: DialogService,
    private readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService
  ) {
    super(noticeService);
  }

  get isLoading(): boolean {
    return this.eventMetrics == null;
  }

  ngOnInit(): void {
    if (
      !this.columnsToDisplay.includes('details') &&
      (this.authService.currentUserRoles.includes(SystemRole.ServalAdmin) ||
        this.authService.currentUserRoles.includes(SystemRole.SystemAdmin))
    ) {
      this.columnsToDisplay.push('details');
    }
    this.loadingStarted();
    this.subscribe(
      combineLatest([
        this.activatedProjectService.projectId$.pipe(filterNullish()),
        this.pageIndex$,
        this.pageSize$
      ]).pipe(
        switchMap(async ([projectId, pageIndex, pageSize]) => {
          this.loadingStarted();
          var queryResults = await this.projectService.onlineEventMetrics(projectId, pageIndex, pageSize);
          this.length = queryResults.unpagedCount;
          if (Array.isArray(queryResults.results)) {
            this.eventMetrics = queryResults.results as EventMetric[];
          } else {
            this.eventMetrics = [];
          }
          this.generateRows();
          this.loadingFinished();
        })
      )
    );
  }

  openDetailsDialog(dialogData: EventMetric): void {
    const dialogConfig: MatDialogConfig<EventMetric> = {
      data: dialogData
    };
    this.dialogService.openMatDialog(EventMetricDialogComponent, dialogConfig);
  }

  updatePage(pageIndex: number, pageSize: number): void {
    if (pageIndex !== this.pageIndex) {
      this.pageIndex = pageIndex;
    }
    if (pageSize !== this.pageSize) {
      this.pageSize = pageSize;
    }
  }

  private generateRows(): void {
    const rows: Row[] = [];
    for (const eventMetric of this.eventMetrics) {
      rows.push({
        dialogData: eventMetric,
        eventType: this.getEventType(eventMetric),
        scope: eventMetric.scope,
        successful: eventMetric.exception == null,
        timeStamp: this.i18n.formatDate(new Date(eventMetric.timeStamp), { showTimeZone: true }),
        userId: eventMetric.userId
      });
    }
    this.rows = rows;
  }

  private getEventType(eventMetric: EventMetric): string {
    // These values are the functions that have the LogEventMetric attribute, where:
    //  - The case is the name of the method
    //  - The return value is a user friendly description of what the method does
    // NOTE: These values are not localized, but can be localized if needed.
    //       I have not localized at this time because these strings are likely to change based on feedback.
    //       When this feature is mature, these should be localized to help Project Administrators.
    const eventTypeMap: { [key: string]: string } = {
      CancelPreTranslationBuildAsync: 'Cancel draft generation',
      CancelSyncAsync: 'Cancel synchronization with Paratext',
      SetDraftAppliedAsync: "Updated the chapter's draft applied status",
      SetIsValidAsync: 'Marked chapter as valid/invalid',
      SetPreTranslateAsync: 'Set drafting as enabled/disabled for the project',
      SetServalConfigAsync: 'Manually update drafting configuration for the project',
      StartBuildAsync: 'Begin training translation suggestions',
      StartPreTranslationBuildAsync: 'Start draft generation',
      SyncAsync: 'Start synchronization with Paratext'
    };

    // Allow specific cases based on payload values
    if (eventMetric.eventType === 'SetIsValidAsync' && eventMetric.payload['isValid'] === true) {
      return 'Marked chapter as valid';
    } else if (eventMetric.eventType === 'SetIsValidAsync' && eventMetric.payload['isValid'] === false) {
      return 'Marked chapter as invalid';
    } else if (eventMetric.eventType === 'SetDraftAppliedAsync' && eventMetric.payload['draftApplied'] === true) {
      return 'Marked chapter as having draft applied';
    } else if (eventMetric.eventType === 'SetDraftAppliedAsync' && eventMetric.payload['draftApplied'] === false) {
      return 'Marked chapter as not having a draft applied';
    } else if (eventMetric.eventType === 'SetPreTranslateAsync' && eventMetric.payload['preTranslate'] === true) {
      return 'Set drafting as enabled for the project';
    } else if (eventMetric.eventType === 'SetPreTranslateAsync' && eventMetric.payload['preTranslate'] === false) {
      return 'Set drafting as disabled for the project';
    } else {
      return eventTypeMap[eventMetric.eventType] || eventMetric.eventType;
    }
  }
}
