import { ActivityLogger } from './activity-logger';
import {
  ExternalInteropMethod,
  InteropCallback,
  InteropCallContext,
  withActivityLogging
} from './interop-activity-logging';

/** An ActivityLogger.log call captured by TestEnvironment. */
interface LoggedActivity {
  event: string;
  details: Record<string, unknown>;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('withActivityLogging', () => {
  it('reports the same call id on interopCall as it gives the method', () => {
    const env = new TestEnvironment();
    const wrapped = env.wrap('someMethod');
    // SUT
    wrapped(() => {}, 'someArg');
    env.completeCall(0);
    const interopCall: LoggedActivity | undefined = env.logged.find(item => item.event === 'interopCall');
    expect(interopCall!.details['callId']).toBe(env.contexts[0].callId);
  });

  it('gives each call its own id, even when calls overlap', () => {
    const env = new TestEnvironment();
    const wrapped = env.wrap('someMethod');
    wrapped(() => {}, 'firstArg');
    wrapped(() => {}, 'secondArg');
    expect(env.contexts[0].callId).not.toBe(env.contexts[1].callId);
    // SUT. Complete out of order, as adjacency in the log is not what is needed to pair the entries up in later log
    // analysis.
    env.completeCall(1);
    env.completeCall(0);
    const interopCalls: LoggedActivity[] = env.logged.filter(item => item.event === 'interopCall');
    expect(interopCalls[0].details['callId']).toBe(env.contexts[1].callId);
    expect(interopCalls[1].details['callId']).toBe(env.contexts[0].callId);
  });

  it('passes the method its own arguments after the call context', () => {
    const env = new TestEnvironment();
    const wrapped = env.wrap('someMethod');
    // SUT
    wrapped(() => {}, 'someArg', 7);
    expect(env.receivedArgs[0]).toEqual(['someArg', 7]);
  });

  it('logs isServerRunning check', () => {
    const env = new TestEnvironment();
    const wrapped = env.wrap('isServerRunning');
    // SUT
    wrapped(() => {});
    env.completeCall(0);
    expect(env.logged.filter(item => item.event === 'interopCall').length).toBe(1);
  });

  it('does not log when activity logging is disabled', () => {
    const env = new TestEnvironment({ activityLoggingEnabled: false });
    const wrapped = env.wrap('someMethod');
    // SUT
    wrapped(() => {}, 'someArg');
    env.completeCall(0);
    expect(env.logged.length).toBe(0);
  });
});

/** Wraps a method that records what it was given and only finishes when the test says so. */
class TestEnvironment {
  readonly logged: LoggedActivity[] = [];
  readonly contexts: InteropCallContext[] = [];
  readonly receivedArgs: any[][] = [];
  private readonly pendingCallbacks: InteropCallback[] = [];

  constructor({
    activityLoggingEnabled = true
  }: {
    activityLoggingEnabled?: boolean;
  } = {}) {
    jest.spyOn(ActivityLogger.instance, 'enabled', 'get').mockReturnValue(activityLoggingEnabled);
    jest
      .spyOn(ActivityLogger.instance, 'log')
      .mockImplementation((event: string, details: Record<string, unknown> = {}) => {
        this.logged.push({ event: event, details: details });
      });
  }

  wrap(methodName: string): ExternalInteropMethod {
    const wrapped = withActivityLogging({
      [methodName]: (callback: InteropCallback, context: InteropCallContext, ...args: any[]): void => {
        this.contexts.push(context);
        this.receivedArgs.push(args);
        // Held rather than called, so that the test controls when the call finishes.
        this.pendingCallbacks.push(callback);
      }
    });
    return wrapped[methodName];
  }

  /** Finish the call that was started nth, so that calls can be completed out of order. */
  completeCall(index: number): void {
    this.pendingCallbacks[index](undefined, {});
  }
}
