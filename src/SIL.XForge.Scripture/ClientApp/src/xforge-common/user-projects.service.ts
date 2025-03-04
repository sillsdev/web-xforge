import { Injectable } from '@angular/core';
import { QuietDestroyRef } from 'xforge-common/utils';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { BehaviorSubject, Observable } from 'rxjs';
import { SFProjectProfileDoc } from '../app/core/models/sf-project-profile-doc';
import { SFProjectService } from '../app/core/sf-project.service';
import { compareProjectsForSorting } from '../app/shared/utils';
import { environment } from '../environments/environment';
import { AuthService, LoginResult } from './auth.service';
import { UserDoc } from './models/user-doc';
import { UserService } from './user.service';

/** Service that maintains an up-to-date set of SF project docs that the current user has access to. */
@Injectable({
  providedIn: 'root'
})
export class SFUserProjectsService {
  private projectDocs: Map<string, SFProjectProfileDoc> = new Map();
  private _projectDocs$ = new BehaviorSubject<SFProjectProfileDoc[] | undefined>(undefined);

  constructor(
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    private readonly authService: AuthService,
    private destroyRef: QuietDestroyRef
  ) {
    this.setup();
  }

  /** List of SF project docs the user is on. Or undefined if the information is not yet available. */
  get projectDocs$(): Observable<SFProjectProfileDoc[] | undefined> {
    return this._projectDocs$;
  }

  private async setup(): Promise<void> {
    this.authService.loggedInState$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async (state: LoginResult) => {
      if (!state.loggedIn) {
        return;
      }
      const userDoc = await this.userService.getCurrentUser();
      this.updateProjectList(userDoc);
      userDoc.remoteChanges$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.updateProjectList(userDoc));
    });
  }

  /** Updates our provided set of SF project docs for the current user based on the userdoc's list of SF projects the
   * user is on. */
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

    if (removedProjectsCount === 0 && docFetchPromises.length === 0) {
      if (currentProjectIds.length === 0) {
        // Provide an initial empty set of projects if the user has no projects.
        this._projectDocs$.next([]);
      }
      return;
    }

    for (const newProjectDoc of await Promise.all(docFetchPromises)) {
      this.projectDocs.set(newProjectDoc.id, newProjectDoc);
    }
    const projects = Array.from(this.projectDocs.values()).sort((a, b) =>
      a.data == null || b.data == null ? 0 : compareProjectsForSorting(a.data, b.data)
    );
    this._projectDocs$.next(projects);
  }
}
