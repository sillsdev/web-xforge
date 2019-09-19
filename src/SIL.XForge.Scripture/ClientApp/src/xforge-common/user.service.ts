import { Injectable } from '@angular/core';
import merge from 'lodash/merge';
import { User } from 'realtime-server/lib/common/models/user';
import { combineLatest, from, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import XRegExp from 'xregexp';
import { AuthService } from './auth.service';
import { CommandService } from './command.service';
import { LocalSettingsService } from './local-settings.service';
import { RealtimeQuery } from './models/realtime-query';
import { UserDoc } from './models/user-doc';
import { UserProfileDoc } from './models/user-profile-doc';
import { Filters, QueryParameters } from './query-parameters';
import { RealtimeService } from './realtime.service';
import { USERS_URL } from './url-constants';
import { getObjPathStr, objProxy } from './utils';

const CURRENT_PROJECT_ID_SETTING = 'current_project_id';

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
    private readonly commandService: CommandService,
    private readonly localSettings: LocalSettingsService
  ) {}

  get currentUserId(): string {
    return this.authService.currentUserId;
  }

  get currentProjectId(): string {
    return this.localSettings.get(CURRENT_PROJECT_ID_SETTING);
  }

  setCurrentProjectId(value?: string): void {
    this.localSettings.set(CURRENT_PROJECT_ID_SETTING, value);
  }

  /** Get currently-logged in user. */
  getCurrentUser(): Promise<UserDoc> {
    return this.get(this.currentUserId);
  }

  get(id: string): Promise<UserDoc> {
    return this.realtimeService.subscribe(UserDoc.COLLECTION, id);
  }

  getProfile(id: string): Promise<UserProfileDoc> {
    return this.realtimeService.subscribe(UserProfileDoc.COLLECTION, id);
  }

  async onlineDelete(id: string): Promise<void> {
    await this.onlineInvoke('delete', { userId: id });
  }

  onlineSearch(
    term$: Observable<string>,
    queryParameters$: Observable<QueryParameters>,
    reload$: Observable<void>
  ): Observable<RealtimeQuery<UserDoc>> {
    const debouncedTerm$ = term$.pipe(
      debounceTime(400),
      distinctUntilChanged()
    );

    const u = objProxy<User>();
    return combineLatest(debouncedTerm$, queryParameters$, reload$).pipe(
      switchMap(([term, queryParameters]) => {
        term = XRegExp.escape(term);
        const filters: Filters = {
          $or: [
            { [getObjPathStr(u.name)]: { $regex: `.*${term}.*`, $options: 'i' } },
            { [getObjPathStr(u.email)]: { $regex: `.*${term}.*`, $options: 'i' } },
            { [getObjPathStr(u.displayName)]: { $regex: `.*${term}.*`, $options: 'i' } }
          ]
        };
        return from(this.realtimeService.onlineQuery<UserDoc>(UserDoc.COLLECTION, merge(filters, queryParameters)));
      })
    );
  }

  private onlineInvoke<T>(method: string, params?: any): Promise<T> {
    return this.commandService.onlineInvoke<T>(USERS_URL, method, params);
  }
}
