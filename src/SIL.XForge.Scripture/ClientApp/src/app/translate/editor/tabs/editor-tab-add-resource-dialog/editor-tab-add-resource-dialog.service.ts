import { DestroyRef, Injectable } from '@angular/core';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { quietTakeUntilDestroyed } from 'xforge-common/utils';
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
    this.userProjectsService.projectDocs$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(async projects => {
      if (projects == null) return;
      this.projects = await this.paratextService.getProjects();
    });
  }

  async getProjects(): Promise<ParatextProject[] | undefined> {
    if (!this.projects) {
      this.projects = await this.paratextService.getProjects();
    }
    return this.projects;
  }

  async getResources(): Promise<SelectableProject[] | undefined> {
    if (!this.resources) {
      this.resources = await this.paratextService.getResources();
    }
    return this.resources;
  }
}
