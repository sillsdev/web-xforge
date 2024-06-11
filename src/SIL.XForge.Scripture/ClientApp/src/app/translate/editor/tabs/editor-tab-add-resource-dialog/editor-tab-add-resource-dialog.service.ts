import { Injectable } from '@angular/core';
import { ParatextProject } from '../../../../core/models/paratext-project';
import { ParatextService, SelectableProject } from '../../../../core/paratext.service';

@Injectable({
  providedIn: 'root'
})
export class EditorTabAddResourceDialogService {
  // Cache values until page refresh
  projects?: ParatextProject[];
  resources?: SelectableProject[];

  constructor(private readonly paratextService: ParatextService) {}

  getProjects(): Promise<ParatextProject[] | undefined> {
    return this.projects != null
      ? Promise.resolve(this.projects)
      : this.paratextService.getProjects().then(projects => (this.projects = projects));
  }

  getResources(): Promise<SelectableProject[] | undefined> {
    return this.resources != null
      ? Promise.resolve(this.resources)
      : this.paratextService.getResources().then(resources => (this.resources = resources));
  }
}
