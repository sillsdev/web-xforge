import { Injectable } from '@angular/core';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { Observable, takeWhile } from 'rxjs';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { NotificationServiceBase } from '../../core/notification-service-base';
import { DraftApplyState, DraftApplyStatus } from './draft-import-wizard/draft-import-wizard.component';

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

  /** Emits the progress of applying a draft to the project, and completes once the draft has finished applying. */
  draftApplyProgress$(projectId: string): Observable<DraftApplyState> {
    return this.projectNotifications$<DraftApplyState>('notifyDraftApplyProgress', projectId).pipe(
      takeWhile(state => !isDraftApplyFinished(state), true)
    );
  }
}

/** Whether the state is the final notification sent after applying a draft, whether it succeeded or failed. */
export function isDraftApplyFinished(state: DraftApplyState): boolean {
  return (
    state.bookNum === 0 &&
    state.chapterNum === 0 &&
    (state.status === DraftApplyStatus.Successful || state.status === DraftApplyStatus.Failed)
  );
}
