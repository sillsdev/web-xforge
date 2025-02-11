import { DestroyRef, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { ParatextProject } from '../../../../core/models/paratext-project';
import { ParatextService, SelectableProject } from '../../../../core/paratext.service';

@Injectable({
  providedIn: 'root'
})
export class EditorTabAddResourceDialogService {
  // Cache values until page refresh
  private projects?: ParatextProject[];
  private resources?: SelectableProject[];

  constructor(
    private readonly paratextService: ParatextService,
    private readonly userProjectsService: SFUserProjectsService,
    private readonly destroyRef: DestroyRef
  ) {
    this.userProjectsService.projectDocs$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async projects => {
      if (projects == null) return;
      this.projects = await this.paratextService.getProjects();
    });
  }

  async getProjects(): Promise<ParatextProject[] | undefined> {
    return this.projects != null
      ? await Promise.resolve(this.projects)
      : await this.paratextService.getProjects().then(projects => (this.projects = projects));
  }

  async getResources(): Promise<SelectableProject[] | undefined> {
    return this.resources != null
      ? await Promise.resolve(this.resources)
      : await this.paratextService.getResources().then(resources => (this.resources = resources));
  }
}
