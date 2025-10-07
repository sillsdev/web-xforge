import path from 'path';
import { ResourceMonitor } from './resource-monitor';

let mockFsPromises: MockFsPromises;
jest.mock('fs/promises', () => ({
  mkdir: (...args: [string, unknown]) => mockFsPromises.mkdir(...args),
  writeFile: (...args: [string, string, unknown]) => mockFsPromises.writeFile(...args),
  appendFile: (...args: [string, string, unknown]) => mockFsPromises.appendFile(...args)
}));

describe('ResourceMonitor', () => {
  describe('getOutputDir', () => {
    it('prioritizes SF_RESOURCE_REPORTS_PATH', async () => {
      const sfResourceReportsPath: string = `${path.sep}sf-resource-reports-path`;
      const env: TestEnvironment = new TestEnvironment({
        SF_RESOURCE_REPORTS_PATH: sfResourceReportsPath,
        XDG_DATA_HOME: `${path.sep}xdg-data-home`,
        HOME: `${path.sep}home`
      });
      const expectedDir: string = sfResourceReportsPath;
      // SUT
      await env.monitor.record();
      expect(mockFsPromises.writeFileCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.writeFileCalls[0]).toContain(`${expectedDir}${path.sep}heap-info.csv`);
      expect(mockFsPromises.mkdirCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.mkdirCalls).toContain(expectedDir);
    });

    it('uses XDG_DATA_HOME when SF_RESOURCE_REPORTS_PATH is unset', async () => {
      const xdgDataHome = `${path.sep}xdg-data-home`;
      const env = new TestEnvironment({
        SF_RESOURCE_REPORTS_PATH: null,
        XDG_DATA_HOME: xdgDataHome,
        HOME: `${path.sep}home`
      });
      const reportDirName: string = 'sf-resource-reports';
      const expectedDir: string = path.join(xdgDataHome, reportDirName);
      // SUT
      await env.monitor.record();
      expect(mockFsPromises.writeFileCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.writeFileCalls[0]).toContain(`${expectedDir}${path.sep}heap-info.csv`);
      expect(mockFsPromises.mkdirCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.mkdirCalls).toContain(expectedDir);
    });

    it('uses HOME when SF_RESOURCE_REPORTS_PATH and XDG_DATA_HOME are unset', async () => {
      const env = new TestEnvironment({ SF_RESOURCE_REPORTS_PATH: null, XDG_DATA_HOME: null, HOME: `${path.sep}home` });
      const reportDirName: string = 'sf-resource-reports';
      const expectedDir: string = path.join(`${path.sep}home`, '.local', 'share', reportDirName);
      // SUT
      await env.monitor.record();
      expect(mockFsPromises.writeFileCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.writeFileCalls[0]).toContain(`${expectedDir}${path.sep}heap-info.csv`);
      expect(mockFsPromises.mkdirCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.mkdirCalls).toContain(expectedDir);
    });

    it('uses HOME when SF_RESOURCE_REPORTS_PATH is unset and XDG_DATA_HOME is empty', async () => {
      // XDG_DATA_HOME is not used if unset or empty
      // (https://specifications.freedesktop.org/basedir-spec/latest/#variables).
      const env = new TestEnvironment({ SF_RESOURCE_REPORTS_PATH: null, XDG_DATA_HOME: '', HOME: `${path.sep}home` });
      const reportDirName: string = 'sf-resource-reports';
      const expectedDir: string = path.join(`${path.sep}home`, '.local', 'share', reportDirName);
      // SUT
      await env.monitor.record();
      expect(mockFsPromises.writeFileCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.writeFileCalls[0]).toContain(`${expectedDir}${path.sep}heap-info.csv`);
      expect(mockFsPromises.mkdirCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.mkdirCalls).toContain(expectedDir);
    });

    it('uses cwd when HOME, SF_RESOURCE_REPORTS_PATH, and XDG_DATA_HOME are unset', async () => {
      const env = new TestEnvironment({ SF_RESOURCE_REPORTS_PATH: null, XDG_DATA_HOME: null, HOME: null });
      const reportDirName: string = 'sf-resource-reports';
      const expectedDir: string = path.join(process.cwd(), reportDirName);
      // SUT
      await env.monitor.record();
      expect(mockFsPromises.writeFileCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.writeFileCalls[0]).toContain(`${expectedDir}${path.sep}heap-info.csv`);
      expect(mockFsPromises.mkdirCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.mkdirCalls).toContain(expectedDir);
    });
  });
});

class MockFsPromises {
  public readonly mkdirCalls: string[] = [];
  public readonly writeFileCalls: string[] = [];
  public readonly appendFileCalls: string[] = [];

  mkdir(p: string, _options?: unknown): Promise<void> {
    this.mkdirCalls.push(p);
    return Promise.resolve();
  }

  writeFile(p: string, _data: unknown, _options?: unknown): Promise<void> {
    this.writeFileCalls.push(p);
    return Promise.resolve();
  }

  appendFile(p: string, _data: unknown, _options?: unknown): Promise<void> {
    this.appendFileCalls.push(p);
    return Promise.resolve();
  }
}

class TestEnvironment {
  public readonly monitor: ResourceMonitor;

  constructor(values: { SF_RESOURCE_REPORTS_PATH: string | null; XDG_DATA_HOME: string | null; HOME: string | null }) {
    if (values.SF_RESOURCE_REPORTS_PATH == null) delete process.env.SF_RESOURCE_REPORTS_PATH;
    else process.env.SF_RESOURCE_REPORTS_PATH = values.SF_RESOURCE_REPORTS_PATH;

    if (values.XDG_DATA_HOME == null) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = values.XDG_DATA_HOME;

    if (values.HOME == null) delete process.env.HOME;
    else process.env.HOME = values.HOME;

    // Recreate mock
    mockFsPromises = new MockFsPromises();
    // Reset singleton between tests
    (ResourceMonitor as any)._instance = undefined;
    this.monitor = ResourceMonitor.instance;
  }
}
