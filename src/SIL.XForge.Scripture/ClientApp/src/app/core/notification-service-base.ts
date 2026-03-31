import { AbortError, HubConnection, HubConnectionState, IHttpConnectionOptions } from '@microsoft/signalr';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';

export abstract class NotificationServiceBase {
  protected connection!: HubConnection;
  protected options: IHttpConnectionOptions = {
    accessTokenFactory: async () => (await this.authService.getAccessToken()) ?? ''
  };
  private openConnections: number = 0;
  private startPromise: Promise<void> | null = null;

  constructor(
    private authService: AuthService,
    private readonly onlineService: OnlineStatusService
  ) {}

  get appOnline(): boolean {
    return this.onlineService.isOnline && this.onlineService.isBrowserOnline;
  }

  async start(): Promise<void> {
    this.openConnections++;

    // If a start is already in progress, wait for it to resolve
    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    // Only start the connection if we are disconnected
    if (this.connection.state === HubConnectionState.Disconnected) {
      this.startPromise = (async (): Promise<void> => {
        try {
          await this.connection.start();
        } catch (err) {
          // Suppress AbortErrors, as they are not caused by server error, but the SignalR connection state
          // These will be thrown if a user navigates away quickly after
          // starting the sync or the app loses internet connection
          if (err instanceof AbortError || !this.appOnline) {
            return;
          } else {
            throw err;
          }
        } finally {
          this.startPromise = null; // reset
        }
      })();

      await this.startPromise;
    } else if (this.connection.state === HubConnectionState.Reconnecting) {
      // Wait for the reconnection to complete
      await new Promise<void>(resolve => {
        const handler = (): void => {
          this.connection.off('reconnected', handler);
          resolve();
        };
        this.connection.on('reconnected', handler);
      });
    }

    // If already connected or connecting, we do not need to restart the connection
  }

  async stop(): Promise<void> {
    if (this.openConnections > 0 && --this.openConnections === 0) {
      // If start() has not completed, wait for it to complete before stopping
      if (this.startPromise) {
        await this.startPromise;
      }
      await this.connection.stop();
    }
  }

  async subscribeToProject(projectId: string): Promise<void> {
    // Wait until connection is fully started
    if (this.startPromise) {
      await this.startPromise;
    }

    if (this.connection.state !== HubConnectionState.Connected) {
      // If not connected, skip the invocation
      return;
    }

    try {
      await this.connection.invoke('subscribeToProject', projectId);
    } catch (err: any) {
      // Suppress errors caused by connection closing
      if (
        err.message === "Cannot send data if the connection is not in the 'Connected' State." ||
        err.message.includes('Invocation canceled due to the underlying connection being closed')
      ) {
        return;
      } else {
        throw err;
      }
    }
  }
}
