import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { take } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
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
  history?: BuildDto[];

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly transloco: TranslocoService
  ) {
    this.activatedProject.projectId$.pipe(filterNullish(), take(1)).subscribe(projectId => {
      this.draftGenerationService.getBuildHistory(projectId).subscribe(result => {
        this.history = result?.reverse() ?? [];
      });
    });
  }

  get nonActiveBuilds(): BuildDto[] {
    return this.history?.filter(entry => !activeBuildStates.includes(entry.state)) || [];
  }

  get latestBuild(): BuildDto | undefined {
    return this.isBuildActive ? undefined : this.nonActiveBuilds[0];
  }

  get lastCompletedBuildMessage(): string {
    if (this.latestBuild == null) return '';
    const state = this.latestBuild.state.toString();
    switch (state) {
      case BuildStates.Canceled:
        return this.transloco.translate('draft_history_list.draft_canceled');
      case BuildStates.Completed:
        return this.transloco.translate('draft_history_list.draft_completed');
      case BuildStates.Faulted:
        return this.transloco.translate('draft_history_list.draft_faulted');
      case BuildStates.Active:
      case BuildStates.Finishing:
      case BuildStates.Pending:
      case BuildStates.Queued:
      default:
        return state.charAt(0).toUpperCase() + state.slice(1).toLowerCase();
    }
  }

  get historicalBuilds(): BuildDto[] {
    return this.latestBuild == null ? this.nonActiveBuilds : this.nonActiveBuilds.slice(1);
  }

  get isBuildActive(): boolean {
    return this.history?.some(entry => activeBuildStates.includes(entry.state)) ?? false;
  }
}
