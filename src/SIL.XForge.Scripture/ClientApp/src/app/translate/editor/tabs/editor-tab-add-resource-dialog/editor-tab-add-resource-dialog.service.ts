import { DestroyRef, Injectable } from '@angular/core';
import { distinctUntilChanged, skip } from 'rxjs';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { ParatextProject } from '../../../../core/models/paratext-project';
import { SelectableProject } from '../../../../core/models/selectable-project';
import { ParatextService } from '../../../../core/paratext.service';

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
    // Refresh the cached projects when the user's project subscription changes, ignoring the initial emission
    // and ensuring that getProjects() has already populated the cache. Ensure that any errors do not throw,
    // as the caller of getProjects() will appropriately handle any errors in its UI.
    this.userProjectsService.projectDocs$
      .pipe(filterNullish(), distinctUntilChanged(), skip(1), quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(async () => {
        if (this.projects == null) return;
        this.projects = await this.paratextService.getProjects().catch(() => (this.projects = undefined));
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
