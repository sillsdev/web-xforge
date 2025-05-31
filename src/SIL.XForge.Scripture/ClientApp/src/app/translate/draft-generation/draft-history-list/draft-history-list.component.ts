import { Component, DestroyRef } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { asyncScheduler, switchMap, throttleTime } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { BuildDto } from '../../../machine-api/build-dto';
import { BuildStates } from '../../../machine-api/build-states';
import { activeBuildStates } from '../draft-generation';
import { DraftGenerationService } from '../draft-generation.service';
import { PROJECT_CHANGE_THROTTLE_TIME } from '../draft-utils';
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
    private readonly activatedProject: ActivatedProjectService,
    destroyRef: DestroyRef,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly transloco: TranslocoService
  ) {
    // Listen for changes to the project to call getBuildHistory() so that new drafts
    // that are started will cause the history to refresh.
    this.activatedProject.changes$
      .pipe(
        quietTakeUntilDestroyed(destroyRef),
        filterNullish(),
        throttleTime(PROJECT_CHANGE_THROTTLE_TIME, asyncScheduler, { leading: true, trailing: true }),
        switchMap(projectDoc => this.draftGenerationService.getBuildHistory(projectDoc.id))
      )
      .subscribe(result => {
        this.history = result?.reverse() ?? [];
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
}
