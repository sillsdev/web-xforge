import { Injectable } from '@angular/core';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { NotificationServiceBase } from '../../core/notification-service-base';
import { SignalRDiagnosticsService } from '../../core/signalr-diagnostics.service';

const hubUrl = '/draft-notifications';

/**
 * Provides notification for draft-level events via SignalR.
 */
@Injectable({
  providedIn: 'root'
})
export class DraftNotificationService extends NotificationServiceBase {
  constructor(
    authService: AuthService,
    onlineService: OnlineStatusService,
    signalRDiagnostics: SignalRDiagnosticsService
  ) {
    super(authService, onlineService, signalRDiagnostics);
    this.connection = new HubConnectionBuilder()
      .withUrl(hubUrl, this.options)
      .withAutomaticReconnect()
      .withStatefulReconnect()
      .build();
    this.countReceivedMessages(hubUrl, ['notifyDraftApplyProgress']);
  }

  removeNotifyDraftApplyProgressHandler(handler: any): void {
    this.connection.off('notifyDraftApplyProgress', handler);
  }

  setNotifyDraftApplyProgressHandler(handler: any): void {
    this.connection.on('notifyDraftApplyProgress', handler);
  }
}
