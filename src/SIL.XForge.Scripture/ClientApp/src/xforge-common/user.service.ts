import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { combineLatest, from, Observable, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { JsonApiService, QueryObservable } from './json-api.service';
import { JsonRpcService } from './json-rpc.service';
import { ProjectUser } from './models/project-user';
import { UserDoc } from './models/user-doc';
import { UserProfileDoc } from './models/user-profile-doc';
import { QueryParameters, RealtimeQueryResults, RealtimeService } from './realtime.service';
import { nameof } from './utils';

/**
 * Provides operations on user objects.
 */
@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly authService: AuthService,
    private readonly http: HttpClient,
    private readonly jsonApiService: JsonApiService,
    private readonly jsonRpcService: JsonRpcService
  ) {}

  get currentUserId(): string {
    return this.authService.currentUserId;
  }

  hasCurrentUserProjectRole(projectId: string, role: string): Observable<boolean> {
    if (!projectId) {
      return of(false);
    }

    return this.getProjects(this.currentUserId).pipe(
      map(projectUserResults => {
        for (const projectUser of projectUserResults.data) {
          if (projectUser && projectUser.project.id === projectId) {
            return projectUser.role === role;
          }
        }

        return false;
      })
    );
  }

  /** Get currently-logged in user. */
  getCurrentUser(): Promise<UserDoc> {
    return this.get(this.currentUserId);
  }

  get(id: string): Promise<UserDoc> {
    return this.realtimeService.get({ type: UserDoc.TYPE, id });
  }

  getProfile(id: string): Promise<UserProfileDoc> {
    return this.realtimeService.get({ type: UserProfileDoc.TYPE, id });
  }

  onlineGetProjects(id: string, include?: string[][]): QueryObservable<ProjectUser[]> {
    return this.jsonApiService.onlineGetAll(
      ProjectUser.TYPE,
      {
        filters: [{ op: 'equal', name: nameof<ProjectUser>('userRef'), value: id }]
      },
      include
    );
  }

  getProjects(id: string, include?: string[][]): QueryObservable<ProjectUser[]> {
    return this.jsonApiService.getAll(
      ProjectUser.TYPE,
      {
        filters: [{ op: 'equal', name: nameof<ProjectUser>('userRef'), value: id }]
      },
      include
    );
  }

  async onlineDelete(id: string): Promise<void> {
    const userCommandsUrl = `json-api/users/${id}/commands`;
    await this.jsonRpcService.invoke(userCommandsUrl, 'delete');
  }

  onlineSearch(
    term$: Observable<string>,
    queryParameters$: Observable<QueryParameters>,
    reload$: Observable<void>
  ): Observable<RealtimeQueryResults<UserDoc>> {
    const debouncedTerm$ = term$.pipe(
      debounceTime(400),
      distinctUntilChanged()
    );

    return combineLatest(debouncedTerm$, queryParameters$, reload$).pipe(
      switchMap(([term, queryParameters]) => {
        const query: any = {
          name: { $regex: `.*${term}.*`, $options: 'i' }
        };
        return from(this.realtimeService.onlineQuery<UserDoc>(UserDoc.TYPE, query, queryParameters));
      })
    );
  }

  /**
   * Uploads the specified image file as the current user's avatar.
   *
   * @param {File} file The file to upload.
   * @returns {Promise<string>} The relative url to the uploaded avatar file.
   */
  async uploadCurrentUserAvatar(file: File): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    await this.http
      .post<HttpResponse<string>>(`json-api/users/${this.currentUserId}/avatar`, formData, {
        headers: { Accept: 'application/json' }
      })
      .toPromise();
  }
}
