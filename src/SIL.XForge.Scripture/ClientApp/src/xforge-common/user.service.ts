import { Injectable } from '@angular/core';
import { combineLatest, from, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { JsonRpcService } from './json-rpc.service';
import { UserDoc } from './models/user-doc';
import { UserProfileDoc } from './models/user-profile-doc';
import { QueryParameters, QueryResults, RealtimeService } from './realtime.service';

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
    private readonly jsonRpcService: JsonRpcService
  ) {}

  get currentUserId(): string {
    return this.authService.currentUserId;
  }

  /** Get currently-logged in user. */
  getCurrentUser(): Promise<UserDoc> {
    return this.get(this.currentUserId);
  }

  get(id: string): Promise<UserDoc> {
    return this.realtimeService.get(UserDoc.TYPE, id);
  }

  getProfile(id: string): Promise<UserProfileDoc> {
    return this.realtimeService.get(UserProfileDoc.TYPE, id);
  }

  async onlineDelete(id: string): Promise<void> {
    await this.jsonRpcService.onlineInvoke(UserDoc.TYPE, id, 'delete');
  }

  onlineSearch(
    term$: Observable<string>,
    queryParameters$: Observable<QueryParameters>,
    reload$: Observable<void>
  ): Observable<QueryResults<UserDoc>> {
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
}
