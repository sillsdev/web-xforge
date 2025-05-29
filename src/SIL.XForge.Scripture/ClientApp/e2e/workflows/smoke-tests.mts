import { Page } from "npm:playwright";
import { expect } from "npm:playwright/test";
import locales from "../../../locales.json" with { type: "json" };
import { DEFAULT_PROJECT_SHORTNAME, preset, ptUsersByRole, ScreenshotContext, UserRole } from "../e2e-globals.ts";
import {
  createShareLinksAsAdmin,
  ensureJoinedOrConnectedToProject,
  installMouseFollower,
  logInAsPTUser,
  logOut,
  pageName,
  screenshot,
  waitForAppLoad
} from "../e2e-utils.ts";
import secrets from "../secrets.json" with { type: "json" };

// Note: This is one of the first e2e tests written, and therefore may not follow best practices.

export async function runSmokeTests(page: Page, screenshotContext: ScreenshotContext) {
  for (const [role, credentials] of Object.entries(ptUsersByRole)) {
    await joinAsUserAndTraversePages(page, credentials, { ...screenshotContext, role: role as UserRole });
  }

  await logInAsPTUser(page, secrets.users[0]);
  await ensureJoinedOrConnectedToProject(page, DEFAULT_PROJECT_SHORTNAME);
  const shareLinks = await createShareLinksAsAdmin(page, DEFAULT_PROJECT_SHORTNAME);
  await logOut(page);
  for (const [roleName, link] of Object.entries(shareLinks)) {
    console.log(`Joining as ${roleName}`);
    // FIXME Invalid assertion; we're using the display names of roles instead of the actual role keys
    const role = roleName as UserRole;
    await joinWithLinkAndTraversePages(page, link, { ...screenshotContext, role });
  }
}

async function screenshotLanguages(page: Page, context: ScreenshotContext): Promise<void> {
  if (preset.skipScreenshots) return;
  if (preset.locales.length === 1 && preset.locales[0] === "en") {
    await screenshot(page, { ...context, locale: "en" });
    return;
  }

  const name = context.pageName ?? (await pageName(page));
  const changeLanguageButton = await page.locator("header button").first();

  for (let i = 0; i < preset.locales.length; i++) {
    const localeCode = preset.locales[i];
    const locale = locales.find(l => l.tags[0] === localeCode);
    if (locale == null) throw new Error(`Locale not found for code: ${localeCode}`);

    if (i !== 0) {
      await changeLanguageButton.click();
      await page.getByRole("menuitem", { name: locale.localName }).click();
      await page.waitForTimeout(300);
    }
    await screenshot(page, { ...context, pageName: name, locale: localeCode });
  }

  await changeLanguageButton.click();
  await page.getByRole("menuitem", { name: locales[0].localName }).click();
}

export async function traverseHomePageAndLoginPage(page: Page, context: ScreenshotContext): Promise<void> {
  // Home page
  await page.goto(preset.rootUrl);
  await screenshot(page, { pageName: "home_page", ...context });

  // Log in
  await page.getByRole("link", { name: "Log in" }).click();
  await expect(page.getByText("Log in with Paratext")).toBeVisible({ timeout: 10_000 });
  await screenshot(page, { pageName: "login_page", ...context });

  // Log in with Paratext
  await page.locator("a").filter({ hasText: "Log in with Paratext" }).click();
  await expect(page.getByText("Sign in with your Paratext Registry account")).toBeVisible();
  await page.fill("input[name=email]", "user@example.com");
  await page.click("#login-form button[type=submit]");
  await screenshot(page, { pageName: "registry_login_page", ...context });
}

export async function joinAsUserAndTraversePages(
  page: Page,
  user: { email: string; password: string },
  context: ScreenshotContext
): Promise<void> {
  console.log(`Logging in as ${user.email} for ${context.role}`);
  const pageName = "my_projects_" + user.email.split("@")[0].split("+")[1];
  await logInAsPTUser(page, { email: user.email, password: user.password });

  await page.waitForURL(/\/projects/);
  await ensureJoinedOrConnectedToProject(page, DEFAULT_PROJECT_SHORTNAME);

  // If we aren't redirected when joining the project, click the project button
  // It seems like maybe we only sometimes redirect on joining
  if (await page.getByRole("button", { name: DEFAULT_PROJECT_SHORTNAME }).isVisible()) {
    await page.getByRole("button", { name: DEFAULT_PROJECT_SHORTNAME }).click();
  }

  await page.waitForURL(/\/projects\/[a-z0-9]+/);
  await screenshot(page, { ...context, pageName });

  if (preset.showArrow) await installMouseFollower(page);

  await traversePagesInMainNav(page, context);
  await logOut(page);
}

async function traversePagesInMainNav(page: Page, context: ScreenshotContext) {
  await page.waitForSelector("app-navigation");
  const links = await page.locator("app-navigation a").all();
  for (const link of links) {
    await link.click();
    await waitForAppLoad(page);
    await screenshotLanguages(page, { ...context });
  }
}

export async function joinWithLinkAndTraversePages(
  page: Page,
  link: string,
  context: ScreenshotContext & { role: UserRole }
): Promise<void> {
  // TODO replace the following with joinWithLink
  const role = context.role;
  // Go to join page
  await page.goto(link);
  await page.focus("input");
  await page.waitForTimeout(500);
  await page.fill("input", `${role} test user`);
  await waitForAppLoad(page);
  await screenshot(page, { ...context, pageName: "join_page" });
  await page.getByRole("button", { name: "Join" }).click();

  // Check out all main pages
  // FIXME(application-bug) This can fail with "Cannot read properties of undefined (reading 'sites')"
  await page.waitForSelector("app-navigation");
  const links = await page.locator("app-navigation a").all();
  for (const link of links) {
    await link.click();
    await waitForAppLoad(page);
    await screenshotLanguages(page, context);
  }

  // Check out the projects page
  await page.click("#sf-logo-button");
  await waitForAppLoad(page);
  await screenshotLanguages(page, context);

  await logOut(page);
}
