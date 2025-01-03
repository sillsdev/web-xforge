import { Component, OnInit } from '@angular/core';
import { switchMap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectService } from '../core/sf-project.service';
import { EventMetric } from './event-metric';

interface Row {
  scope: string;
  timestamp: string;
}

@Component({
  selector: 'app-event-metrics-log',
  templateUrl: './event-metrics-log.component.html',
  styleUrls: ['./event-metrics-log.component.scss'],
  standalone: true,
  imports: [UICommonModule]
})
export class EventMetricsLogComponent extends DataLoadingComponent implements OnInit {
  columnsToDisplay: string[] = ['timestamp', 'scope'];
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
        scope: eventMetric.scope,
        timestamp: this.i18n.formatDate(eventMetric.timeStamp)
      });
    }
    this.rows = rows;
  }
}
