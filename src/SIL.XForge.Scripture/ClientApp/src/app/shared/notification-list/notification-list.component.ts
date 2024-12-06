import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { Notification } from 'realtime-server/lib/esm/common/models/notification';
import { Observable } from 'rxjs';
import { NotificationService } from '../../core/notification.service';
import { NotificationComponent } from '../notification/notification.component';

@Component({
  selector: 'app-notification-list',
  template: `
    <ng-container *transloco="let t; read: 'notifications-list'">
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
export class NotificationListComponent implements OnInit {
  @Input() pageId?: string;
  notifications$: Observable<Notification[]>;

  constructor(public readonly notificationService: NotificationService) {}

  ngOnInit(): void {
    this.notifications$ = void this.notificationService.getUnexpiredNotifications();
    void this.notificationService.loadNotifications(this.pageId ? [this.pageId] : undefined);
  }
}
