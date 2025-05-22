import { Component, DestroyRef } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { take } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { ProjectNotificationService } from '../../../core/project-notification.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { BuildStates } from '../../../machine-api/build-states';
import { activeBuildStates } from '../draft-generation';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftHistoryEntryComponent } from './draft-history-entry/draft-history-entry.component';

@Component({
  selector: 'app-draft-history-list',
  standalone: true,
  imports: [MatIconModule, DraftHistoryEntryComponent, TranslocoModule],
  templateUrl: './draft-history-list.component.html',
  styleUrl: './draft-history-list.component.scss'
})
export class DraftHistoryListComponent {
  history: BuildDto[] = [];

  constructor(
    activatedProject: ActivatedProjectService,
    private destroyRef: DestroyRef,
    private readonly draftGenerationService: DraftGenerationService,
    projectNotificationService: ProjectNotificationService,
    private readonly transloco: TranslocoService
  ) {
    activatedProject.projectId$
      .pipe(quietTakeUntilDestroyed(destroyRef), filterNullish(), take(1))
      .subscribe(async projectId => {
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

  get historicalBuilds(): BuildDto[] {
    return this.latestBuild == null ? this.nonActiveBuilds : this.nonActiveBuilds.slice(1);
  }

  get isBuildActive(): boolean {
    return this.history.some(entry => activeBuildStates.includes(entry.state)) ?? false;
  }

  loadHistory(projectId: string): void {
    this.draftGenerationService
      .getBuildHistory(projectId)
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        this.history = result?.reverse() ?? [];
      });
  }
}
