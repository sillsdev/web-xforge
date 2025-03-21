import { Page } from "npm:playwright";
import { E2E_ROOT_URL, OUTPUT_DIR, runSheet, ScreenshotContext } from "./e2e-globals.mts";

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
  if (await page.locator(`.user-connected-project:has-text("${shortName}")`).isVisible()) return;

  const project = await page.locator(`.user-unconnected-project:has-text("${shortName}")`);
  await project.locator("button:has-text('Join')").click();
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
