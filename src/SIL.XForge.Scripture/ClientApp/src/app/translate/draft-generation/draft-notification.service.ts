import { Injectable } from '@angular/core';
import {
  AbortError,
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  IHttpConnectionOptions
} from '@microsoft/signalr';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';

@Injectable({
  providedIn: 'root'
})
export class DraftNotificationService {
  private connection: HubConnection;
  private options: IHttpConnectionOptions = {
    accessTokenFactory: async () => (await this.authService.getAccessToken()) ?? ''
  };

  constructor(
    private authService: AuthService,
    private readonly onlineService: OnlineStatusService
  ) {
    this.connection = new HubConnectionBuilder()
      .withUrl('/draft-notifications', this.options)
      .withAutomaticReconnect()
      .withStatefulReconnect()
      .build();
  }

  get appOnline(): boolean {
    return this.onlineService.isOnline && this.onlineService.isBrowserOnline;
  }

  removeNotifyDraftApplyProgressHandler(handler: any): void {
    this.connection.off('notifyDraftApplyProgress', handler);
  }

  setNotifyDraftApplyProgressHandler(handler: any): void {
    this.connection.on('notifyDraftApplyProgress', handler);
  }

  async start(): Promise<void> {
    if (this.connection.state !== HubConnectionState.Disconnected) {
      await this.connection.stop();
    }
    await this.connection.start().catch(err => {
      // Suppress AbortErrors, as they are not caused by server error, but the SignalR connection state
      // These will be thrown if a user navigates away quickly after
      // starting the sync or the app loses internet connection
      if (err instanceof AbortError || !this.appOnline) {
        return;
      } else {
        throw err;
      }
    });
  }

  async stop(): Promise<void> {
    await this.connection.stop();
  }

  async subscribeToProject(projectId: string): Promise<void> {
    await this.connection.send('subscribeToProject', projectId).catch(err => {
      // This error is thrown when a user navigates away quickly after starting the sync
      if (err.message === "Cannot send data if the connection is not in the 'Connected' State.") {
        return;
      } else {
        throw err;
      }
    });
  }
}
