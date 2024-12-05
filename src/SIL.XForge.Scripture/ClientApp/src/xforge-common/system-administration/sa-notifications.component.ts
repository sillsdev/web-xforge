import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { TranslocoModule } from '@ngneat/transloco';
import { Notification } from 'realtime-server/lib/esm/common/models/notification';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { NotificationService } from '../../app/core/notification.service';

/**
 * System administration component for managing user notifications
 */
@Component({
  selector: 'app-sa-notifications',
  template: `
    <div class="notifications-container">
      <div class="header">
        <h2>Notifications</h2>
        <button mat-flat-button color="primary" (click)="createNotification()">
          <mat-icon>add</mat-icon>
          Create notification
        </button>
      </div>

      <table mat-table [dataSource]="notifications$ | async" class="notifications-table">
        <ng-container matColumnDef="title">
          <th mat-header-cell *matHeaderCellDef>Title</th>
          <td mat-cell *matCellDef="let notification">{{ notification.title }}</td>
        </ng-container>

        <ng-container matColumnDef="type">
          <th mat-header-cell *matHeaderCellDef>Type</th>
          <td mat-cell *matCellDef="let notification">{{ notification.type }}</td>
        </ng-container>

        <ng-container matColumnDef="scope">
          <th mat-header-cell *matHeaderCellDef>Scope</th>
          <td mat-cell *matCellDef="let notification">{{ notification.scope }}</td>
        </ng-container>

        <ng-container matColumnDef="expirationDate">
          <th mat-header-cell *matHeaderCellDef>Expiration</th>
          <td mat-cell *matCellDef="let notification">{{ notification.expirationDate | date }}</td>
        </ng-container>

        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef>Actions</th>
          <td mat-cell *matCellDef="let notification">
            <button mat-icon-button color="warn" (click)="deleteNotification(notification)">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
      </table>
    </div>
  `,
  styles: [
    `
      .notifications-container {
        padding: 20px;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }

      .notifications-table {
        width: 100%;
      }
    `
  ],
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTableModule, TranslocoModule]
})
export class SaNotificationsComponent implements OnInit {
  displayedColumns: string[] = ['title', 'type', 'scope', 'expirationDate', 'actions'];
  notifications$: Observable<Notification[]>;

  constructor(private readonly notificationService: NotificationService) {
    // Get all notifications and sort by creation date descending
    this.notifications$ = this.notificationService
      .getActiveNotifications()
      .pipe(
        map(notifications =>
          notifications.sort((a, b) => new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime())
        )
      );
  }

  ngOnInit(): void {
    void this.notificationService.loadNotifications();
  }

  createNotification(): void {
    // TODO: Implement notification creation dialog
    console.log('Create notification');
  }

  deleteNotification(notification: Notification): void {
    // TODO: Add confirmation dialog
    // void this.notificationService.deleteNotification(notification.id);
  }
}
