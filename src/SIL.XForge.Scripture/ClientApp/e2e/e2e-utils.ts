import { Locator, Page } from 'npm:playwright';
import {
  DEFAULT_PROJECT_SHORTNAME,
  E2E_ROOT_URL,
  logger,
  OUTPUT_DIR,
  runSheet,
  ScreenshotContext
} from './e2e-globals.ts';
import { logInAsPTUser } from './pt-login.ts';

function cleanText(text: string): string {
  return text
    .trim()
    .replace(/[^ \w]/gi, '')
    .replace(/\s+/g, '_');
}

export async function pageName(page: Page): Promise<string> {
  // if url is /projects, name is my_projects
  if (page.url() === `${E2E_ROOT_URL}/projects`) {
    return 'my_projects';
  }

  const activeNavItem = await page.locator('app-navigation .activated-nav-item, app-navigation .active').first();
  let textContent = await activeNavItem.textContent();
  if (!textContent) throw new Error('No active nav item found');

  // Remove the mat-icon name from the text content
  const matIconText = await activeNavItem.locator('mat-icon').textContent();
  if (matIconText != null && textContent?.startsWith(matIconText)) {
    textContent = textContent.slice(matIconText.length).trim();
  }

  return cleanText(textContent.toLowerCase());
}

export async function isProjectJoined(page: Page, shortName: string): Promise<boolean> {
  if ((await getShortNameOnPage(page)) === shortName) return true;

  await ensureOnMyProjectsPage(page);

  await Promise.race([
    page.waitForSelector(`.user-unconnected-project:has-text("${shortName}")`),
    page.waitForSelector(`.user-connected-project:has-text("${shortName}")`)
  ]);

  return (await page.locator(`.user-connected-project:has-text("${shortName}")`).count()) === 1;
}

export async function ensureOnMyProjectsPage(page: Page): Promise<void> {
  if (new URL(await page.url()).pathname !== '/projects') {
    console.log('clicking sf logo button');
    await page.click('#sf-logo-button');
  }
  await page.waitForURL(url => url.pathname === '/projects');
}

export async function ensureJoinedOrConnectedToProject(page: Page, shortName: string): Promise<void> {
  // Wait for the project to be listed as connected or not connected
  await Promise.race([
    page.waitForSelector(`.user-unconnected-project:has-text("${shortName}")`),
    page.waitForSelector(`.user-connected-project:has-text("${shortName}")`)
  ]);

  // If already connected, return
  if ((await page.locator(`.user-connected-project:has-text("${shortName}")`).count()) === 1) return;

  // If not connected, click on the Connect or Join
  const project = await page.locator(`.user-unconnected-project:has-text("${shortName}")`);

  if (await project.getByRole('button', { name: 'Join' }).isVisible()) {
    await project.getByRole('button', { name: 'Join' }).click();
  } else if (await project.getByRole('link', { name: 'Connect' }).isVisible()) {
    await project.getByRole('link', { name: 'Connect' }).click();
    await page.waitForURL(url => /^\/connect-project/.test(url.pathname));
    await page.getByRole('button', { name: 'Connect' }).click();
  } else {
    throw new Error('Neither Join nor Connect button found');
  }

  await page.waitForURL(url => /\/projects\/[a-z0-9]+/.test(url.pathname));
}

export async function screenshot(
  page: Page,
  context: ScreenshotContext,
  options = { overrideScreenshotSkipping: false }
): Promise<void> {
  if (runSheet.skipScreenshots && !options.overrideScreenshotSkipping) return;

  const fileNameParts = [context.engine, context.role, context.pageName ?? (await pageName(page)), context.locale];
  const fileName = fileNameParts.filter(part => part != null).join('_') + '.png';
  await page.screenshot({ path: `${OUTPUT_DIR}/${fileName}`, fullPage: true });
  logger.logScreenshot(fileName, context);
}

export async function createShareLinksAsAdmin(
  page: Page,
  user: { email: string; password: string }
): Promise<{
  [role: string]: string;
}> {
  await logInAsPTUser(page, user);
  await ensureJoinedOrConnectedToProject(page, DEFAULT_PROJECT_SHORTNAME);
  await ensureNavigatedToProject(page, DEFAULT_PROJECT_SHORTNAME);
  await page.getByRole('link', { name: 'Users' }).click();
  await page.getByRole('button', { name: 'Share' }).click();

  await page.getByTitle('Change invitation language').click();
  await page.getByRole('option', { name: 'English (US)' }).click();

  const roleToLink: { [role: string]: string } = {};

  let optionCount = Number.POSITIVE_INFINITY;
  for (let i = 0; i < optionCount; i++) {
    await page.getByTitle('Change invitation role').click();
    const options = await page.getByRole('option').all();
    optionCount = options.length;

    const option = options[i];
    const optionText = await option.locator('.role-name').textContent();
    if (optionText == null) throw new Error('Role name not found');
    await option.click();
    await page.getByRole('button', { name: 'Copy link' }).click();
    const clipboardText = await page.evaluate('navigator.clipboard.readText()');
    if (typeof clipboardText !== 'string' || clipboardText === '') {
      throw new Error('Clipboard text not found');
    }
    roleToLink[optionText] = clipboardText;
  }
  await page.getByRole('heading', { name: 'Share SF 2022 test project' }).getByRole('button').click();

  return roleToLink;
}

async function getShortNameOnPage(page: Page): Promise<string | null> {
  return await (await page.locator('header .project-short-name').all())[0]?.textContent();
}

/**
 * Checks whether the project is already open. If not, navigates to the my projects page (if not already on it) and
 * clicks on the project.
 */
export async function ensureNavigatedToProject(page: Page, shortName: string): Promise<void> {
  const shortNameOnPage = await (await page.locator('header .project-short-name').all())[0]?.textContent();
  if (shortNameOnPage === shortName) return;

  await ensureOnMyProjectsPage(page);

  await page.getByRole('button', { name: shortName }).click();
  await page.waitForURL(url => /\/projects\/[a-z0-9]+/.test(url.pathname));
}

export async function deleteProject(page: Page, shortName: string): Promise<void> {
  await ensureNavigatedToProject(page, shortName);

  await page.getByRole('link', { name: 'Settings' }).click();

  // FIXME Timeout is needed to prevent permission error reading text during deletion
  await page.waitForTimeout(5_000);

  // Open the dialog
  await page.getByRole('button', { name: 'Delete this project' }).click();
  // const paragraph = await page.getByRole('paragraph', { name: /This will permanently delete the/ });
  const paragraph = await page.getByText('This action cannot be undone');
  const projectName = (await paragraph.textContent())?.match(/delete the (.*) project/)?.[1];
  console.log(projectName);
  if (projectName == null) throw new Error('Project name not found');
  await page.getByRole('textbox', { name: 'Project Name' }).click();
  await page.getByRole('textbox', { name: 'Project Name' }).click();
  if (projectName == null) throw new Error('Project name not found');
  await page.getByRole('textbox', { name: 'Project name' }).fill(projectName);
  await page.getByRole('button', { name: 'Delete this project' }).click();

  // Wait for the project to be fully deleted and user redirected to my projects page
  await page.waitForURL(url => /\/projects\/?$/.test(url.pathname));
}

export async function enableFeatureFlag(page: Page, flag: string): Promise<void> {
  await enableDeveloperMode(page);
  await page.getByRole('menuitem', { name: 'Developer settings' }).click();
  await page.getByRole('checkbox', { name: flag }).check();
  await page.keyboard.press('Escape');
}

export async function enableDeveloperMode(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Help' }).click();

  // Playwright refuses to click the version number because it's disabled. We override this with force: true. However,
  // this sometimes fails to enable developer mode, probably because the click even was fired before the menu was fully
  // open. Ideally we would tell Playwright to use all actionability checks *except* checking whether the element is
  // disabled, but force turns them all off. So instead wait until we can click a different menu item (which is enabled)
  // but don't actually click it. Then start clicking the version number.
  // Ideally we would just wait until the element receives events.
  // See https://playwright.dev/docs/actionability#receives-events
  await page.getByRole('menuitem', { name: 'Open source licenses' }).click({ trial: true });
  await page.locator('#version-number').click({ force: true, clickCount: 7 });
}

export async function installMouseFollower(page: Page): Promise<void> {
  const document: any = {};
  await page.evaluate(() => {
    const span = document.createElement('span');
    const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M0 55.2L0 426c0 12.2 9.9 22 22 22c6.3 0 12.4-2.7 16.6-7.5L121.2 346l58.1 116.3c7.9 15.8 27.1 22.2 42.9 14.3s22.2-27.1 14.3-42.9L179.8 320l118.1 0c12.2 0 22.1-9.9 22.1-22.1c0-6.3-2.7-12.3-7.4-16.5L38.6 37.9C34.3 34.1 28.9 32 23.2 32C10.4 32 0 42.4 0 55.2z"/></svg>`;
    span.innerHTML = arrowSvg;
    const mouseFollower = span.firstChild;
    mouseFollower.outerHTML = arrowSvg;
    mouseFollower.src = '/assets/icons/arrow.png';
    mouseFollower.style.position = 'absolute';
    mouseFollower.style['z-index'] = '1000000';
    mouseFollower.style.width = '30px';
    mouseFollower.style.filter = 'drop-shadow( 3px 3px 2px rgba(0, 0, 0, .7))';
    mouseFollower.style.transition = 'all 0.1s';
    // mouseFollower.style.height = "10px";
    // mouseFollower.style.backgroundColor = "red";
    mouseFollower.style.pointerEvents = 'none';
    document.body.appendChild(mouseFollower);

    document.addEventListener('mousemove', event => {
      mouseFollower.style.top = event.pageY + 'px';
      mouseFollower.style.left = event.pageX + 'px';
    });
  });
}

export async function click(page: Page, locator: Locator): Promise<void> {
  const rect = await locator.boundingBox();
  if (rect == null) throw new Error('Bounding client rect not found');
  await page.mouse.move(rect.x + rect.width * 0.7, rect.y + rect.height * 0.7);
  await page.waitForTimeout(250);

  await locator.click();
}
