import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SFProjectProfileDoc } from '../app/core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../app/core/models/sf-project-user-config-doc';
import { SFProjectService } from '../app/core/sf-project.service';
import { compareProjectsForSorting } from '../app/shared/utils';
import { environment } from '../environments/environment';
import { AuthService, LoginResult } from './auth.service';
import { UserDoc } from './models/user-doc';
import { SubscriptionDisposable } from './subscription-disposable';
import { UserService } from './user.service';
import { OfflineStore } from './offline-store';
import { TextDoc, TextDocId } from '../app/core/models/text-doc';
import { RESOURCE_IDENTIFIER_LENGTH } from '../app/core/paratext.service';

/** Service that maintains an up-to-date set of SF project docs that the current user has access to. */
@Injectable({
  providedIn: 'root'
})
export class SFUserProjectsService extends SubscriptionDisposable {
  private projectDocs: Map<string, SFProjectProfileDoc> = new Map();
  private _projectDocs$ = new BehaviorSubject<SFProjectProfileDoc[] | undefined>(undefined);

  private userConfigDocs: Map<string, SFProjectUserConfigDoc> = new Map();
  private _userConfigDocs$ = new BehaviorSubject<SFProjectUserConfigDoc[] | undefined>(undefined);

  private offlineTextsLoaded: string[] = [];
  private _offlineTextsLoaded$ = new BehaviorSubject<string[]>([]);

  constructor(
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    private readonly authService: AuthService,
    private readonly offlineStore: OfflineStore
  ) {
    super();
    this.setup();
  }

  /** List of SF project docs the user is on. Or undefined if the information is not yet available. */
  get projectDocs$(): Observable<SFProjectProfileDoc[] | undefined> {
    return this._projectDocs$;
  }

  get userConfigDocs$(): Observable<SFProjectUserConfigDoc[] | undefined> {
    return this._userConfigDocs$;
  }

  get offlineTextsLoaded$(): Observable<string[]> {
    return this._offlineTextsLoaded$;
  }

  private async setup(): Promise<void> {
    this.subscribe(this.authService.loggedInState$, async (state: LoginResult) => {
      if (!state.loggedIn) {
        return;
      }
      const userDoc = await this.userService.getCurrentUser();
      this.updateProjectList(userDoc);
      this.subscribe(userDoc.remoteChanges$, () => this.updateProjectList(userDoc));
    });
  }

  /** Updates our provided set of SF project docs for the current user based on the userdoc's list of SF projects the
   * user is on. */
  async updateProjectList(userDoc: UserDoc | undefined): Promise<void> {
    if (userDoc == null) return;
    const currentProjectIds = userDoc.data!.sites[environment.siteId].projects;
    let removedProjectsCount = 0;
    for (const [id, projectDoc] of this.projectDocs) {
      if (!currentProjectIds.includes(id)) {
        removedProjectsCount++;
        projectDoc.dispose();
        this.projectDocs.delete(id);
      }
    }

    for (const [id, configDoc] of this.userConfigDocs) {
      if (!currentProjectIds.includes(id)) {
        configDoc.dispose();
        this.userConfigDocs.delete(id);
      }
    }

    this.offlineTextsLoaded = this.offlineTextsLoaded.filter(projectId => currentProjectIds.includes(projectId));

    const docFetchPromises: Promise<SFProjectProfileDoc>[] = [];
    const configFetchPromises: Promise<SFProjectUserConfigDoc>[] = [];
    for (const id of currentProjectIds) {
      if (!this.projectDocs.has(id)) {
        docFetchPromises.push(this.projectService.getProfile(id));
      }

      if (!this.userConfigDocs.has(id)) {
        configFetchPromises.push(this.projectService.getUserConfig(id, this.userService.currentUserId));
      }
    }

    if (removedProjectsCount === 0 && docFetchPromises.length === 0 && configFetchPromises.length === 0) {
      if (currentProjectIds.length === 0) {
        // Provide an initial empty set of projects if the user has no projects.
        this._projectDocs$.next([]);
        this._userConfigDocs$.next([]);
      }
      /* We want to check for changes to offline text docs if no changes to
       projects or user project configs have occurred. */
      const currentProjects = Array.from(this.projectDocs.values());
      const currentConfigs = Array.from(this.userConfigDocs.values());
      if (currentProjects.length > 0 && currentConfigs.length > 0) {
        await this.updateOfflineTextDocs(currentProjects, currentConfigs);
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

    for (const newProjectConfig of await Promise.all(configFetchPromises)) {
      this.userConfigDocs.set(newProjectConfig.data!.projectRef, newProjectConfig);
    }
    const projectConfigs = Array.from(this.userConfigDocs.values());
    this._userConfigDocs$.next(projectConfigs);

    await this.updateOfflineTextDocs(projects, projectConfigs);
  }

  async updateOfflineTextDocs(
    sfProjects: SFProjectProfileDoc[],
    projectConfigs: SFProjectUserConfigDoc[]
  ): Promise<void> {
    for (const sfProject of sfProjects.filter(project => project.id.length > RESOURCE_IDENTIFIER_LENGTH)) {
      const userConfig = projectConfigs.find(config => config.data?.projectRef === sfProject.id);
      if (userConfig == null) continue;
      const textDocId = new TextDocId(
        sfProject.id,
        userConfig.data?.selectedBookNum ?? 1,
        userConfig.data?.selectedChapterNum ?? 1
      );
      const textDoc = await this.offlineStore.get<TextDoc>(TextDoc.COLLECTION, textDocId.toString());
      if (textDoc != null && !this.offlineTextsLoaded.includes(sfProject.id)) {
        this.offlineTextsLoaded.push(sfProject.id);
      }
    }

    const offlineTexts = Array.from(this.offlineTextsLoaded);
    this._offlineTextsLoaded$.next(offlineTexts);
  }
}
