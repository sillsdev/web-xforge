import { SignalRDiagnosticsService } from './signalr-diagnostics.service';

describe('SignalRDiagnosticsService', () => {
  it('starts with no messages', () => {
    const env = new TestEnvironment();
    expect(env.service.messageCounts).toEqual([]);
    expect(env.service.totalMessageCount).toBe(0);
  });

  it('counts messages by hub and event', () => {
    const env = new TestEnvironment();
    env.service.recordMessage('/project-notifications', 'notifySyncProgress');
    env.service.recordMessage('/project-notifications', 'notifySyncProgress');
    env.service.recordMessage('/project-notifications', 'notifyBuildProgress');
    env.service.recordMessage('/draft-notifications', 'notifyDraftApplyProgress');

    expect(env.service.messageCounts).toEqual([
      { hub: '/project-notifications', event: 'notifySyncProgress', count: 2 },
      { hub: '/project-notifications', event: 'notifyBuildProgress', count: 1 },
      { hub: '/draft-notifications', event: 'notifyDraftApplyProgress', count: 1 }
    ]);
    expect(env.service.totalMessageCount).toBe(4);
  });

  class TestEnvironment {
    readonly service = new SignalRDiagnosticsService();
  }
});
