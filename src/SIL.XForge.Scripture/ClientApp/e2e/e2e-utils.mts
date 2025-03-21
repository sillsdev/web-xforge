import { Page } from "npm:playwright";
import { DEFAULT_PROJECT_SHORTNAME, E2E_ROOT_URL, OUTPUT_DIR, runSheet, ScreenshotContext } from "./e2e-globals.mts";
import { logInAsPTUser } from "./pt_login.mts";

function cleanText(text: string): string {
  return text
    .trim()
    .replace(/[^ \w]/gi, "")
    .replace(/\s+/g, "_");
}

export async function pageName(page: Page): Promise<string> {
  // if url is /projects, name is my_projects
  if (page.url() === `${E2E_ROOT_URL}/projects`) {
    return "my_projects";
  }

  const activeNavItem = await page.locator("app-navigation .activated-nav-item, app-navigation .active").first();
  const textContent = await activeNavItem.textContent();
  if (!textContent) throw new Error("No active nav item found");
  return cleanText(textContent);
}

export async function ensureJoinedProject(page: Page, shortName: string): Promise<void> {
  await Promise.race([
    page.waitForSelector(`.user-unconnected-project:has-text("${shortName}")`),
    page.waitForSelector(`.user-connected-project:has-text("${shortName}")`)
  ]);

  if ((await page.locator(`.user-connected-project:has-text("${shortName}")`).count()) === 1) return;

  const project = await page.locator(`.user-unconnected-project:has-text("${shortName}")`);
  await project.getByRole("button", { name: "Join" }).click();
}

export async function screenshot(
  page: Page,
  context: ScreenshotContext,
  options = { overrideScreenshotSkipping: false }
): Promise<void> {
  if (runSheet.skipScreenshots && !options.overrideScreenshotSkipping) return;

  const fileNameParts = [context.engine, context.role, context.pageName ?? (await pageName(page)), context.locale];
  const fileName = fileNameParts.filter(part => part != null).join("_") + ".png";
  await page.screenshot({ path: `${OUTPUT_DIR}/${context.prefix}/${fileName}`, fullPage: true });
}

export async function createShareLinksAsAdmin(page: Page, user: { email: string; password: string }) {
  await logInAsPTUser(page, user);
  await ensureJoinedProject(page, DEFAULT_PROJECT_SHORTNAME);
  await ensureNavigatedToProject(page, DEFAULT_PROJECT_SHORTNAME);
  await page.getByRole("link", { name: "Users" }).click();
  await page.getByRole("button", { name: "Share" }).click();

  await page.getByTitle("Change invitation language").click();
  await page.getByRole("option", { name: "English (US)" }).click();
  await page.getByTitle("Change invitation role").click();
  await page.getByRole("option", { name: "Commenter View translation •" }).click();
  await page.getByRole("button", { name: "Copy link" }).click();

  const clipboardText = await page.evaluate("navigator.clipboard.readText()");
  console.log("Copied link to clipboard:", clipboardText);

  await page.getByTitle("Change invitation role").click();
  await page.getByRole("option", { name: "Community Checker Answer" }).click();
  await page.getByRole("button", { name: "Copy link" }).click();
  await page.getByTitle("Change invitation role").click();
  await page.getByRole("option", { name: "Viewer View translation •" }).click();
  await page.getByRole("button", { name: "Copy link" }).click();
  await page.getByRole("heading", { name: "Share SF 2022 test project" }).getByRole("button").click();
}

/**
 * Checks whether the project is already open. If not, navigates to the my projects page (if not already on it) and
 * clicks on the project.
 */
export async function ensureNavigatedToProject(page: Page, shortName: string) {
  const shortNameOnPage = await (await page.locator("header .project-short-name").all())[0]?.textContent();
  if (shortNameOnPage === shortName) return;

  if (new URL(await page.url()).pathname !== "/projects") {
    await page.click("#sf-logo-button");
  }

  await page.getByRole("button", { name: shortName }).click();
  await page.waitForURL(url => /\/projects\/[a-z0-9]+/.test(url.pathname));
}
