import { AbortError, HubConnection, HubConnectionState, IHttpConnectionOptions } from '@microsoft/signalr';
import {
  distinctUntilChanged,
  filter,
  finalize,
  firstValueFrom,
  from,
  Observable,
  ReplaySubject,
  share,
  switchMap,
  timer
} from 'rxjs';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';

/**
 * How long the connection stays open after the last subscriber unsubscribes. This avoids stopping and restarting the
 * connection when one component is destroyed and another that also needs notifications is created straight after.
 */
export const CONNECTION_IDLE_TIMEOUT_MS = 1000;

/**
 * The base class containing functionality for SignalR notification hubs.
 *
 * The connection is started when the first subscriber subscribes to a project's notifications, and stopped once there
 * are no subscribers left.
 *
 * NOTE: You will need to build the connection in your constructor.
 */
export abstract class NotificationServiceBase {
  protected connection!: HubConnection;
  protected options: IHttpConnectionOptions = {
    accessTokenFactory: async () => (await this.authService.getAccessToken()) ?? ''
  };
  private startPromise: Promise<void> = Promise.resolve();
  private stopPromise: Promise<void> = Promise.resolve();

  /**
   * Emits when subscribed if the app is online, and again whenever the app comes back online.
   * Once there are no subscribers left, the connection is stopped.
   */
  private readonly online$: Observable<boolean> = this.onlineService.onlineStatus$.pipe(
    distinctUntilChanged(),
    filter(isOnline => isOnline),
    finalize(() => this.stopConnection()),
    // Replay so that subscribers who subscribe after the app came online are told that it is online
    share({ connector: () => new ReplaySubject(1), resetOnRefCountZero: () => timer(CONNECTION_IDLE_TIMEOUT_MS) })
  );

  constructor(
    private authService: AuthService,
    private readonly onlineService: OnlineStatusService
  ) {}

  get appOnline(): boolean {
    return this.onlineService.isOnline && this.onlineService.isBrowserOnline;
  }

  /**
   * Resolves once notifications for the project will be received. Call this before starting an operation that sends
   * notifications, so that none are missed. Subscribe to the notifications first, so that the connection stays open.
   */
  async whenListening(projectId: string): Promise<void> {
    // When offline, the connection will not start until the app is back online, so do not wait for it
    if (!this.appOnline) return;
    await firstValueFrom(this.subscribeToProject$(projectId));
  }

  /**
   * Emits the state sent with each notification of the specified type for the project.
   * The connection is kept open while there are subscribers.
   */
  protected projectNotifications$<T>(methodName: string, projectId: string): Observable<T> {
    return new Observable<T>(subscriber => {
      const handler = (notifiedProjectId: string, state: T): void => {
        // The connection is shared, so it receives notifications for every project that any subscriber is listening to
        if (notifiedProjectId === projectId) subscriber.next(state);
      };
      this.connection.on(methodName, handler);
      const subscription = this.subscribeToProject$(projectId).subscribe({ error: err => subscriber.error(err) });
      return () => {
        this.connection.off(methodName, handler);
        subscription.unsubscribe();
      };
    });
  }

  /**
   * Starts the connection if needed, and subscribes to the project's notifications. This is repeated whenever the app
   * comes back online. Emits each time the project has been subscribed to.
   */
  private subscribeToProject$(projectId: string): Observable<void> {
    return this.online$.pipe(
      switchMap(() => from(this.startConnection().then(() => this.subscribeToProject(projectId))))
    );
  }

  private async startConnection(): Promise<void> {
    // The connection cannot be started again until it has finished stopping
    await this.stopPromise;
    // Only start the connection if we are disconnected. If already connected or connecting, we do not need to
    // restart the connection
    if (this.connection.state === HubConnectionState.Disconnected) {
      this.startPromise = this.connection.start();
    }
    try {
      await this.startPromise;
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

  private stopConnection(): void {
    this.stopPromise = this.connection.stop();
  }

  private async subscribeToProject(projectId: string): Promise<void> {
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
}
