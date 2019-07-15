import { HttpClient, HttpResponse } from '@angular/common/http';
import { Record } from '@orbit/data';
import { clone } from '@orbit/utils';
import { combineLatest, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, first, switchMap } from 'rxjs/operators';
import { registerCustomFilter } from './custom-filter-specifier';
import { GetAllParameters, JsonApiService, QueryObservable } from './json-api.service';
import { InputSystem } from './models/input-system';
import { Project } from './models/project';
import { NONE_ROLE, ProjectRole } from './models/project-role';
import { ResourceService } from './resource.service';
import { nameof } from './utils';

export abstract class ProjectService<T extends Project = Project> extends ResourceService {
  private static readonly SEARCH_FILTER = 'search';

  readonly roles: Map<string, ProjectRole>;

  constructor(type: string, jsonApiService: JsonApiService, roles: ProjectRole[], private readonly http: HttpClient) {
    super(type, jsonApiService);

    registerCustomFilter(this.type, ProjectService.SEARCH_FILTER, (r, v) => this.searchProjects(r, v));
    this.roles = new Map<string, ProjectRole>();
    for (const role of roles) {
      this.roles.set(role.role, role);
    }
    this.roles.set(NONE_ROLE.role, NONE_ROLE);
  }

  getAll(parameters?: GetAllParameters<T>, include?: string[][]): QueryObservable<T[]> {
    return this.jsonApiService.getAll(this.type, parameters, include);
  }

  get(id: string, include?: string[][]): QueryObservable<T> {
    return this.jsonApiService.get<T>(this.identity(id), include);
  }

  onlineUpdateAttributes(id: string, attrs: Partial<T>): Promise<T> {
    return this.jsonApiService.onlineUpdateAttributes(this.identity(id), attrs);
  }

  onlineCreate(project: T): Promise<T> {
    return this.jsonApiService.onlineCreate(project);
  }

  onlineSearch(term$: Observable<string>, parameters$: Observable<GetAllParameters<T>>): QueryObservable<T[]> {
    const debouncedTerm$ = term$.pipe(
      debounceTime(400),
      distinctUntilChanged()
    );

    return combineLatest(debouncedTerm$, parameters$).pipe(
      switchMap(([term, parameters]) => {
        let currentParameters = parameters;
        if (term != null && term !== '') {
          currentParameters = clone(parameters);
          if (currentParameters.filters == null) {
            currentParameters.filters = [];
          }
          currentParameters.filters.push({ name: ProjectService.SEARCH_FILTER, value: term });
        }
        return this.jsonApiService.onlineGetAll(this.type, currentParameters);
      })
    );
  }

  onlineInvite(id: string, email: string): Promise<void> {
    return this.jsonApiService.onlineInvoke(this.identity(id), 'invite', { email });
  }

  onlineCheckLinkSharing(id: string): Promise<void> {
    return this.jsonApiService.onlineInvoke(this.identity(id), 'checkLinkSharing');
  }

  onlineGet(id: string, include?: string[][]): QueryObservable<T> {
    return this.jsonApiService.onlineGet<T>(this.identity(id), include, true);
  }

  onlineDelete(id: string): Promise<void> {
    return this.jsonApiService.onlineDelete(this.identity(id));
  }

  async onlineExists(id: string): Promise<boolean> {
    const project = await this.onlineGet(id)
      .pipe(first())
      .toPromise();
    return project.data != null;
  }

  localDelete(id: string): Promise<void> {
    return this.jsonApiService.localDelete(this.identity(id));
  }

  async uploadAudio(id: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.http
      .post<HttpResponse<string>>(`json-api/projects/${id}/audio`, formData, {
        headers: { Accept: 'application/json' },
        observe: 'response'
      })
      .toPromise();
    return response.headers.get('Location');
  }

  protected isSearchMatch(record: Record, value: string): boolean {
    if (record.attributes == null) {
      return false;
    }

    const projectName = record.attributes[nameof<Project>('projectName')] as string;
    if (projectName != null && projectName.toLowerCase().includes(value)) {
      return true;
    }

    const inputSystem = record.attributes[nameof<Project>('inputSystem')] as InputSystem;
    if (inputSystem != null && inputSystem.languageName.toLowerCase().includes(value)) {
      return true;
    }

    return false;
  }

  private searchProjects(records: Record[], value: string): Record[] {
    const valueLower = value.toLowerCase();
    return records.filter(record => this.isSearchMatch(record, valueLower));
  }
}
