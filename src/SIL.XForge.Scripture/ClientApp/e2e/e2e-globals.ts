import { E2ETestRunLogger } from './e2e-test-run-logger';

export const E2E_ROOT_URL = 'http://localhost:5000';
export const OUTPUT_DIR = 'screenshots';

const allApplicationScopes = ['home_and_login', 'main_application'] as const;
type ApplicationScope = (typeof allApplicationScopes)[number];
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

type RunSheet = {
  locales: string[];
  roles: UserRole[];
  applicationScopes: ApplicationScope[];
  browsers: Browser[];
  skipScreenshots: boolean;
  screenshotPrefix: string;
};

export type ScreenshotContext = {
  prefix: string;
  engine: Browser;
  role?: UserRole;
  pageName?: string;
  locale?: string;
};

export const runSheet: RunSheet = {
  locales: ['en'],
  roles: allRoles.slice(),
  applicationScopes: ['main_application'],
  browsers: ['chromium'],
  skipScreenshots: false,
  screenshotPrefix: new Date().toISOString().slice(0, 19)
} as const;

export const DEFAULT_PROJECT_SHORTNAME = 'Stp22';

export const logger = new E2ETestRunLogger();
