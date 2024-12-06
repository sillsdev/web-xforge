import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { Observable } from 'rxjs';
import { NotificationDoc } from '../../../xforge-common/models/notification-doc';
import { NotificationService } from '../../core/notification.service';
import { NotificationComponent } from '../notification/notification.component';

@Component({
  selector: 'app-notification-list',
  template: `
    <ng-container *transloco="let t; read: 'notifications-list'">
      <div class="notification-list">
        @if (notificationDocs$ | async; as notifications) {
          @if (notifications.length === 0) {
            <div class="no-notifications">
              {{ t('no_notifications') }}
            </div>
          } @else {
            @for (notificationDoc of notificationDocs$ | async; track notificationDoc.id) {
              <app-notification
                [notification]="notificationDoc.data"
                [isViewed]="notificationService.isNotificationViewed(notificationDoc.id)"
                (viewed)="notificationService.markNotificationViewed(notificationDoc.id)"
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
  notificationDocs$: Observable<readonly NotificationDoc[]>;

  constructor(public readonly notificationService: NotificationService) {}

  async ngOnInit(): Promise<void> {
    this.notificationDocs$ = await this.notificationService.getUnexpiredNotificationDocs();
    void this.notificationService.loadNotifications(this.pageId ? [this.pageId] : undefined);
  }
}
