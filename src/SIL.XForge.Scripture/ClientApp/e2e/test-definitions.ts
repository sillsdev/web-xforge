import { BrowserType, Page } from 'npm:playwright';
import { ScreenshotContext } from './e2e-globals.ts';
import secrets from './secrets.json' with { type: 'json' };
import { communityChecking } from './workflows/community-checking.ts';
import { generateDraft } from './workflows/generate-draft.ts';
import { localizedScreenshots } from './workflows/localized-screenshots.ts';
import { runSmokeTests, traverseHomePageAndLoginPage } from './workflows/smoke-tests.mts';

export const tests = {
  home_and_login: async (_engine: BrowserType, page: Page, screenshotContext: ScreenshotContext) => {
    await traverseHomePageAndLoginPage(page, screenshotContext);
  },
  localized_screenshots: async (_engine: BrowserType, page: Page, screenshotContext: ScreenshotContext) => {
    await localizedScreenshots(page, screenshotContext, secrets.users[0]);
  },
  community_checking: async (engine: BrowserType, page: Page, screenshotContext: ScreenshotContext) => {
    await communityChecking(page, engine, screenshotContext, secrets.users[0]);
  },
  smoke_tests: async (_engine: BrowserType, page: Page, screenshotContext: ScreenshotContext) => {
    await runSmokeTests(page, screenshotContext);
  },
  generate_draft: async (_engine: BrowserType, page: Page, screenshotContext: ScreenshotContext) => {
    await generateDraft(page, screenshotContext, secrets.users[0]);
  }
} as const;
