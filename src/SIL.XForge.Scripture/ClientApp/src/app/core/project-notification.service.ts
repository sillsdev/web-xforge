import { Injectable } from '@angular/core';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { Observable } from 'rxjs';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { ProgressState } from '../sync/sync-progress/sync-progress.component';
import { DraftApplyState } from '../translate/draft-generation/draft-import-wizard/draft-import-wizard.component';
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

  /** Emits when the state of a draft build for the project changes. The build state itself is not used. */
  buildProgress$(projectId: string): Observable<unknown> {
    return this.projectNotifications$('notifyBuildProgress', projectId);
  }

  draftApplyProgress$(projectId: string): Observable<DraftApplyState> {
    return this.projectNotifications$('notifyDraftApplyProgress', projectId);
  }

  syncProgress$(projectId: string): Observable<ProgressState> {
    return this.projectNotifications$('notifySyncProgress', projectId);
  }
}
