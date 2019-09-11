import { HttpClient, HttpResponse } from '@angular/common/http';
import merge from 'lodash/merge';
import { Project } from 'realtime-server/lib/common/models/project';
import { combineLatest, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { CommandService } from './command.service';
import { ProjectDoc } from './models/project-doc';
import { NONE_ROLE, ProjectRoleInfo } from './models/project-role-info';
import { RealtimeQuery } from './models/realtime-query';
import { Filters, QueryParameters } from './query-parameters';
import { RealtimeService } from './realtime.service';
import { COMMAND_API_NAMESPACE, PROJECTS_URL } from './url-constants';
import { getObjPathStr, objProxy } from './utils';

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

  protected abstract get collection(): string;

  get(id: string): Promise<TDoc> {
    return this.realtimeService.subscribe(this.collection, id);
  }

  onlineSearch(
    term$: Observable<string>,
    queryParameters$: Observable<QueryParameters>
  ): Observable<RealtimeQuery<TDoc>> {
    const debouncedTerm$ = term$.pipe(
      debounceTime(400),
      distinctUntilChanged()
    );

    const p = objProxy<Project>();
    return combineLatest(debouncedTerm$, queryParameters$).pipe(
      switchMap(([term, queryParameters]) => {
        const filters: Filters = {
          $or: [
            { [getObjPathStr(p.name)]: { $regex: `.*${term}.*`, $options: 'i' } },
            { [getObjPathStr(p.inputSystem.languageName)]: { $regex: `.*${term}.*`, $options: 'i' } }
          ]
        };
        return this.realtimeService.onlineQuery<TDoc>(this.collection, merge(filters, queryParameters));
      })
    );
  }

  async onlineGetMany(projectIds: string[]): Promise<TDoc[]> {
    const results = await this.realtimeService.onlineQuery<TDoc>(this.collection, { _id: { $in: projectIds } });
    return results.docs as TDoc[];
  }

  onlineAddCurrentUser(id: string, projectRole?: string): Promise<void> {
    return this.onlineInvoke('addUser', { projectId: id, projectRole });
  }

  onlineRemoveUser(id: string, userId: string): Promise<void> {
    return this.onlineInvoke('removeUser', { projectId: id, projectUserId: userId });
  }

  onlineUpdateCurrentUserRole(id: string, projectRole: string): Promise<void> {
    return this.onlineInvoke('updateRole', { projectId: id, projectRole });
  }

  onlineDelete(id: string): Promise<void> {
    return this.onlineInvoke('delete', { projectId: id });
  }

  async onlineUploadAudio(id: string, dataId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('projectId', id);
    formData.append('dataId', dataId);
    formData.append('file', file);
    const response = await this.http
      .post<HttpResponse<string>>(`${COMMAND_API_NAMESPACE}/${PROJECTS_URL}/audio`, formData, {
        headers: { Accept: 'application/json' },
        observe: 'response'
      })
      .toPromise();
    const path = response.headers.get('Location');
    return path.replace(environment.assets.audio, '/');
  }

  onlineDeleteAudio(id: string, dataId: string, ownerId: string): Promise<void> {
    return this.onlineInvoke('deleteAudio', { projectId: id, ownerId, dataId });
  }

  protected onlineInvoke<T>(method: string, params?: any): Promise<T> {
    return this.commandService.onlineInvoke<T>(PROJECTS_URL, method, params);
  }
}
