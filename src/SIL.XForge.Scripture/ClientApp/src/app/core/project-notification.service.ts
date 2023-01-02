import { Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';

@Injectable({
  providedIn: 'root'
})
export class ProjectNotificationService {
  private connection: HubConnection;

  constructor() {
    this.connection = new HubConnectionBuilder().withUrl('/project-notifications').build();
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
