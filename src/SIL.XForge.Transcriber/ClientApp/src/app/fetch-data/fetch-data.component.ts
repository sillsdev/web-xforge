import { Component, OnInit } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { GetAllParameters } from 'xforge-common/json-api.service';
import { TranscriberProject } from '../core/models/transcriber-project';
import { TranscriberProjectService } from '../core/transcriber-project.service';

@Component({
  selector: 'app-fetch-data',
  templateUrl: './fetch-data.component.html'
})
export class FetchDataComponent implements OnInit {
  private readonly updatedProjects: Set<TranscriberProject> = new Set<TranscriberProject>();

  projects$: Observable<TranscriberProject[]>;

  private readonly searchTerm$ = new BehaviorSubject<string>('');

  constructor(private readonly projectService: TranscriberProjectService) {}

  get isDirty(): boolean {
    return this.updatedProjects.size > 0;
  }

  ngOnInit(): void {
    const parameters$ = of({ sort: [{ name: 'projectName', order: 'ascending' }] } as GetAllParameters<
      TranscriberProject
    >);
    this.projects$ = this.projectService.onlineSearch(this.searchTerm$, parameters$).pipe(map(r => r.results));
  }

  updateProjectName(project: TranscriberProject, value: string): void {
    if (project.projectName === value) {
      return;
    }
    project.projectName = value;
    this.updatedProjects.add(project);
  }

  updateSearchTerm(term: string): void {
    this.searchTerm$.next(term);
  }

  async update(): Promise<void> {
    for (const project of this.updatedProjects) {
      await this.projectService.onlineUpdateAttributes(project.id, { projectName: project.projectName });
    }
    this.updatedProjects.clear();
  }
}
