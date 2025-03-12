import locales from '../../locales.json' with { type: 'json' };
import { BrowserName, UserRole } from './e2e-globals.ts';
import { E2ETestRunLogger } from './e2e-test-run-logger.ts';

export interface TestPreset {
  rootUrl: string;
  browsers: BrowserName[];
  locales: string[];

  outputDir: string;
  skipScreenshots: boolean;
  trace: boolean;
  defaultUserDelay: number;
  showArrow: boolean;
  pauseOnFailure: boolean;
  headless: boolean;
}

export interface ScreenshotContext {
  engine: BrowserName;
  role?: UserRole;
  pageName?: string;
  locale?: string;
}

export const DEFAULT_PROJECT_SHORTNAME = 'Stp22';

const helpLocales = locales
  .filter(l => l.helps != null)
  .map(l => l.tags[0])
  .filter(l => l !== 'en-GB');

export const logger = new E2ETestRunLogger();

const defaultPreset: TestPreset = {
  rootUrl: 'http://localhost:5000',
  locales: ['en'],
  browsers: ['chromium'],
  skipScreenshots: false,
  defaultUserDelay: 500,
  showArrow: true,
  trace: true,
  outputDir: `test_output/${new Date().toISOString().slice(0, 19)}`,
  pauseOnFailure: true,
  headless: false
} as const;

export const presets = {
  default: defaultPreset,
  fast: {
    ...defaultPreset,
    defaultUserDelay: 0
  },
  localization: {
    ...defaultPreset,
    locales: helpLocales,
    showArrow: true
  },
  pre_merge_ci: {
    rootUrl: 'http://localhost:5000',
    locales: ['en'],
    browsers: ['chromium'],
    skipScreenshots: true,
    trace: true,
    pauseOnFailure: false,
    headless: true,
    defaultUserDelay: 0,
    showArrow: true,
    outputDir: `test_output/ci_e2e_test_results`
  }
} as const satisfies { [key: string]: TestPreset };
