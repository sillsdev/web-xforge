#!/usr/bin/env -S deno run --allow-run --allow-env --allow-sys --allow-read --allow-write e2e.mts
import { chromium, firefox, Page, webkit } from "npm:playwright";
import locales from "../../locales.json" with { type: "json" };

const ROOT_URL = "http://localhost:5000";
const OUTPUT_DIR = "screenshots";

const INVITE_LINKS_BY_ROLE = {
  community_checker: "http://localhost:5000/join/wI7bo_9KMNEJvei_/en",
  commenter: "http://localhost:5000/join/oQXTnZw3q5pvNjqd/en",
  viewer: "http://localhost:5000/join/6izPkk82Vkwpgozq/en"
};

const allApplicationScopes = ["home_and_login", "main_application"] as const;
type ApplicationScope = (typeof allApplicationScopes)[number];
const allBrowsers = ["chromium", "firefox", "webkit"] as const;
type Browser = (typeof allBrowsers)[number];
const allRoles = ["community_checker", "commenter", "viewer"] as const;
type Role = (typeof allRoles)[number];

type RunSheet = {
  locales: string[];
  roles: Role[];
  applicationScopes: ApplicationScope[];
  browsers: Browser[];
  screenshots: boolean;
  screenshotPrefix: string;
};

function cleanText(text: string): string {
  return text
    .trim()
    .replace(/[^ \w]/gi, "")
    .replace(/\s+/g, "_");
}

const runSheet: RunSheet = {
  locales: locales.map(locale => locale.tags[0]),
  roles: allRoles.slice(),
  applicationScopes: allApplicationScopes.slice(),
  browsers: allBrowsers.slice(),
  screenshots: true,
  screenshotPrefix: new Date().toISOString().slice(0, 19) + "_"
} as const;

async function waitForAppLoad(page: Page): Promise<void> {
  await page.waitForTimeout(500);
  await page.waitForSelector(".mat-progress-bar--closed");
  await page.waitForTimeout(1000);
}

async function screenshot(page: Page, name: string): Promise<void> {
  if (!runSheet.screenshots) return;
  await page.screenshot({ path: `${OUTPUT_DIR}/${runSheet.screenshotPrefix}${name}.png`, fullPage: true });
}

async function pageName(page: Page): Promise<string> {
  // if url is /projects, name is my_projects
  if (page.url() === `${ROOT_URL}/projects`) {
    return "my_projects";
  }

  const activeNavItem = await page.locator("app-navigation .activated-nav-item, app-navigation .active").first();
  const textContent = await activeNavItem.textContent();
  if (!textContent) throw new Error("No active nav item found");
  return cleanText(textContent);
}

async function screenshotLanguages(page: Page, prependText: string): Promise<void> {
  if (!runSheet.screenshots) return;
  if (runSheet.locales.length === 1 && runSheet.locales[0] === "en") {
    await screenshot(page, `${runSheet.locales[0]}_${prependText}_${await pageName(page)}`);
    return;
  }

  const changeLanguageButton = await page.locator("header button").first();
  await changeLanguageButton.click();

  const menu = await page.getByRole("menu");
  let items = await menu.getByRole("menuitem").all();

  for (let i = 0; i < items.length; i++) {
    if (i !== 0) await changeLanguageButton.click();
    items = await menu.getByRole("menuitem").all();
    const localeCode = await items[i].getAttribute("data-locale");
    await items[i].click();
    await waitForAppLoad(page);
    const name = await pageName(page);
    await screenshot(page, `${localeCode}_${prependText}_${name}`);
  }

  await changeLanguageButton.click();
  await items[0].click();
}

async function traverseHomePageAndLoginPage(page: Page): Promise<void> {
  // Home page
  await page.goto(ROOT_URL);
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

async function joinAsRoleAndTraversePages(page: Page, role: Role): Promise<void> {
  // Go to join page
  await page.goto(INVITE_LINKS_BY_ROLE[role]);
  await page.focus("input");
  await page.waitForTimeout(500);
  await page.fill("input", `${role} test user`);
  await waitForAppLoad(page);
  await screenshot(page, `${role}_join_page`);
  await page.getByRole("button", { name: "Join" }).click();

  // Check out all main pages
  await page.waitForSelector("app-navigation");
  const links = await page.locator("app-navigation a").all();
  for (const link of links) {
    await link.click();
    await waitForAppLoad(page);
    await screenshotLanguages(page, role);
  }

  // Check out the projects page
  await page.click("#sf-logo-button");
  await waitForAppLoad(page);
  await screenshotLanguages(page, role);

  // Log out
  await page.click("button.user-menu-btn");
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await page.click("text=Yes, log out");
  await page.waitForURL(ROOT_URL);
}

(async () => {
  const availableEngines = { chromium, firefox, webkit };
  for (const engineName of runSheet.browsers) {
    console.log(`Running tests in ${engineName}`);
    const engine = availableEngines[engineName];
    const browser = await engine.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    if (runSheet.applicationScopes.includes("home_and_login")) await traverseHomePageAndLoginPage(page);

    if (runSheet.applicationScopes.includes("main_application")) {
      for (const role of runSheet.roles) {
        await joinAsRoleAndTraversePages(page, role);
      }
    }

    // Teardown
    await context.close();
    await browser.close();
  }
})();
