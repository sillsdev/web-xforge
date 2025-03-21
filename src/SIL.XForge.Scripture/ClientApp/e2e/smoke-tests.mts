import { Page } from "npm:playwright";
import {
  DEFAULT_PROJECT_SHORTNAME,
  E2E_ROOT_URL,
  OUTPUT_DIR,
  runSheet,
  ScreenshotContext,
  UserRole
} from "./e2e-globals.mts";
import { ensureJoinedProject, pageName, screenshot } from "./e2e-utils.mts";
import { logInAsPTUser } from "./pt_login.mts";
// import locales from "../../locales.json" with { type: "json" };

async function waitForAppLoad(page: Page): Promise<void> {
  // FIXME this is hideous
  await page.waitForTimeout(500);
  await page.waitForSelector(".mat-progress-bar--closed");
  await page.waitForTimeout(1000);
}

async function screenshotLanguages(page: Page, context: ScreenshotContext): Promise<void> {
  if (runSheet.skipScreenshots) return;
  if (runSheet.locales.length === 1 && runSheet.locales[0] === "en") {
    await screenshot(page, { ...context, locale: "en" });
    return;
  }

  const changeLanguageButton = await page.locator("header button").first();
  await changeLanguageButton.click();

  const menu = await page.getByRole("menu");
  let items = await menu.getByRole("menuitem").all();

  const name = context.pageName ?? (await pageName(page));
  for (let i = 0; i < items.length; i++) {
    if (i !== 0) await changeLanguageButton.click();
    items = await menu.getByRole("menuitem").all();
    const localeCode = await items[i].getAttribute("data-locale");
    await items[i].click();
    await waitForAppLoad(page);
    if (localeCode == null) throw new Error("No data-locale attribute found on menu item");
    await screenshot(page, { ...context, pageName: name, locale: localeCode });
  }

  await changeLanguageButton.click();
  await items[0].click();
}

export async function traverseHomePageAndLoginPage(page: Page): Promise<void> {
  // Home page
  await page.goto(E2E_ROOT_URL);
  await page.screenshot({ path: `${OUTPUT_DIR}/home_page.png`, fullPage: true });

  // Log in
  await page.click("text=Log in");
  await page.waitForSelector("text=Log in with paratext");
  await page.screenshot({ path: `${OUTPUT_DIR}/login_page.png`, fullPage: true });

  // Log in with Paratext
  await page.click("text=Log in with paratext");
  await page.waitForSelector("text=sign in with your Paratext Registry account");
  await page.fill("input[name=email]", "user@example.com");
  await page.click("#login-form button[type=submit]");
  await page.screenshot({ path: `${OUTPUT_DIR}/registry_login_page.png`, fullPage: true });
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
  await ensureJoinedProject(page, DEFAULT_PROJECT_SHORTNAME);

  // If we aren't redirected when joining the project, click the project button
  // It seems like maybe we only sometimes redirect on joining
  if (await page.getByRole("button", { name: DEFAULT_PROJECT_SHORTNAME }).isVisible()) {
    await page.getByRole("button", { name: DEFAULT_PROJECT_SHORTNAME }).click();
  }

  await page.waitForURL(/\/projects\/[a-z0-9]+/);
  await screenshot(page, { ...context, pageName });

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

export async function logOut_old(page: Page) {
  await page.click("button.user-menu-btn");
  await page.getByRole("menuitem", { name: "Log out" }).click();
  // TODO for transparent auth, we need to click "yes, log out"
  await page.waitForURL(E2E_ROOT_URL);
}

export async function logOut(page: Page) {
  await page.getByRole("button", { name: "User" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  if (await page.getByRole("button", { name: "Yes, log out" }).isVisible()) {
    await page.getByRole("button", { name: "Yes, log out" }).click();
  }
  await page.waitForURL(E2E_ROOT_URL);
}
