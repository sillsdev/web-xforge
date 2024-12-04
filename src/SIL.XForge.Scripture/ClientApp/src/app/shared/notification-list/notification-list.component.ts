import { CommonModule } from '@angular/common';
import { Input } from '@angular/core';

// src/SIL.XForge.Scripture/ClientApp/src/app/shared/notification-list/notification-list.component.ts
@Component({
  selector: 'app-notification-list',
  template: `
    <ng-container *transloco="let t">
      <div class="notification-list">
        @if (notifications$ | async; as notifications) {
          @if (notifications.length === 0) {
            <div class="no-notifications">
              {{ t('no_notifications') }}
            </div>
          } @else {
            @for (notification of notifications; track notification.id) {
              <app-notification
                [notification]="notification"
                [isViewed]="notificationService.isNotificationViewed(notification.id)"
                (viewed)="notificationService.markNotificationViewed(notification.id)"
              >
              </app-notification>
            }
          }
        }
      </div>
    </ng-container>
  `,
  styles: [
    `
      .notification-list {
        padding: 8px;
        min-width: 300px;
      }

      .no-notifications {
        padding: 16px;
        text-align: center;
        color: var(--mdc-theme-text-secondary-on-background);
      }
    `
  ],
  standalone: true,
  imports: [CommonModule, NotificationComponent, TranslocoModule]
})
export class NotificationListComponent {
  @Input() pageId?: string;
  notifications$: Observable<Notification[]>;

  constructor(public readonly notificationService: NotificationService) {
    this.notifications$ = this.notificationService.getActiveNotifications();
  }

  ngOnInit(): void {
    void this.notificationService.loadNotifications(this.pageId ? [this.pageId] : undefined);
  }
}
