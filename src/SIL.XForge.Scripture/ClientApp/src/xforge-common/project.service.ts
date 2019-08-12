import { HttpClient, HttpResponse } from '@angular/common/http';
import { Project } from 'realtime-server/lib/common/models/project';
import { combineLatest, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { CommandService } from './command.service';
import { ProjectDoc } from './models/project-doc';
import { NONE_ROLE, ProjectRoleInfo } from './models/project-role-info';
import { QueryParameters, QueryResults, RealtimeService } from './realtime.service';

export abstract class ProjectService<
  TProj extends Project = Project,
  TDoc extends ProjectDoc<TProj> = ProjectDoc<TProj>
> {
  readonly roles: Map<string, ProjectRoleInfo>;

  constructor(
    protected readonly realtimeService: RealtimeService,
    protected readonly commandService: CommandService,
    roles: ProjectRoleInfo[],
    private readonly http: HttpClient
  ) {
    this.roles = new Map<string, ProjectRoleInfo>();
    for (const role of roles) {
      this.roles.set(role.role, role);
    }
    this.roles.set(NONE_ROLE.role, NONE_ROLE);
  }

  get(id: string): Promise<TDoc> {
    return this.realtimeService.get(ProjectDoc.TYPE, id);
  }

  onlineCreate(project: TProj): Promise<string> {
    return this.commandService.onlineInvoke(ProjectDoc.TYPE, 'create', { project });
  }

  onlineSearch(
    term$: Observable<string>,
    queryParameters$: Observable<QueryParameters>
  ): Observable<QueryResults<TDoc>> {
    const debouncedTerm$ = term$.pipe(
      debounceTime(400),
      distinctUntilChanged()
    );

    return combineLatest(debouncedTerm$, queryParameters$).pipe(
      switchMap(([term, parameters]) => {
        const query = {
          $or: [
            { projectName: { $regex: `.*${term}.*`, $options: 'i' } },
            { 'inputSystem.languageName': { $regex: `.*${term}.*`, $options: 'i' } }
          ]
        };
        return this.realtimeService.onlineQuery(ProjectDoc.TYPE, query, parameters);
      })
    );
  }

  async onlineGetMany(projectIds: string[]): Promise<TDoc[]> {
    const results = await this.realtimeService.onlineQuery(ProjectDoc.TYPE, { _id: { $in: projectIds } });
    return results.docs as TDoc[];
  }

  onlineAddCurrentUser(id: string, projectRole?: string): Promise<void> {
    return this.commandService.onlineInvoke(ProjectDoc.TYPE, 'addUser', { projectId: id, projectRole });
  }

  onlineIsAlreadyInvited(id: string, email: string): Promise<boolean> {
    return this.commandService.onlineInvoke(ProjectDoc.TYPE, 'isAlreadyInvited', { projectId: id, email });
  }

  /** Get list of email addresses that have outstanding invitations on project.
   * Caller must be an admin on the project. */
  onlineInvitedUsers(projectId: string): Promise<string[]> {
    return this.commandService.onlineInvoke(ProjectDoc.TYPE, 'InvitedUsers', { projectId });
  }
  /** Get added into project, with optionally specified shareKey code. */
  onlineCheckLinkSharing(id: string, shareKey?: string): Promise<void> {
    return this.commandService.onlineInvoke(ProjectDoc.TYPE, 'checkLinkSharing', { projectId: id, shareKey });
  }

  onlineRemoveUser(id: string, userId: string): Promise<void> {
    return this.commandService.onlineInvoke(ProjectDoc.TYPE, 'removeUser', { projectId: id, projectUserId: userId });
  }

  onlineUpdateCurrentUserRole(id: string, projectRole: string): Promise<void> {
    return this.commandService.onlineInvoke(ProjectDoc.TYPE, 'updateRole', { projectId: id, projectRole });
  }

  onlineInvite(id: string, email: string): Promise<string> {
    return this.commandService.onlineInvoke(ProjectDoc.TYPE, 'invite', { projectId: id, email });
  }

  onlineUninviteUser(projectId: string, emailToUninvite: string): Promise<string> {
    return this.commandService.onlineInvoke(ProjectDoc.TYPE, 'uninviteUser', { projectId, emailToUninvite });
  }

  onlineDelete(id: string): Promise<void> {
    return this.commandService.onlineInvoke(ProjectDoc.TYPE, 'delete', { projectId: id });
  }

  async onlineUploadAudio(id: string, dataId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('projectId', id);
    formData.append('dataId', dataId);
    formData.append('file', file);
    const response = await this.http
      .post<HttpResponse<string>>(`command-api/projects/audio`, formData, {
        headers: { Accept: 'application/json' },
        observe: 'response'
      })
      .toPromise();
    const path = response.headers.get('Location');
    return path.replace(environment.assets.audio, '/');
  }

  onlineDeleteAudio(id: string, dataId: string, ownerId: string): Promise<void> {
    return this.commandService.onlineInvoke(ProjectDoc.TYPE, 'deleteAudio', { projectId: id, ownerId, dataId });
  }
}
