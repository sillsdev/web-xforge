import { Injectable } from '@angular/core';
import { AbortError, HubConnection, HubConnectionBuilder, IHttpConnectionOptions } from '@microsoft/signalr';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';

@Injectable({
  providedIn: 'root'
})
export class ProjectNotificationService {
  private connection: HubConnection;
  private options: IHttpConnectionOptions = {
    accessTokenFactory: async () => (await this.authService.getAccessToken()) ?? ''
  };

  constructor(
    private authService: AuthService,
    private readonly onlineService: OnlineStatusService
  ) {
    this.connection = new HubConnectionBuilder().withUrl('/project-notifications', this.options).build();
  }

  get appOnline(): boolean {
    return this.onlineService.isOnline && this.onlineService.isBrowserOnline;
  }

  setNotifyBuildProgressHandler(handler: any): void {
    this.connection.on('notifyBuildProgress', handler);
  }

  setNotifySyncProgressHandler(handler: any): void {
    this.connection.on('notifySyncProgress', handler);
  }

  async start(): Promise<void> {
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
