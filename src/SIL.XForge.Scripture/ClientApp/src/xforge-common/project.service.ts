import { HttpClient, HttpResponse } from '@angular/common/http';
import { RecordIdentity } from '@orbit/data';
import { combineLatest, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { JsonRpcService } from './json-rpc.service';
import { Project } from './models/project';
import { ProjectDoc } from './models/project-doc';
import { NONE_ROLE, ProjectRole } from './models/project-role';
import { QueryParameters, QueryResults, RealtimeService } from './realtime.service';

export abstract class ProjectService<
  TProj extends Project = Project,
  TDoc extends ProjectDoc<TProj> = ProjectDoc<TProj>
> {
  readonly roles: Map<string, ProjectRole>;

  constructor(
    protected readonly realtimeService: RealtimeService,
    protected readonly jsonRpcService: JsonRpcService,
    roles: ProjectRole[],
    private readonly http: HttpClient
  ) {
    this.roles = new Map<string, ProjectRole>();
    for (const role of roles) {
      this.roles.set(role.role, role);
    }
    this.roles.set(NONE_ROLE.role, NONE_ROLE);
  }

  get(id: string): Promise<TDoc> {
    return this.realtimeService.get(this.identity(id));
  }

  onlineCreate(project: TProj): Promise<string> {
    return this.jsonRpcService.onlineInvoke(ProjectDoc.TYPE, 'create', { project });
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
        const query: any = {
          projectName: { $regex: `.*${term}.*`, $options: 'i' },
          'inputSystem.languageName': { $regex: `.*${term}.*`, $options: 'i' }
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
    return this.jsonRpcService.onlineInvoke(this.identity(id), 'addUser', { projectRole });
  }

  onlineIsAlreadyInvited(id: string, email: string): Promise<boolean> {
    return this.jsonRpcService.onlineInvoke(this.identity(id), 'isAlreadyInvited', { email });
  }

  /** Get added into project, with optionally specified shareKey code. */
  onlineCheckLinkSharing(id: string, shareKey?: string): Promise<void> {
    return this.jsonRpcService.onlineInvoke(this.identity(id), 'checkLinkSharing', { shareKey });
  }

  onlineRemoveUser(id: string, userId: string): Promise<void> {
    return this.jsonRpcService.onlineInvoke(this.identity(id), 'removeUser', { projectUserId: userId });
  }

  onlineUpdateCurrentUserRole(id: string, projectRole: string): Promise<void> {
    return this.jsonRpcService.onlineInvoke(this.identity(id), 'updateRole', { projectRole });
  }

  onlineInvite(id: string, email: string): Promise<string> {
    return this.jsonRpcService.onlineInvoke(this.identity(id), 'invite', { email });
  }

  onlineDelete(id: string): Promise<void> {
    return this.jsonRpcService.onlineInvoke(this.identity(id), 'delete');
  }

  async uploadAudio(id: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.http
      .post<HttpResponse<string>>(`command-api/projects/${id}/audio`, formData, {
        headers: { Accept: 'application/json' },
        observe: 'response'
      })
      .toPromise();
    return response.headers.get('Location');
  }

  protected identity(id: string): RecordIdentity {
    return { type: ProjectDoc.TYPE, id };
  }
}
