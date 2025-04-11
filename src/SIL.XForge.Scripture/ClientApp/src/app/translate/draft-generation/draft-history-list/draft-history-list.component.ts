import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { take } from 'rxjs';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { filterNullish } from '../../../../xforge-common/util/rxjs-util';
import { activeBuildStates } from '../draft-generation';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftHistoryEntry, DraftHistoryEntryComponent } from './draft-history-entry/draft-history-entry.component';

@Component({
  selector: 'app-draft-history-list',
  standalone: true,
  imports: [MatIconModule, DraftHistoryEntryComponent],
  templateUrl: './draft-history-list.component.html',
  styleUrl: './draft-history-list.component.scss'
})
export class DraftHistoryListComponent {
  history?: DraftHistoryEntry[];

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService
  ) {
    this.activatedProject.projectId$.pipe(filterNullish(), take(1)).subscribe(projectId => {
      this.draftGenerationService.getBuildHistory(projectId).subscribe(result => {
        this.history = result.reverse();
      });
    });
  }

  get nonActiveBuilds(): DraftHistoryEntry[] {
    return this.history?.filter(entry => !activeBuildStates.includes(entry.state)) || [];
  }

  get latestBuild(): DraftHistoryEntry | undefined {
    return this.isBuildActive ? undefined : this.nonActiveBuilds[0];
  }

  get lastCompletedBuildMessage(): string {
    if (this.latestBuild == null) return '';
    const entry = this.latestBuild;
    return (
      {
        COMPLETED: 'Your draft is ready',
        CANCELED: 'Your draft was cancelled',
        FAULTED: 'The draft failed'
      }[entry.state] || entry.state
    );
  }

  get historicalBuilds(): DraftHistoryEntry[] {
    return this.latestBuild == null ? this.nonActiveBuilds : this.nonActiveBuilds.slice(1);
  }

  get isBuildActive(): boolean {
    return this.history?.some(entry => activeBuildStates.includes(entry.state)) ?? false;
  }
}
