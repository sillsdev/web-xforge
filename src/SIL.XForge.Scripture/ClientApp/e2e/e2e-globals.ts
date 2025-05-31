import { E2ETestRunLogger } from './e2e-test-run-logger.ts';
import { presets, TestPreset } from './presets.ts';
import secrets from './secrets.json' with { type: 'json' };

const _allBrowsers = ['chromium', 'firefox', 'webkit'] as const;
export type BrowserName = (typeof _allBrowsers)[number];
export const allRoles = [
  'pt_administrator',
  'pt_translator',
  'pt_consultant',
  'pt_observer',
  'community_checker',
  'commenter',
  'viewer'
] as const;
export type UserRole = (typeof allRoles)[number];

export const E2E_SYNC_DEFAULT_TIMEOUT = 60_000;

export interface ScreenshotContext {
  engine: BrowserName;
  role?: UserRole;
  pageName?: string;
  locale?: string;
}

// TODO Create a separate project for each test
export const DEFAULT_PROJECT_SHORTNAME = 'Stp22';
export const CHECKING_PROJECT_NAME = 'SEEC2';

export const logger = new E2ETestRunLogger();

console.log(Deno.args);
function getPreset(): TestPreset {
  const presetName = Deno.args[0] ?? 'default';
  const availablePresets = Object.keys(presets);
  if (!availablePresets.includes(presetName)) {
    console.error(`Usage: ./e2e.mts <preset> <test1> <test2> ...`);
    throw new Error(`Invalid preset "${presetName}". Available presets: ${availablePresets.join(', ')}`);
  }
  const preset = (presets as any)[presetName];
  console.log(`Using preset: ${presetName}`);
  console.log(preset);
  return preset;
}

export const preset = getPreset();

export const ptUsersByRole = {
  [allRoles[0]]: secrets.users[0],
  [allRoles[1]]: secrets.users[1],
  [allRoles[2]]: secrets.users[2],
  [allRoles[3]]: secrets.users[3]
} as const;
