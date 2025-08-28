import { Component, DestroyRef } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import ObjectID from 'bson-objectid';
import { take } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { ProjectNotificationService } from '../../../core/project-notification.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { BuildStates } from '../../../machine-api/build-states';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { activeBuildStates } from '../draft-generation';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftHistoryEntryComponent } from './draft-history-entry/draft-history-entry.component';

@Component({
    selector: 'app-draft-history-list',
    imports: [MatIconModule, DraftHistoryEntryComponent, TranslocoModule, NoticeComponent],
    templateUrl: './draft-history-list.component.html',
    styleUrl: './draft-history-list.component.scss'
})
export class DraftHistoryListComponent {
  showOlderDraftsNotSupportedWarning: boolean = false;
  history: BuildDto[] = [];
  // This is just after SFv5.33.0 was released
  readonly draftHistoryCutOffDate: Date = new Date('2025-06-03T21:00:00Z');
  readonly draftHistoryCutOffDateFormatted: string = this.i18n.formatDate(this.draftHistoryCutOffDate);

  constructor(
    activatedProject: ActivatedProjectService,
    private destroyRef: DestroyRef,
    private readonly draftGenerationService: DraftGenerationService,
    projectNotificationService: ProjectNotificationService,
    private readonly transloco: TranslocoService,
    private readonly i18n: I18nService
  ) {
    activatedProject.projectId$
      .pipe(quietTakeUntilDestroyed(destroyRef), filterNullish(), take(1))
      .subscribe(async projectId => {
        // Determine whether to show or hide the older drafts warning
        this.showOlderDraftsNotSupportedWarning =
          ObjectID.isValid(projectId) && new ObjectID(projectId).getTimestamp() < this.draftHistoryCutOffDate;
        // Initially load the history
        this.loadHistory(projectId);
        // Start the connection to SignalR
        await projectNotificationService.start();
        // Subscribe to notifications for this project
        await projectNotificationService.subscribeToProject(projectId);
        // When build notifications are received, reload the build history
        // NOTE: We do not need the build state, so just ignore it.
        projectNotificationService.setNotifyBuildProgressHandler((projectId: string) => {
          this.loadHistory(projectId);
        });
      });
    destroyRef.onDestroy(async () => {
      // Stop the SignalR connection when the component is destroyed
      await projectNotificationService.stop();
    });
  }

  get nonActiveBuilds(): BuildDto[] {
    return this.history.filter(entry => !activeBuildStates.includes(entry.state)) || [];
  }

  get latestBuild(): BuildDto | undefined {
    return this.isBuildActive ? undefined : this.nonActiveBuilds[0];
  }

  get latestBuildHasCompleted(): boolean {
    return this.latestBuild?.state === BuildStates.Completed;
  }

  get lastCompletedBuildMessage(): string {
    switch (this.latestBuild?.state) {
      case BuildStates.Canceled:
        return this.transloco.translate('draft_history_list.draft_canceled');
      case BuildStates.Completed:
        return this.transloco.translate('draft_history_list.draft_completed');
      case BuildStates.Faulted:
        return this.transloco.translate('draft_history_list.draft_faulted');
      default:
        // The latest build must be a build that has finished
        return '';
    }
  }

  get isBuildActive(): boolean {
    return this.history.some(entry => activeBuildStates.includes(entry.state)) ?? false;
  }

  get savedHistoricalBuilds(): BuildDto[] {
    // The requested date, if not set for the build in MongoDB, will be set based on the build id in the Machine API
    return this.historicalBuilds.filter(
      entry =>
        entry.additionalInfo?.dateRequested != null &&
        new Date(entry.additionalInfo.dateRequested) > this.draftHistoryCutOffDate
    );
  }

  private get historicalBuilds(): BuildDto[] {
    return this.latestBuild == null ? this.nonActiveBuilds : this.nonActiveBuilds.slice(1);
  }

  loadHistory(projectId: string): void {
    this.draftGenerationService
      .getBuildHistory(projectId)
      .pipe(take(1), quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        this.history = result?.reverse() ?? [];
      });
  }
}
