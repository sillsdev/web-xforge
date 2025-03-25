import { E2ETestRunLogger } from './e2e-test-run-logger.ts';

export const E2E_ROOT_URL = 'http://localhost:5000';
export const OUTPUT_DIR = 'screenshots';

const testScopes = ['home_and_login', 'main_application', 'generate_draft'] as const;
type TestScope = (typeof testScopes)[number];
const allBrowsers = ['chromium', 'firefox', 'webkit'] as const;
type Browser = (typeof allBrowsers)[number];
const allRoles = [
  'pt_administrator',
  'pt_translator',
  'pt_consultant',
  'pt_observer',
  'community_checker',
  'commenter',
  'viewer'
] as const;
export type UserRole = (typeof allRoles)[number];

interface RunSheet {
  locales: string[];
  roles: UserRole[];
  applicationScopes: TestScope[];
  browsers: Browser[];
  skipScreenshots: boolean;
  screenshotPrefix: string;
}

export interface ScreenshotContext {
  prefix: string;
  engine: Browser;
  role?: UserRole;
  pageName?: string;
  locale?: string;
}

export const runSheet: RunSheet = {
  locales: ['en'],
  roles: allRoles.slice(),
  applicationScopes: testScopes.slice(),
  browsers: ['chromium'],
  skipScreenshots: false,
  screenshotPrefix: new Date().toISOString().slice(0, 19)
} as const;

export const DEFAULT_PROJECT_SHORTNAME = 'Stp22';

export const logger = new E2ETestRunLogger();
