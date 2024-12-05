import { Injectable } from '@angular/core';
import { Notification, NotificationScope } from 'realtime-server/lib/esm/common/models/notification';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { NotificationDoc } from 'xforge-common/models/notification-doc';
import { UserDoc } from 'xforge-common/models/user-doc';
import { RealtimeService } from 'xforge-common/realtime.service';
import { UserService } from 'xforge-common/user.service';
import { RealtimeQuery } from '../../xforge-common/models/realtime-query';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private activeNotifications = new BehaviorSubject<Readonly<Notification>[]>([]);
  private userDoc?: UserDoc;
  private currentQuery?: RealtimeQuery<NotificationDoc>;

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly userService: UserService
  ) {
    if (this.featureFlagService.showNotifications.enabled) {
      void this.initUserDoc();
    }
  }

  private async initUserDoc(): Promise<void> {
    this.userDoc = await this.realtimeService.subscribe<UserDoc>(UserDoc.COLLECTION, this.userService.currentUserId);
  }

  getActiveNotifications(): Observable<Notification[]> {
    return this.activeNotifications.asObservable();
  }

  async loadNotifications(pageIds?: string[]): Promise<void> {
    // Clean up previous subscription
    this.currentQuery?.dispose();

    const query: any = {
      $and: [
        { expirationDate: { $gt: new Date().toISOString() } },
        {
          $or: [
            { scope: NotificationScope.Global },
            ...(pageIds ? [{ scope: NotificationScope.Page, pageIds: { $in: pageIds } }] : [])
          ]
        }
      ]
    };

    this.currentQuery = await this.realtimeService.subscribeQuery(NotificationDoc.COLLECTION, query);
    // The data from docs is already readonly, so this assignment is type-safe
    this.activeNotifications.next(this.currentQuery.docs.map(doc => doc.data));
    void this.currentQuery.remoteChanges$.subscribe(() =>
      this.activeNotifications.next(this.currentQuery!.docs.map(doc => doc.data))
    );
  }

  getUnviewedCount(pageId?: string): Observable<number> {
    if (!this.featureFlagService.showNotifications.enabled) {
      return of(0);
    }
    return combineLatest([
      this.activeNotifications,
      this.userDoc
        ? this.userDoc.remoteChanges$
        : this.realtimeService
            .subscribe<UserDoc>(UserDoc.COLLECTION, this.userService.currentUserId)
            .then(doc => doc.remoteChanges$)
    ]).pipe(
      map(
        ([notifications, _]) =>
          notifications.filter(
            n =>
              (n.scope === 'Global' || (n.pageIds && n.pageIds.includes(pageId ?? ''))) &&
              !this.userDoc?.data?.viewedNotifications?.has(n.id)
          ).length
      )
    );
  }

  isNotificationViewed(notificationId: string): boolean {
    return this.userDoc?.data?.viewedNotifications?.has(notificationId) ?? false;
  }

  async markNotificationViewed(notificationId: string): Promise<void> {
    if (this.userDoc === undefined) {
      return;
    }
    this.userDoc.submitJson0Op(op => op.set(u => u.viewedNotifications[notificationId], true));
  }
}
