import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { SFProjectService } from '../app/core/sf-project.service';
import { compareProjectsForSorting } from '../app/shared/utils';
import { SFProjectProfileDoc } from '../app/core/models/sf-project-profile-doc';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';
import { UserDoc } from './models/user-doc';
import { SubscriptionDisposable } from './subscription-disposable';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root'
})
export class SFUserProjectsService extends SubscriptionDisposable {
  private projectDocs: Map<string, SFProjectProfileDoc> = new Map();
  private _projectDocs$ = new Subject<SFProjectProfileDoc[]>();

  constructor(
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    private readonly authService: AuthService
  ) {
    super();
    this.setup();
  }

  get projectDocs$(): Observable<SFProjectProfileDoc[]> {
    return this._projectDocs$;
  }

  private async setup(): Promise<void> {
    if (await this.authService.isLoggedIn) {
      const userDoc = await this.userService.getCurrentUser();
      this.updateProjectList(userDoc);
      this.subscribe(userDoc.remoteChanges$, () => this.updateProjectList(userDoc));
    }
  }

  private async updateProjectList(userDoc: UserDoc): Promise<void> {
    const currentProjectIds = userDoc.data!.sites[environment.siteId].projects;

    let removedProjectsCount = 0;
    for (const [id, projectDoc] of this.projectDocs) {
      if (!currentProjectIds.includes(id)) {
        removedProjectsCount++;
        projectDoc.dispose();
        this.projectDocs.delete(id);
      }
    }

    const docFetchPromises: Promise<SFProjectProfileDoc>[] = [];
    for (const id of currentProjectIds) {
      if (!this.projectDocs.has(id)) {
        docFetchPromises.push(this.projectService.getProfile(id));
      }
    }

    if (removedProjectsCount === 0 && docFetchPromises.length === 0) return;

    for (const newProjectDoc of await Promise.all(docFetchPromises)) {
      this.projectDocs.set(newProjectDoc.id, newProjectDoc);
    }
    const projects = Array.from(this.projectDocs.values()).sort((a, b) =>
      a.data == null || b.data == null ? 0 : compareProjectsForSorting(a.data, b.data)
    );
    this._projectDocs$.next(projects);
  }
}
