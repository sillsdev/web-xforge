import path from 'path';
import { ResourceMonitor } from './resource-monitor';

let mockFsPromises: MockFsPromises;
jest.mock('fs/promises', () => ({
  mkdir: (...args: [string, unknown]) => mockFsPromises.mkdir(...args),
  writeFile: (...args: [string, string, unknown]) => mockFsPromises.writeFile(...args),
  appendFile: (...args: [string, string, unknown]) => mockFsPromises.appendFile(...args)
}));

let mockHomedir: string = '';
jest.mock('os', () => ({ ...jest.requireActual('os'), homedir: () => mockHomedir }));

describe('ResourceMonitor', () => {
  describe('getOutputDir', () => {
    function expectWriteCallsForBaseDir(expectedDir: string): void {
      expect(mockFsPromises.writeFileCalls.length).toBeGreaterThan(0);
      expect(mockFsPromises.writeFileCalls[0]).toContain(`${expectedDir}${path.sep}heap-info.csv`);
      expect(mockFsPromises.writeFileCalls).toContain(`${expectedDir}${path.sep}heap-space-info.csv`);
      for (const filePath of mockFsPromises.writeFileCalls) {
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

  constructor(values: {
    SF_RESOURCE_REPORTS_PATH: string | null;
    XDG_DATA_HOME: string | null;
    homedir: string | null;
  }) {
    if (values.SF_RESOURCE_REPORTS_PATH == null) delete process.env.SF_RESOURCE_REPORTS_PATH;
    else process.env.SF_RESOURCE_REPORTS_PATH = values.SF_RESOURCE_REPORTS_PATH;

    if (values.XDG_DATA_HOME == null) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = values.XDG_DATA_HOME;

    mockHomedir = values.homedir ?? '';

    // Recreate mock
    mockFsPromises = new MockFsPromises();
    // Reset singleton between tests
    (ResourceMonitor as any)._instance = undefined;
    this.monitor = ResourceMonitor.instance;
  }
}
