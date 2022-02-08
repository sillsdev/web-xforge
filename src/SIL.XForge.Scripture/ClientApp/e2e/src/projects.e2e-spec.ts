import { test, expect, Page, chromium } from '@playwright/test';
import { StartPage } from '../../src/app/start/start.e2e-pom';
import checkingEnData from '../../src/assets/i18n/checking_en.json';
import { environment } from '../../src/environments/environment';
import { Auth0Page } from './pages/auth0.e2e-pom';

test.describe('Projects page', () => {
  let env: TestEnvironment;

  test.beforeAll(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    env = new TestEnvironment(page);
    await page.goto(TestEnvironment.url);
    await page.waitForLoadState('networkidle');
    if (page.url() !== TestEnvironment.url) {
      await expect(page.url()).toContain(environment.authDomain);
      await expect(env.auth0Page.tabs.login.emailInput).toBeVisible();
      await expect(env.auth0Page.tabs.login.passwordInput).toBeVisible();
      await env.auth0Page.tabs.login.emailInput.fill(process.env.AUTH0_USERNAME ?? '');
      await env.auth0Page.tabs.login.passwordInput.fill(process.env.AUTH0_PASSWORD ?? '');
      await Promise.all([page.waitForNavigation(), env.auth0Page.tabs.login.passwordInput.press('Enter')]);
      await expect(page.url()).toContain(TestEnvironment.url);
      await expect(page).toHaveTitle(environment.siteName);
    }
  });

  test.beforeEach(async () => {
    if (env.page.url() !== TestEnvironment.url) {
      await env.page.goto(TestEnvironment.url);
    }
  });

  test('should be logged in and not connected to any project', async () => {
    await expect(env.startPage.header.titleBar).toBeVisible();
    await expect(env.startPage.header.titleBar).toContainText(environment.siteName);
    await expect(env.startPage.paragraphDescription).toBeVisible();
    await expect(env.startPage.paragraphDescription).toHaveText(env.i18n.en.start.not_connected_to_any_projects);
  });
});

class TestEnvironment {
  static url = environment.masterUrl + '/projects';

  auth0Page = new Auth0Page(this.page);
  startPage = new StartPage(this.page);

  i18n = {
    en: checkingEnData
  };

  constructor(readonly page: Page) {}
}
