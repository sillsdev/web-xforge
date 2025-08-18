import locales from '../../locales.json' with { type: 'json' };
import type { BrowserName, UserRole } from './e2e-globals.ts';
import { E2ETestRunLogger } from './e2e-test-run-logger.ts';
import { Utils } from './e2e-utils.ts';

export interface TestPreset {
  rootUrl: string;
  browsers: BrowserName[];
  locales: string[];

  outputDir: string;
  skipScreenshots: boolean;
  trace: boolean;
  defaultUserDelay: number;
  maxTries?: number;
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
  defaultUserDelay: 0,
  showArrow: true,
  trace: true,
  outputDir: `test_output/${Utils.formatDate(new Date())}`,
  pauseOnFailure: true,
  headless: false
} as const;

export const presets = {
  default: {
    ...defaultPreset
  },
  user_speed: {
    ...defaultPreset,
    defaultUserDelay: 500
  },
  localization: {
    ...defaultPreset,
    locales: helpLocales,
    showArrow: true,
    outputDir: 'test_output/localized_screenshots'
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
    outputDir: 'test_output/ci_e2e_test_results',
    maxTries: 5
  }
} as const satisfies { [key: string]: TestPreset };
