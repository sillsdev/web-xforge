import { Injectable } from '@angular/core';
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

  constructor(private readonly paratextService: ParatextService) {}

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
