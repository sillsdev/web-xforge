import { Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder, IHttpConnectionOptions } from '@microsoft/signalr';
import { AuthService } from 'xforge-common/auth.service';

@Injectable({
  providedIn: 'root'
})
export class ProjectNotificationService {
  private connection: HubConnection;
  private options: IHttpConnectionOptions = {
    accessTokenFactory: async () => (await this.authService.getAccessToken()) ?? ''
  };

  constructor(private authService: AuthService) {
    this.connection = new HubConnectionBuilder().withUrl('/project-notifications', this.options).build();
  }

  setNotifySyncProgressHandler(handler: any): void {
    this.connection.on('notifySyncProgress', handler);
  }

  async start(): Promise<void> {
    await this.connection.start();
  }

  async stop(): Promise<void> {
    await this.connection.stop();
  }

  async subscribeToProject(projectId: string): Promise<void> {
    await this.connection.send('subscribeToProject', projectId);
  }
}
