import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { HubConnection, HubConnectionState } from '@microsoft/signalr';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { instance, mock } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { CONNECTION_IDLE_TIMEOUT_MS, NotificationServiceBase } from './notification-service-base';

class FakeConnection {
  state: HubConnectionState = HubConnectionState.Disconnected;
  startCount = 0;
  stopCount = 0;
  readonly invoked: string[] = [];
  holdStops = false;
  private stopResolvers: (() => void)[] = [];
  private readonly handlers = new Map<string, Set<(...args: any[]) => void>>();

  async start(): Promise<void> {
    this.startCount++;
    this.state = HubConnectionState.Connected;
  }

  async stop(): Promise<void> {
    this.stopCount++;
    this.state = HubConnectionState.Disconnecting;
    if (this.holdStops) {
      await new Promise<void>(resolve => this.stopResolvers.push(resolve));
    }
    this.state = HubConnectionState.Disconnected;
  }

  finishStops(): void {
    this.stopResolvers.forEach(resolve => resolve());
    this.stopResolvers = [];
  }

  async invoke(method: string, ...args: string[]): Promise<void> {
    this.invoked.push(`${method}:${args.join(',')}`);
  }

  on(methodName: string, handler: (...args: any[]) => void): void {
    if (!this.handlers.has(methodName)) this.handlers.set(methodName, new Set());
    this.handlers.get(methodName)!.add(handler);
  }

  off(methodName: string, handler: (...args: any[]) => void): void {
    this.handlers.get(methodName)?.delete(handler);
  }

  /** Simulates the server sending a notification. */
  receive(methodName: string, ...args: any[]): void {
    this.handlers.get(methodName)?.forEach(handler => handler(...args));
  }

  handlerCount(methodName: string): number {
    return this.handlers.get(methodName)?.size ?? 0;
  }
}

class TestNotificationService extends NotificationServiceBase {
  readonly fakeConnection = new FakeConnection();

  constructor(onlineService: OnlineStatusService) {
    super(instance(mock(AuthService)), onlineService);
    this.connection = this.fakeConnection as unknown as HubConnection;
  }

  testNotifications$(projectId: string): Observable<string> {
    return this.projectNotifications$('notifyTest', projectId);
  }
}

describe('NotificationServiceBase', () => {
  let online$: BehaviorSubject<boolean>;
  let service: TestNotificationService;
  let connection: FakeConnection;

  beforeEach(() => {
    online$ = new BehaviorSubject<boolean>(true);
    const onlineService = {
      onlineStatus$: online$.asObservable(),
      get isOnline(): boolean {
        return online$.value;
      },
      get isBrowserOnline(): boolean {
        return online$.value;
      }
    } as OnlineStatusService;
    service = new TestNotificationService(onlineService);
    connection = service.fakeConnection;
  });

  it('starts the connection once for multiple subscribers', fakeAsync(() => {
    const subscription1 = service.testNotifications$('project01').subscribe();
    const subscription2 = service.testNotifications$('project02').subscribe();
    flushMicrotasks();

    expect(connection.startCount).toBe(1);
    expect(connection.invoked).toEqual(['subscribeToProject:project01', 'subscribeToProject:project02']);
    subscription1.unsubscribe();
    subscription2.unsubscribe();
    tick(CONNECTION_IDLE_TIMEOUT_MS);
  }));

  it('only emits notifications for the subscribed project', fakeAsync(() => {
    const received: string[] = [];
    const subscription = service.testNotifications$('project01').subscribe(state => received.push(state));
    flushMicrotasks();

    connection.receive('notifyTest', 'project02', 'other project state');
    connection.receive('notifyTest', 'project01', 'state');
    expect(received).toEqual(['state']);
    subscription.unsubscribe();
    tick(CONNECTION_IDLE_TIMEOUT_MS);
  }));

  it('removes the handler when unsubscribed', fakeAsync(() => {
    const subscription = service.testNotifications$('project01').subscribe();
    flushMicrotasks();
    expect(connection.handlerCount('notifyTest')).toBe(1);

    subscription.unsubscribe();
    expect(connection.handlerCount('notifyTest')).toBe(0);
    tick(CONNECTION_IDLE_TIMEOUT_MS);
  }));

  it('stops the connection after the last subscriber unsubscribes', fakeAsync(() => {
    const subscription1 = service.testNotifications$('project01').subscribe();
    const subscription2 = service.testNotifications$('project01').subscribe();
    flushMicrotasks();

    subscription1.unsubscribe();
    tick(CONNECTION_IDLE_TIMEOUT_MS);
    expect(connection.stopCount).toBe(0);

    subscription2.unsubscribe();
    tick(CONNECTION_IDLE_TIMEOUT_MS - 1);
    expect(connection.stopCount).toBe(0);
    tick(1);
    expect(connection.stopCount).toBe(1);
  }));

  it('keeps the connection open if another subscriber subscribes soon after the last one unsubscribes', fakeAsync(() => {
    service.testNotifications$('project01').subscribe().unsubscribe();
    flushMicrotasks();
    const subscription: Subscription = service.testNotifications$('project02').subscribe();
    tick(CONNECTION_IDLE_TIMEOUT_MS);

    expect(connection.startCount).toBe(1);
    expect(connection.stopCount).toBe(0);
    subscription.unsubscribe();
    tick(CONNECTION_IDLE_TIMEOUT_MS);
  }));

  it('restarts the connection when subscribed while a stop is in progress', fakeAsync(() => {
    service.testNotifications$('project01').subscribe().unsubscribe();
    flushMicrotasks();
    connection.holdStops = true;
    tick(CONNECTION_IDLE_TIMEOUT_MS);
    expect(connection.state).toBe(HubConnectionState.Disconnecting);

    const subscription = service.testNotifications$('project01').subscribe();
    flushMicrotasks();
    expect(connection.startCount).toBe(1);

    connection.finishStops();
    flushMicrotasks();
    expect(connection.startCount).toBe(2);
    expect(connection.state).toBe(HubConnectionState.Connected);
    subscription.unsubscribe();
    tick(CONNECTION_IDLE_TIMEOUT_MS);
  }));

  it('restarts a closed connection when another subscriber subscribes', fakeAsync(() => {
    const subscription1 = service.testNotifications$('project01').subscribe();
    flushMicrotasks();
    // Automatic reconnection can give up, leaving the connection closed while the app is still online
    connection.state = HubConnectionState.Disconnected;

    const subscription2 = service.testNotifications$('project02').subscribe();
    flushMicrotasks();
    expect(connection.startCount).toBe(2);
    expect(connection.invoked).toEqual(['subscribeToProject:project01', 'subscribeToProject:project02']);
    subscription1.unsubscribe();
    subscription2.unsubscribe();
    tick(CONNECTION_IDLE_TIMEOUT_MS);
  }));

  it('restarts the connection and subscribes again when the app comes back online', fakeAsync(() => {
    const subscription = service.testNotifications$('project01').subscribe();
    flushMicrotasks();

    online$.next(false);
    connection.state = HubConnectionState.Disconnected;
    online$.next(true);
    flushMicrotasks();

    expect(connection.startCount).toBe(2);
    expect(connection.invoked).toEqual(['subscribeToProject:project01', 'subscribeToProject:project01']);
    subscription.unsubscribe();
    tick(CONNECTION_IDLE_TIMEOUT_MS);
  }));

  it('waits until online to start the connection', fakeAsync(() => {
    online$.next(false);
    const subscription = service.testNotifications$('project01').subscribe();
    flushMicrotasks();
    expect(connection.startCount).toBe(0);

    online$.next(true);
    flushMicrotasks();
    expect(connection.startCount).toBe(1);
    expect(connection.invoked).toEqual(['subscribeToProject:project01']);
    subscription.unsubscribe();
    tick(CONNECTION_IDLE_TIMEOUT_MS);
  }));

  it('resolves whenListening once subscribed to the project', fakeAsync(() => {
    const subscription = service.testNotifications$('project01').subscribe();
    let listening = false;
    void service.whenListening('project01').then(() => (listening = true));
    flushMicrotasks();

    expect(listening).toBe(true);
    expect(connection.state).toBe(HubConnectionState.Connected);
    subscription.unsubscribe();
    tick(CONNECTION_IDLE_TIMEOUT_MS);
  }));

  it('resolves whenListening immediately when offline', fakeAsync(() => {
    online$.next(false);
    let listening = false;
    void service.whenListening('project01').then(() => (listening = true));
    flushMicrotasks();

    expect(listening).toBe(true);
    expect(connection.startCount).toBe(0);
  }));
});
