import { Page } from "npm:playwright";
import { E2E_ROOT_URL, INVITE_LINKS_BY_ROLE, OUTPUT_DIR, Role, runSheet, ScreenshotContext } from "./e2e-globals.mts";
// import locales from "../../locales.json" with { type: "json" };

function cleanText(text: string): string {
  return text
    .trim()
    .replace(/[^ \w]/gi, "")
    .replace(/\s+/g, "_");
}

async function waitForAppLoad(page: Page): Promise<void> {
  await page.waitForTimeout(500);
  await page.waitForSelector(".mat-progress-bar--closed");
  await page.waitForTimeout(1000);
}

export async function screenshot(
  page: Page,
  context: ScreenshotContext,
  options = { overrideScreenshotSkipping: false }
): Promise<void> {
  if (runSheet.skipScreenshots && !options.overrideScreenshotSkipping) return;

  const fileNameParts = [
    context.prefix,
    context.engine,
    context.role,
    context.pageName ?? (await pageName(page)),
    context.locale
  ];
  const fileName = fileNameParts.filter(part => part != null).join("_") + ".png";
  await page.screenshot({ path: `${OUTPUT_DIR}/${fileName}`, fullPage: true });
}

async function pageName(page: Page): Promise<string> {
  // if url is /projects, name is my_projects
  if (page.url() === `${E2E_ROOT_URL}/projects`) {
    return "my_projects";
  }

  const activeNavItem = await page.locator("app-navigation .activated-nav-item, app-navigation .active").first();
  const textContent = await activeNavItem.textContent();
  if (!textContent) throw new Error("No active nav item found");
  return cleanText(textContent);
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

  const name = await pageName(page);
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

export async function joinAsRoleAndTraversePages(
  page: Page,
  context: ScreenshotContext & { role: Role }
): Promise<void> {
  const role = context.role;
  // Go to join page
  await page.goto(INVITE_LINKS_BY_ROLE[context.role]);
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
}

export async function logOut(page: Page) {
  await page.click("button.user-menu-btn");
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await page.click("text=Yes, log out");
  await page.waitForURL(E2E_ROOT_URL);
}
