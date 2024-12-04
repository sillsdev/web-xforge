import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { FeatureFlagService } from 'xforge-common/feature-flag.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { RealtimeService } from 'xforge-common/realtime.service';

export interface Notification {
  id: string;
  title: string;
  content: string;
  type: NotificationType;
  scope: NotificationScope;
  pageIds?: string[];
  expirationDate: string;
  creationDate: string;
}

export enum NotificationType {
  Obtrusive = 'Obtrusive',
  Unobtrusive = 'Unobtrusive'
}

export enum NotificationScope {
  Global = 'Global',
  Page = 'Page'
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private activeNotifications = new BehaviorSubject<Notification[]>([]);
  private userDoc?: UserDoc;

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly featureFlagService: FeatureFlagService
  ) {
    if (this.featureFlagService.showNotifications.enabled) {
      void this.initUserDoc();
    }
  }

  private async initUserDoc(): Promise<void> {
    this.userDoc = await this.realtimeService.subscribe<UserDoc>('user', this.realtimeService.currentUserId);
  }

  getActiveNotifications(): Observable<Notification[]> {
    return this.activeNotifications.asObservable();
  }

  async loadNotifications(pageIds?: string[]): Promise<void> {
    const query: any = {
      $and: [
        { expirationDate: { $gt: new Date().toISOString() } },
        {
          $or: [{ scope: 'Global' }, ...(pageIds ? [{ scope: 'Page', pageIds: { $in: pageIds } }] : [])]
        }
      ]
    };
    const notifications = await this.realtimeService.subscribeQuery('notifications', query);
    this.activeNotifications.next(notifications);
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
            .subscribe<UserDoc>('user', this.realtimeService.currentUserId)
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
