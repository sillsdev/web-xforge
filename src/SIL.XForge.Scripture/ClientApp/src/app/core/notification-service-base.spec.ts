import { HubConnection, HubConnectionState } from '@microsoft/signalr';
import { instance, mock } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { NotificationServiceBase } from './notification-service-base';

class FakeConnection {
  state: HubConnectionState = HubConnectionState.Disconnected;
  startCount = 0;
  stopCount = 0;
  readonly invoked: string[] = [];
  private stopResolvers: (() => void)[] = [];
  holdStops = false;

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
}

class TestNotificationService extends NotificationServiceBase {
  readonly fakeConnection = new FakeConnection();

  constructor() {
    super(instance(mock(AuthService)), instance(mock(OnlineStatusService)));
    this.connection = this.fakeConnection as unknown as HubConnection;
  }
}

describe('NotificationServiceBase', () => {
  let service: TestNotificationService;

  beforeEach(() => {
    service = new TestNotificationService();
  });

  it('starts the connection once for multiple owners', async () => {
    await service.start({});
    await service.start({});
    expect(service.fakeConnection.startCount).toBe(1);
  });

  it('counts repeated starts from the same owner once', async () => {
    const owner = {};
    await service.start(owner);
    await service.start(owner);
    await service.start(owner);
    await service.stop(owner);
    expect(service.fakeConnection.stopCount).toBe(1);
  });

  it('keeps the connection open until the last owner stops', async () => {
    const owner1 = {};
    const owner2 = {};
    await service.start(owner1);
    await service.start(owner2);
    await service.stop(owner1);
    expect(service.fakeConnection.stopCount).toBe(0);
    await service.stop(owner2);
    expect(service.fakeConnection.stopCount).toBe(1);
  });

  it('ignores stop from an owner that did not start', async () => {
    const owner = {};
    await service.start(owner);
    await service.stop({});
    expect(service.fakeConnection.stopCount).toBe(0);
  });

  it('restarts the connection when started while a stop is in progress', async () => {
    const owner1 = {};
    const owner2 = {};
    await service.start(owner1);
    service.fakeConnection.holdStops = true;

    const stopPromise = service.stop(owner1);
    const startPromise = service.start(owner2);
    // Let the stop begin, then confirm the start has not run alongside it
    await new Promise<void>(resolve => setTimeout(resolve));
    expect(service.fakeConnection.state).toBe(HubConnectionState.Disconnecting);
    expect(service.fakeConnection.startCount).toBe(1);
    service.fakeConnection.finishStops();
    await Promise.all([stopPromise, startPromise]);

    expect(service.fakeConnection.startCount).toBe(2);
    expect(service.fakeConnection.state).toBe(HubConnectionState.Connected);
  });

  it('does not stop the connection if an owner starts before a queued stop runs', async () => {
    const owner1 = {};
    const owner2 = {};
    await service.start(owner1);

    const startPromise = service.start(owner2);
    const stopPromise = service.stop(owner1);
    await Promise.all([startPromise, stopPromise]);

    expect(service.fakeConnection.stopCount).toBe(0);
    expect(service.fakeConnection.state).toBe(HubConnectionState.Connected);
  });

  it('subscribes to a project when connected', async () => {
    await service.start({});
    await service.subscribeToProject('project01');
    expect(service.fakeConnection.invoked).toEqual(['subscribeToProject:project01']);
  });

  it('does not subscribe to a project when not connected', async () => {
    await service.subscribeToProject('project01');
    expect(service.fakeConnection.invoked).toEqual([]);
  });
});
