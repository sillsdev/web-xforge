import path from 'path';
import ShareDB from 'sharedb';
import { Duplex } from 'stream';
import { ResourceMonitor } from './resource-monitor';

/**
 * Stands in for the stream beneath an agent, carrying only what a report reads from it. A web socket client has a `ws`
 * with bytes queued in it; the in-process streams have no `ws` at all. Handlers are kept so that a test can fire the
 * event itself, rather than needing a real stream to reach the end of its life.
 */
interface FakeStream {
  writableLength: number;
  once: (event: string, handler: () => void) => void;
  handlers: Map<string, () => void>;
  ws?: { bufferedAmount: number };
}

let mockFsPromises: MockFsPromises;
jest.mock('fs/promises', () => ({
  mkdir: (...args: [string, unknown]) => mockFsPromises.mkdir(...args),
  writeFile: (...args: [string, string, unknown]) => mockFsPromises.writeFile(...args),
  appendFile: (...args: [string, string, unknown]) => mockFsPromises.appendFile(...args)
}));

let mockHomedir: string = '';
jest.mock('os', () => ({ ...jest.requireActual('os'), homedir: () => mockHomedir }));

// TestEnvironment sets these directly on real process.env. Restore after each test.
const ENV_VAR_NAMES = ['SF_RESOURCE_REPORTS_PATH', 'XDG_DATA_HOME', 'SF_SIGUSR2_ACTION'] as const;
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
  mockHomedir = '';
});

describe('ResourceMonitor', () => {
  describe('getOutputDir', () => {
    function expectWriteCallsForBaseDir(expectedDir: string): void {
      expect(mockFsPromises.writtenPaths.length).toBeGreaterThan(0);
      expect(mockFsPromises.writtenPaths[0]).toContain(`${expectedDir}${path.sep}heap-info.csv`);
      expect(mockFsPromises.writtenPaths).toContain(`${expectedDir}${path.sep}heap-space-info.csv`);
      for (const filePath of mockFsPromises.writtenPaths) {
        expect(filePath).toContain(`${expectedDir}${path.sep}`);
      }
      expect(mockFsPromises.mkdirCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.mkdirCalls).toContain(expectedDir);
    }

    it('prioritizes SF_RESOURCE_REPORTS_PATH', async () => {
      const sfResourceReportsPath: string = `${path.sep}sf-resource-reports-path`;
      const env: TestEnvironment = new TestEnvironment({
        SF_RESOURCE_REPORTS_PATH: sfResourceReportsPath,
        XDG_DATA_HOME: `${path.sep}xdg-data-home`,
        homedir: `${path.sep}home`
      });
      const expectedDir: string = sfResourceReportsPath;
      // SUT
      await env.monitor.record();
      expectWriteCallsForBaseDir(expectedDir);
    });

    it('uses XDG_DATA_HOME when SF_RESOURCE_REPORTS_PATH is unset', async () => {
      const xdgDataHome = `${path.sep}xdg-data-home`;
      const env = new TestEnvironment({
        SF_RESOURCE_REPORTS_PATH: null,
        XDG_DATA_HOME: xdgDataHome,
        homedir: `${path.sep}home`
      });
      const reportDirName: string = 'sf-resource-reports';
      const expectedDir: string = path.join(xdgDataHome, reportDirName);
      // SUT
      await env.monitor.record();
      expectWriteCallsForBaseDir(expectedDir);
    });

    it('uses the home directory when SF_RESOURCE_REPORTS_PATH and XDG_DATA_HOME are unset', async () => {
      const env = new TestEnvironment({
        SF_RESOURCE_REPORTS_PATH: null,
        XDG_DATA_HOME: null,
        homedir: `${path.sep}home`
      });
      const reportDirName: string = 'sf-resource-reports';
      const expectedDir: string = path.join(`${path.sep}home`, '.local', 'share', reportDirName);
      // SUT
      await env.monitor.record();
      expectWriteCallsForBaseDir(expectedDir);
    });

    it('uses the home directory when SF_RESOURCE_REPORTS_PATH is unset and XDG_DATA_HOME is empty', async () => {
      // XDG_DATA_HOME is not used if unset or empty
      // (https://specifications.freedesktop.org/basedir-spec/latest/#variables).
      const env = new TestEnvironment({
        SF_RESOURCE_REPORTS_PATH: null,
        XDG_DATA_HOME: '',
        homedir: `${path.sep}home`
      });
      const reportDirName: string = 'sf-resource-reports';
      const expectedDir: string = path.join(`${path.sep}home`, '.local', 'share', reportDirName);
      // SUT
      await env.monitor.record();
      expectWriteCallsForBaseDir(expectedDir);
    });

    it('uses cwd when SF_RESOURCE_REPORTS_PATH and XDG_DATA_HOME are unset and there is no home directory', async () => {
      const env = new TestEnvironment({ SF_RESOURCE_REPORTS_PATH: null, XDG_DATA_HOME: null, homedir: null });
      const reportDirName: string = 'sf-resource-reports';
      const expectedDir: string = path.join(process.cwd(), reportDirName);
      // SUT
      await env.monitor.record();
      expectWriteCallsForBaseDir(expectedDir);
    });
  });

  describe('recordOpLoaded', () => {
    it('keeps the totals of one document apart from those of another', async () => {
      const env: TestEnvironment = new TestEnvironment();
      env.monitor.recordOpLoaded('client01', 'sf_projects', 'project01', { p: ['a'], oi: 1 }, 'user01', false);
      env.monitor.recordOpLoaded('client01', 'sf_projects', 'project01', { p: ['b'], oi: 2 }, 'user01', false);
      env.monitor.recordOpLoaded('client01', 'sf_projects', 'project02', { p: ['c'], oi: 3 }, 'user01', false);
      // SUT
      await env.monitor.record();
      const records: Record<string, any>[] = env.usageRecords('opsLoaded');
      expect(records.length).toBe(2);
      expect(records.find(record => record.docId === 'project01')!.opsCount).toBe(2);
      expect(records.find(record => record.docId === 'project02')!.opsCount).toBe(1);
    });

    it('reports the largest single op, so that one huge op is not hidden in the total', async () => {
      const env: TestEnvironment = new TestEnvironment();
      const small: object = { p: ['userPermissions', 'user01'], oi: 'admin' };
      const huge: object = {
        p: ['userPermissions'],
        oi: Object.fromEntries(Array.from({ length: 400 }, (_unused: unknown, index: number) => [index, index]))
      };
      env.monitor.recordOpLoaded('client01', 'sf_projects', 'project01', small);
      env.monitor.recordOpLoaded('client01', 'sf_projects', 'project01', huge);
      env.monitor.recordOpLoaded('client01', 'sf_projects', 'project01', small);
      // SUT
      await env.monitor.record();
      const record: Record<string, any> = env.usageRecords('opsLoaded')[0];
      expect(record.opsCount).toBe(3);
      expect(record.largestOpBytes).toBeGreaterThan(record.opsBytes / 2);
      expect(record.largestOpBytes).toBeLessThan(record.opsBytes);
    });

    it('accumulates nothing when nothing can ask for a report', async () => {
      const env: TestEnvironment = new TestEnvironment({ resourceMonitoringOn: false });
      // SUT
      env.monitor.recordOpLoaded('client01', 'sf_projects', 'project01', { p: ['a'], oi: 1 });
      env.monitor.recordSnapshotRead('client01', 'sf_projects', 'current', [{ data: { a: 1 } }]);
      env.monitor.recordQueryRun('client01', 'sf_projects');
      await env.monitor.record();
      expect(env.usageRecords('opsLoaded').length).toBe(0);
      expect(env.usageRecords('snapshotRead').length).toBe(0);
      expect(env.usageRecords('queryRun').length).toBe(0);
    });

    it('starts the totals again after a report', async () => {
      const env: TestEnvironment = new TestEnvironment();
      env.monitor.recordOpLoaded('client01', 'sf_projects', 'project01', { p: ['a'], oi: 1 });
      await env.monitor.record();
      // SUT
      await env.monitor.record();
      expect(env.usageRecords('opsLoaded').length).toBe(1);
    });
  });

  describe('reportOnAgent', () => {
    it('reports the bytes a web socket has queued but not yet sent', async () => {
      const env: TestEnvironment = new TestEnvironment();
      const stream: FakeStream = TestEnvironment.fakeStream({ bufferedAmount: 4096 });
      env.monitorFakeAgent(stream);
      // SUT
      await env.monitor.record();
      const rows: Record<string, string>[] = env.csvRows('agent-info.csv');
      expect(rows.length).toBe(1);
      expect(rows[0].outboundBufferedBytes).toBe('4096');
    });

    it('reports no buffered bytes for a stream that is not a web socket', async () => {
      const env: TestEnvironment = new TestEnvironment();
      // The streams this server makes for itself and for the dotnet process have no web socket beneath them, so the
      // count of messages waiting in the stream is all there is to report.
      const stream: FakeStream = TestEnvironment.fakeStream({ writableLength: 7 });
      env.monitorFakeAgent(stream);
      // SUT
      await env.monitor.record();
      const rows: Record<string, string>[] = env.csvRows('agent-info.csv');
      expect(rows[0].outboundBufferedBytes).toBe('');
      expect(rows[0].outboundQueuedCount).toBe('7');
    });

    it('counts the documents an agent subscribed to, not the collections holding them', async () => {
      const env: TestEnvironment = new TestEnvironment();
      env.monitorFakeAgent(TestEnvironment.fakeStream(), {
        texts: { 'project01:MRK:1:target': {}, 'project01:MRK:2:target': {} },
        sf_projects: { project01: {} }
      });
      // SUT
      await env.monitor.record();
      const rows: Record<string, string>[] = env.csvRows('agent-info.csv');
      expect(rows[0].subscribedDocsCount).toBe('3');
    });
  });

  describe('monitorAgent', () => {
    // An in-memory stream closed by the client emits only 'end'.
    for (const event of ['end', 'close']) {
      it(`stops monitoring an agent when its stream emits '${event}'`, async () => {
        const env: TestEnvironment = new TestEnvironment();
        const stream: FakeStream = TestEnvironment.fakeStream();
        env.monitorFakeAgent(stream);
        // SUT
        stream.handlers.get(event)!();
        await env.monitor.record();
        expect(env.csvRows('agent-info.csv').length).toBe(0);
      });
    }
  });
});

class MockFsPromises {
  public readonly mkdirCalls: string[] = [];
  /** What was written, in the order it was written, so that a test can read back the report contents. */
  public readonly writes: { path: string; data: string }[] = [];

  /** The paths written to, in order. A file gets one entry per write or append made to it. */
  public get writtenPaths(): string[] {
    return this.writes.map(write => write.path);
  }

  mkdir(p: string, _options?: unknown): Promise<void> {
    this.mkdirCalls.push(p);
    return Promise.resolve();
  }

  writeFile(p: string, data: unknown, _options?: unknown): Promise<void> {
    this.writes.push({ path: p, data: String(data) });
    return Promise.resolve();
  }

  appendFile(p: string, data: unknown, _options?: unknown): Promise<void> {
    this.writes.push({ path: p, data: String(data) });
    return Promise.resolve();
  }
}

class TestEnvironment {
  public readonly monitor: ResourceMonitor;

  constructor({
    SF_RESOURCE_REPORTS_PATH = null,
    XDG_DATA_HOME = null,
    homedir = null,
    resourceMonitoringOn = true
  }: {
    SF_RESOURCE_REPORTS_PATH?: string | null;
    XDG_DATA_HOME?: string | null;
    homedir?: string | null;
    resourceMonitoringOn?: boolean;
  } = {}) {
    if (SF_RESOURCE_REPORTS_PATH == null) delete process.env.SF_RESOURCE_REPORTS_PATH;
    else process.env.SF_RESOURCE_REPORTS_PATH = SF_RESOURCE_REPORTS_PATH;

    if (XDG_DATA_HOME == null) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = XDG_DATA_HOME;

    // What makes reports reachable, and so what turns the measuring on. See ResourceMonitor.enabled.
    if (resourceMonitoringOn) process.env.SF_SIGUSR2_ACTION = 'resourceUsage';
    else delete process.env.SF_SIGUSR2_ACTION;

    mockHomedir = homedir ?? '';

    // Recreate mock
    mockFsPromises = new MockFsPromises();
    // Reset singleton between tests
    (ResourceMonitor as any)._instance = undefined;
    this.monitor = ResourceMonitor.instance;
  }

  /** A stream that records the handlers put on it, so that a test can fire an event itself. */
  public static fakeStream({
    writableLength = 0,
    bufferedAmount = undefined
  }: { writableLength?: number; bufferedAmount?: number } = {}): FakeStream {
    const handlers = new Map<string, () => void>();
    const stream: FakeStream = {
      writableLength: writableLength,
      handlers: handlers,
      once: (event: string, handler: () => void) => {
        handlers.set(event, handler);
      }
    };
    if (bufferedAmount != null) {
      stream.ws = { bufferedAmount: bufferedAmount };
    }
    return stream;
  }

  /** Monitors an agent that has only the fields a report reads, over the given stream. */
  public monitorFakeAgent(stream: FakeStream, subscribedDocs: Record<string, Record<string, unknown>> = {}): void {
    const agent = {
      stream: stream,
      src: null,
      clientId: 'client01',
      connectTime: 0,
      subscribedDocs: subscribedDocs,
      subscribedQueries: {},
      subscribedPresences: {},
      connectSession: undefined
    };
    this.monitor.monitorAgent(agent as unknown as ShareDB.Agent, stream as unknown as Duplex);
  }

  /** The non-empty lines written to the named report file, in the order they were written. */
  private static linesWrittenTo(fileName: string): string[] {
    return mockFsPromises.writes
      .filter(write => write.path.endsWith(fileName))
      .flatMap(write => write.data.split('\n'))
      .filter(line => line.length > 0);
  }

  /** The lines of the given type that were written to resource-usage.jsonl. */
  public usageRecords(type: string): Record<string, any>[] {
    return TestEnvironment.linesWrittenTo('resource-usage.jsonl')
      .map(line => JSON.parse(line))
      .filter(record => record.type === type);
  }

  /** The rows of one of the CSV reports, keyed by column heading. */
  public csvRows(fileName: string): Record<string, string>[] {
    const lines: string[] = TestEnvironment.linesWrittenTo(fileName);
    if (lines.length === 0) return [];
    const headings: string[] = lines[0].split(',');
    return lines.slice(1).map(line => {
      const values: string[] = line.split(',');
      return Object.fromEntries(headings.map((heading, index) => [heading, values[index]]));
    });
  }
}
