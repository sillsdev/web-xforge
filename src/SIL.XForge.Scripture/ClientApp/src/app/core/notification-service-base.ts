import { AbortError, HubConnection, HubConnectionState, IHttpConnectionOptions } from '@microsoft/signalr';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';

/**
 * The base class containing functionality for SignalR notification hubs.
 *
 * NOTE: You will need to build the connection in your constructor.
 */
export abstract class NotificationServiceBase {
  protected connection!: HubConnection;
  protected options: IHttpConnectionOptions = {
    accessTokenFactory: async () => (await this.authService.getAccessToken()) ?? ''
  };
  /** The owners (usually components) that currently need the connection to be open. */
  private readonly owners = new Set<object>();
  /** Start and stop operations are run one at a time, in the order they were requested. */
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private authService: AuthService,
    private readonly onlineService: OnlineStatusService
  ) {}

  get appOnline(): boolean {
    return this.onlineService.isOnline && this.onlineService.isBrowserOnline;
  }

  /**
   * Starts the connection if it is not already started, and registers the owner as needing it.
   * Calling this multiple times with the same owner is the same as calling it once.
   * @param owner The caller that needs the connection. Pass the same object to stop().
   */
  start(owner: object): Promise<void> {
    return this.enqueue(async () => {
      this.owners.add(owner);

      // Only start the connection if we are disconnected. If already connected or connecting, we do not need to
      // restart the connection
      if (this.connection.state === HubConnectionState.Disconnected) {
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
        }
      }
    });
  }

  /**
   * Unregisters the owner, and stops the connection if no other owners still need it.
   * @param owner The same object that was passed to start().
   */
  stop(owner: object): Promise<void> {
    return this.enqueue(async () => {
      if (!this.owners.delete(owner) || this.owners.size > 0) return;
      await this.connection.stop();
    });
  }

  async subscribeToProject(projectId: string): Promise<void> {
    // Wait until any pending start or stop has completed
    await this.operationQueue;

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
        err.message?.includes('Invocation canceled due to the underlying connection being closed')
      ) {
        return;
      } else {
        throw err;
      }
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result: Promise<void> = this.operationQueue.then(operation);
    // A failed operation must not prevent later operations from running
    this.operationQueue = result.catch(() => {});
    return result;
  }
}
