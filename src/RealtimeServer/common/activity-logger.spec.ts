import path from 'path';
import { ActivityLogger } from './activity-logger';

let mockFsPromises: MockFsPromises;
jest.mock('fs/promises', () => ({
  mkdir: (...args: [string, unknown]) => mockFsPromises.mkdir(...args),
  appendFile: (...args: [string, string, unknown]) => mockFsPromises.appendFile(...args)
}));

// TestEnvironment sets these directly on real process.env. Restore after each test.
const ENV_VAR_NAMES = ['SF_RTS_LOG_LEVEL', 'SF_RTS_LOG_PATH', 'XDG_DATA_HOME', 'HOME'] as const;
let originalEnvValues: Record<string, string | undefined>;

beforeEach(() => {
  originalEnvValues = {};
  for (const name of ENV_VAR_NAMES) {
    originalEnvValues[name] = process.env[name];
  }
});

afterEach(() => {
  for (const name of ENV_VAR_NAMES) {
    const originalValue: string | undefined = originalEnvValues[name];
    if (originalValue === undefined) delete process.env[name];
    else process.env[name] = originalValue;
  }
});

describe('ActivityLogger', () => {
  describe('log level', () => {
    it('defaults to none when SF_RTS_LOG_LEVEL is unset', () => {
      const env = new TestEnvironment({ SF_RTS_LOG_LEVEL: null });
      // SUT
      env.logger.log('someEvent');
      expect(mockFsPromises.appendFileCalls.length).toBe(0);
    });

    it('defaults to none when SF_RTS_LOG_LEVEL is invalid', () => {
      const env = new TestEnvironment({ SF_RTS_LOG_LEVEL: 'someInvalid' });
      // SUT
      env.logger.log('someEvent');
      expect(mockFsPromises.appendFileCalls.length).toBe(0);
    });

    it('does not write to a file when level is none', () => {
      const env = new TestEnvironment({ SF_RTS_LOG_LEVEL: 'none' });
      // SUT
      env.logger.log('someEvent');
      expect(mockFsPromises.appendFileCalls.length).toBe(0);
    });

    it('writes to a file when level is all', async () => {
      const env = new TestEnvironment({ SF_RTS_LOG_LEVEL: 'all' });
      // SUT
      env.logger.log('someEvent', { detail: 'abc' });
      await TestEnvironment.flushMicrotasks();
      expect(mockFsPromises.appendFileCalls.length).toBe(1);
      const written: any = JSON.parse(mockFsPromises.appendFileCalls[0].trim());
      expect(written.event).toBe('someEvent');
      expect(written.detail).toBe('abc');
      expect(typeof written.timestamp).toBe('string');
    });
  });

  describe('entry fields', () => {
    it('writes timestamp first, then event, then the details', async () => {
      const env = new TestEnvironment({ SF_RTS_LOG_LEVEL: 'all' });
      // SUT
      env.logger.log('someEvent', { someDetail: 'abc', anotherDetail: 'def' });
      await TestEnvironment.flushMicrotasks();
      const written: any = JSON.parse(mockFsPromises.appendFileCalls[0].trim());
      expect(Object.keys(written)).toEqual(['timestamp', 'event', 'pid', 'someDetail', 'anotherDetail']);
    });

    it('identifies the process that wrote the entry', async () => {
      const env = new TestEnvironment({ SF_RTS_LOG_LEVEL: 'all' });
      // SUT
      env.logger.log('someEvent');
      await TestEnvironment.flushMicrotasks();
      const written: any = JSON.parse(mockFsPromises.appendFileCalls[0].trim());
      expect(written.pid).toBe(process.pid);
    });

    it('does not let details overwrite timestamp, event, or pid', async () => {
      const env = new TestEnvironment({ SF_RTS_LOG_LEVEL: 'all' });
      // SUT
      env.logger.log('someEvent', { timestamp: 'someBogusTimestamp', event: 'someBogusEvent', pid: -1 });
      await TestEnvironment.flushMicrotasks();
      const written: any = JSON.parse(mockFsPromises.appendFileCalls[0].trim());
      expect(Object.keys(written)).toEqual(['timestamp', 'event', 'pid']);
      expect(written.event).toBe('someEvent');
      expect(written.timestamp).not.toBe('someBogusTimestamp');
      expect(written.pid).toBe(process.pid);
    });
  });

  describe('log path', () => {
    it('prioritizes SF_RTS_LOG_PATH', async () => {
      const logPath: string = `${path.sep}sf-rts-log-path${path.sep}rts.jsonl`;
      const env = new TestEnvironment({
        SF_RTS_LOG_LEVEL: 'all',
        SF_RTS_LOG_PATH: logPath,
        XDG_DATA_HOME: `${path.sep}xdg-data-home`,
        HOME: `${path.sep}home`
      });
      // SUT
      env.logger.log('someEvent');
      await TestEnvironment.flushMicrotasks();
      TestEnvironment.expectWritePath(logPath);
    });

    it('uses XDG_DATA_HOME when SF_RTS_LOG_PATH is unset', async () => {
      const xdgDataHome: string = `${path.sep}xdg-data-home`;
      const env = new TestEnvironment({
        SF_RTS_LOG_LEVEL: 'all',
        SF_RTS_LOG_PATH: null,
        XDG_DATA_HOME: xdgDataHome,
        HOME: `${path.sep}home`
      });
      const expectedPath: string = path.join(xdgDataHome, 'sf-rts-activity-log', 'realtimeserver-log.jsonl');
      // SUT
      env.logger.log('someEvent');
      await TestEnvironment.flushMicrotasks();
      TestEnvironment.expectWritePath(expectedPath);
    });

    it('uses HOME when SF_RTS_LOG_PATH and XDG_DATA_HOME are unset', async () => {
      const env = new TestEnvironment({
        SF_RTS_LOG_LEVEL: 'all',
        SF_RTS_LOG_PATH: null,
        XDG_DATA_HOME: null,
        HOME: `${path.sep}home`
      });
      const expectedPath: string = path.join(
        `${path.sep}home`,
        '.local',
        'share',
        'sf-rts-activity-log',
        'realtimeserver-log.jsonl'
      );
      // SUT
      env.logger.log('someEvent');
      await TestEnvironment.flushMicrotasks();
      TestEnvironment.expectWritePath(expectedPath);
    });

    it('uses cwd when SF_RTS_LOG_PATH, XDG_DATA_HOME, and HOME are unset', async () => {
      const env = new TestEnvironment({
        SF_RTS_LOG_LEVEL: 'all',
        SF_RTS_LOG_PATH: null,
        XDG_DATA_HOME: null,
        HOME: null
      });
      const expectedPath: string = path.join(process.cwd(), 'sf-rts-activity-log', 'realtimeserver-log.jsonl');
      // SUT
      env.logger.log('someEvent');
      await TestEnvironment.flushMicrotasks();
      TestEnvironment.expectWritePath(expectedPath);
    });
  });
});

/** Records calls that ActivityLogger makes to fs/promises, in place of touching the real filesystem. */
class MockFsPromises {
  public readonly mkdirCalls: string[] = [];
  public readonly appendFileCalls: string[] = [];
  public readonly appendFilePaths: string[] = [];

  mkdir(dirPath: string, _options?: unknown): Promise<void> {
    this.mkdirCalls.push(dirPath);
    return Promise.resolve();
  }

  appendFile(filePath: string, data: string, _options?: unknown): Promise<void> {
    this.appendFilePaths.push(filePath);
    this.appendFileCalls.push(data);
    return Promise.resolve();
  }
}

/** Sets up the environment variables that ActivityLogger reads, and a fresh logger and fs mock, for one test. */
class TestEnvironment {
  public readonly logger: ActivityLogger;

  constructor({
    SF_RTS_LOG_LEVEL,
    SF_RTS_LOG_PATH = null,
    XDG_DATA_HOME = null,
    HOME = null
  }: {
    SF_RTS_LOG_LEVEL: string | null;
    SF_RTS_LOG_PATH?: string | null;
    XDG_DATA_HOME?: string | null;
    HOME?: string | null;
  }) {
    TestEnvironment.setEnvVar('SF_RTS_LOG_LEVEL', SF_RTS_LOG_LEVEL);
    TestEnvironment.setEnvVar('SF_RTS_LOG_PATH', SF_RTS_LOG_PATH);
    TestEnvironment.setEnvVar('XDG_DATA_HOME', XDG_DATA_HOME);
    TestEnvironment.setEnvVar('HOME', HOME);

    // Recreate mock
    mockFsPromises = new MockFsPromises();
    // Reset singleton between tests
    (ActivityLogger as any)._instance = undefined;
    this.logger = ActivityLogger.instance;
  }

  static flushMicrotasks(): Promise<void> {
    return new Promise<void>(resolve => setImmediate(resolve));
  }

  static expectWritePath(expectedPath: string): void {
    expect(mockFsPromises.mkdirCalls.length).toBeGreaterThan(0);
    expect(mockFsPromises.mkdirCalls[0]).toBe(path.dirname(expectedPath));
    expect(mockFsPromises.appendFilePaths.length).toBeGreaterThan(0);
    expect(mockFsPromises.appendFilePaths[0]).toBe(expectedPath);
  }

  private static setEnvVar(name: string, value: string | null): void {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
}
