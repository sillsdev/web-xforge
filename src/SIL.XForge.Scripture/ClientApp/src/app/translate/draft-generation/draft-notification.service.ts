import { Injectable } from '@angular/core';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { NotificationServiceBase } from '../../core/notification-service-base';

/**
 * Provides notification for draft-level events via SignalR.
 */
@Injectable({
  providedIn: 'root'
})
export class DraftNotificationService extends NotificationServiceBase {
  constructor(authService: AuthService, onlineService: OnlineStatusService) {
    super(authService, onlineService);
    this.connection = new HubConnectionBuilder()
      .withUrl('/draft-notifications', this.options)
      .withAutomaticReconnect()
      .withStatefulReconnect()
      .build();
  }

  removeNotifyDraftApplyProgressHandler(handler: any): void {
    this.connection.off('notifyDraftApplyProgress', handler);
  }

  setNotifyDraftApplyProgressHandler(handler: any): void {
    this.connection.on('notifyDraftApplyProgress', handler);
  }
}
