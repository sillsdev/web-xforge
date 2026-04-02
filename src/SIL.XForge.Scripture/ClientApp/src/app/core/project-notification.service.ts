import { Injectable } from '@angular/core';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { NotificationServiceBase } from './notification-service-base';

/**
 * Provides notification for project-level events via SignalR.
 */
@Injectable({
  providedIn: 'root'
})
export class ProjectNotificationService extends NotificationServiceBase {
  constructor(authService: AuthService, onlineService: OnlineStatusService) {
    super(authService, onlineService);
    this.connection = new HubConnectionBuilder()
      .withUrl('/project-notifications', this.options)
      .withAutomaticReconnect()
      .build();
  }

  removeNotifyBuildProgressHandler(handler: any): void {
    this.connection.off('notifyBuildProgress', handler);
  }

  removeNotifyDraftApplyProgressHandler(handler: any): void {
    this.connection.off('notifyDraftApplyProgress', handler);
  }

  removeNotifySyncProgressHandler(handler: any): void {
    this.connection.off('notifySyncProgress', handler);
  }

  setNotifyBuildProgressHandler(handler: any): void {
    this.connection.on('notifyBuildProgress', handler);
  }

  setNotifyDraftApplyProgressHandler(handler: any): void {
    this.connection.on('notifyDraftApplyProgress', handler);
  }

  setNotifySyncProgressHandler(handler: any): void {
    this.connection.on('notifySyncProgress', handler);
  }
}
