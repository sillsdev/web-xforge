import { Injectable } from '@angular/core';
import { Notification, NotificationScope } from 'realtime-server/lib/esm/common/models/notification';
import { BehaviorSubject, combineLatest, map, Observable, of } from 'rxjs';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { NotificationDoc } from 'xforge-common/models/notification-doc';
import { UserDoc } from 'xforge-common/models/user-doc';
import { RealtimeService } from 'xforge-common/realtime.service';
import { UserService } from 'xforge-common/user.service';
import { AuthService } from '../../xforge-common/auth.service';
import { CommandService } from '../../xforge-common/command.service';
import { DialogService } from '../../xforge-common/dialog.service';
import { LocalSettingsService } from '../../xforge-common/local-settings.service';
import { RealtimeQuery } from '../../xforge-common/models/realtime-query';
import { NoticeService } from '../../xforge-common/notice.service';
import { objectId } from '../../xforge-common/utils';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private activeNotifications = new BehaviorSubject<Readonly<Notification>[]>([]);
  activeNotificationDocsObservable$: Observable<readonly NotificationDoc[]>;
  private activeNotificationDocs = new BehaviorSubject<readonly NotificationDoc[]>([]);

  private userDoc?: UserDoc;
  private currentQuery?: RealtimeQuery<NotificationDoc>;

  async getUnexpiredNotifications(): Promise<Observable<Notification[]>> {
    if (this.currentQuery === undefined) {
      await this.loadNotifications();
    }
    return this.activeNotifications.asObservable();
  }

  async getUnexpiredNotificationDocs(): Promise<Observable<readonly NotificationDoc[]>> {
    if (this.currentQuery === undefined) {
      await this.loadNotifications();
    }
    return this.activeNotificationDocs.asObservable();
  }

  async getCurrentUserDoc(): Promise<UserDoc> {
    if (this.userDoc === undefined) {
      this.userDoc = await this.realtimeService.subscribe<UserDoc>(UserDoc.COLLECTION, this.userService.currentUserId);
    }
    return this.userDoc;
  }

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly authService: AuthService,
    private readonly commandService: CommandService,
    private readonly localSettings: LocalSettingsService,
    private readonly dialogService: DialogService,
    private readonly noticeService: NoticeService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly userService: UserService
  ) {
    // if (this.featureFlagService.showNotifications.enabled) {
    //   void this.init();
    // }
  }

  async loadNotifications(pageIds?: string[]): Promise<void> {
    this.currentQuery?.dispose();
    this.currentQuery = null;

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
    this.activeNotificationDocsObservable$ = this.currentQuery.docs$;
    this.activeNotificationDocs.next(this.currentQuery.docs);
    this.activeNotifications.next(this.currentQuery.docs.map(doc => doc.data));
    void this.currentQuery.remoteChanges$.subscribe(() => {
      this.activeNotificationDocs.next(this.currentQuery.docs);
      this.activeNotifications.next(this.currentQuery.docs.map(doc => doc.data));
    });
  }

  getUnviewedCount(pageId?: string): Observable<number> {
    if (!this.featureFlagService.showNotifications.enabled) {
      return of(0);
    }

    return combineLatest([
      this.activeNotificationDocs,
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
              (n.data.scope === 'Global' || (n.data.pageIds && n.data.pageIds.includes(pageId ?? ''))) &&
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

  async createNotification(notification: Notification): Promise<void> {
    await this.realtimeService.create(NotificationDoc.COLLECTION, objectId(), notification);
  }
}
