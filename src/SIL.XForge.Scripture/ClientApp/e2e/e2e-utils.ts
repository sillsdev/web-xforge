/// <reference lib="dom" />
import { Browser, chromium, Locator, Page, PageScreenshotOptions } from 'npm:playwright';
import { expect } from 'npm:playwright/test';
import locales from '../../locales.json' with { type: 'json' };
import { E2E_SYNC_DEFAULT_TIMEOUT, logger, preset, ScreenshotContext } from './e2e-globals.ts';
import secrets from './secrets.json' with { type: 'json' };

export async function waitForAppLoad(page: Page): Promise<void> {
  // FIXME This is hideous, but the progress bar doesn't open instantly. Also, even waiting for it to close isn't
  // sufficient
  await page.waitForTimeout(200);
  try {
    await page.waitForSelector('.mat-progress-bar--closed');
  } catch (e: any) {
    if (/page.waitForSelector: Timeout \d+ms exceeded/.test(e.message)) {
      // FIXME(application-bug) The editor component sometimes never closes the loading indicator
      console.log('Timeout exceeded waiting for progress bar to close. Opening developer diagnostics to see why.');
      await page.reload();
      await page.waitForTimeout(2000);
      await page.waitForSelector('.mat-progress-bar--closed');
    }
  }
  await page.waitForTimeout(500);
}

function cleanText(text: string): string {
  return text
    .trim()
    .replace(/[^ \w]/gi, '')
    .replace(/\s+/g, '_');
}

export async function pageName(page: Page): Promise<string> {
  if (page.url() === `${preset.rootUrl}/projects`) return 'my_projects';

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

export async function isProjectConnected(page: Page, shortName: string): Promise<boolean> {
  if ((await getShortNameOnPage(page)) === shortName) return true;

  await ensureOnMyProjectsPage(page);

  const goToProjectButtonLocator = page.locator('.user-connected-project').filter({ hasText: shortName });
  const unconnectedProjectLocator = page.locator('.user-unconnected-project').filter({ hasText: shortName });

  await expect(goToProjectButtonLocator.or(unconnectedProjectLocator)).toBeVisible();

  if (await goToProjectButtonLocator.isVisible()) {
    return true;
  }

  return await unconnectedProjectLocator.getByRole('button', { name: 'Join' }).isVisible();
}

export async function ensureOnMyProjectsPage(page: Page): Promise<void> {
  if (new URL(await page.url()).pathname !== '/projects') {
    console.log('clicking sf logo button');
    await page.click('#sf-logo-button');
  }
  await page.waitForURL(url => url.pathname === '/projects');
}

/**
 * Connect to a project, deleting it first if it already exists.
 * @param page The Playwright page object.
 * @param shortName The short name of the project to connect.
 * @param source Optional short name of source text to select when connecting the project.
 */
export async function freshlyConnectProject(page: Page, shortName: string, source?: string): Promise<void> {
  await ensureOnMyProjectsPage(page);
  const connected = await isProjectConnected(page, shortName);
  const joined = await isProjectJoined(page, shortName);

  if (connected && !joined) await ensureJoinedOrConnectedToProject(page, shortName);

  if (connected) {
    await ensureNavigatedToProject(page, shortName);
    await deleteProject(page, shortName);
  }

  await connectProject(page, shortName, source);
}

/**
 * Connects a project by clicking the "Connect" button on the My Projects page. The project must not already be
 * connected.
 * @param page The Playwright page object.
 * @param shortName The short name of the project to connect.
 * @param source Optional short name of source text to select when connecting the project.
 * @returns A promise that resolves when the project is connected.
 */
export async function connectProject(page: Page, shortName: string, source?: string): Promise<void> {
  await ensureOnMyProjectsPage(page);
  await page
    .locator(`.user-unconnected-project:has-text("${shortName}")`)
    .getByRole('link', { name: 'Connect' })
    .click();

  await page.waitForURL(url => /^\/connect-project/.test(url.pathname));

  if (source != null) {
    await page.getByRole('combobox', { name: 'Source text (optional)' }).click();
    await page.keyboard.type(source);
    await page.getByRole('option', { name: `${source} - ` }).click();
  }

  await page.getByRole('button', { name: 'Connect' }).click();
  await waitForNavigationToProjectPage(page, E2E_SYNC_DEFAULT_TIMEOUT * (source == null ? 1 : 2));
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

  const connectLocator = project.getByRole('link', { name: 'Connect' });
  const joinLocator = project.getByRole('button', { name: 'Join' });

  await expect(joinLocator.or(connectLocator)).toBeVisible();

  if (await joinLocator.isVisible()) {
    await joinLocator.click();
  } else if (await connectLocator.isVisible()) {
    await connectLocator.click();
    await page.waitForURL(url => /^\/connect-project/.test(url.pathname));
    await page.getByRole('button', { name: 'Connect' }).click();
  } else {
    throw new Error('Neither Join nor Connect button found');
  }

  await waitForNavigationToProjectPage(page, E2E_SYNC_DEFAULT_TIMEOUT);
}

export async function screenshot(
  page: Page,
  context: ScreenshotContext,
  screenshotOptions: PageScreenshotOptions = {},
  options = { overrideScreenshotSkipping: false }
): Promise<void> {
  if (preset.skipScreenshots && options.overrideScreenshotSkipping !== true) return;

  const fileNameParts = [context.engine, context.role, context.pageName ?? (await pageName(page)), context.locale];
  const fileName = fileNameParts.filter(part => part != null).join('_') + '.png';
  await page.screenshot({
    path: `${preset.outputDir}/${fileName}`,
    fullPage: true,
    animations: 'disabled',
    ...screenshotOptions
  });
  logger.logScreenshot(fileName, context);
}

export async function createShareLinksAsAdmin(
  page: Page,
  shortName: string
): Promise<{
  [role: string]: string;
}> {
  await ensureNavigatedToProject(page, shortName);
  await page.waitForTimeout(1000);
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
  await page
    .getByRole('heading', { name: /Share \w+/ })
    .getByRole('button')
    .click();

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
  await waitForNavigationToProjectPage(page);
}

export async function waitForNavigationToProjectPage(page: Page, timeout?: number): Promise<void> {
  await page.waitForURL(url => /\/projects\/[a-z0-9]+/.test(url.pathname), { timeout });
}

export async function deleteProject(page: Page, shortName: string): Promise<void> {
  await ensureNavigatedToProject(page, shortName);

  await page.getByRole('link', { name: 'Settings' }).click();

  // Open the dialog
  await page.getByRole('button', { name: 'Delete this project' }).click();
  // const paragraph = await page.getByRole('paragraph', { name: /This will permanently delete the/ });
  const paragraph = await page.getByText('This action cannot be undone');
  const projectName = (await paragraph.textContent())?.match(/delete the (.*) project/)?.[1];
  if (projectName == null) throw new Error('Project name not found');
  await page.getByRole('textbox', { name: 'Project name' }).fill(projectName);
  await page.getByRole('button', { name: 'I understand the consequences, delete this project' }).click();

  // Wait for the project to be fully deleted and user redirected to my projects page
  await page.waitForURL(url => /\/projects\/?$/.test(url.pathname));

  // FIXME(application-bug) If projects are deleted too quickly after navigating to them, a permission error dialog
  // opens. The tests have to work around this.
  if (
    (await page.getByRole('heading', { name: 'An error has occurred' }).isVisible()) &&
    (await page.getByText('403: Permission denied (read').isVisible())
  ) {
    await page.getByRole('button', { name: 'Close' }).click();
  }
}

export async function enableFeatureFlag(page: Page, flag: string): Promise<void> {
  await enableDeveloperMode(page);
  await page.getByRole('menuitem', { name: 'Developer settings' }).click();
  await page.getByRole('checkbox', { name: flag }).check();
  await page.keyboard.press('Escape');
}

export async function enableDeveloperMode(page: Page, options = { closeMenu: false }): Promise<void> {
  await page.getByRole('button', { name: 'Help' }).click();

  // Playwright refuses to click the version number because it's disabled. We override this with force: true. However,
  // this sometimes fails to enable developer mode, probably because the click event was fired before the menu was fully
  // open. Ideally we would tell Playwright to use all actionability checks *except* checking whether the element is
  // disabled, but force turns them all off. So instead wait until we can click a different menu item (which is enabled)
  // but don't actually click it. Then start clicking the version number.
  // Ideally we would just wait until the element receives events.
  // See https://playwright.dev/docs/actionability#receives-events
  await page.getByRole('menuitem', { name: 'Open source licenses' }).click({ trial: true });
  await page.locator('#version-number').click({ force: true, clickCount: 7 });
  if (options.closeMenu) await page.keyboard.press('Escape');
}

export async function installMouseFollower(page: Page): Promise<void> {
  const animationMs = Math.min(preset.defaultUserDelay, 200);
  await page.evaluate(animationMs => {
    const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M0 55.2L0 426c0 12.2 9.9 22 22 22c6.3 0 12.4-2.7 16.6-7.5L121.2 346l58.1 116.3c7.9 15.8 27.1 22.2 42.9 14.3s22.2-27.1 14.3-42.9L179.8 320l118.1 0c12.2 0 22.1-9.9 22.1-22.1c0-6.3-2.7-12.3-7.4-16.5L38.6 37.9C34.3 34.1 28.9 32 23.2 32C10.4 32 0 42.4 0 55.2z"/></svg>`;
    // Work around the inability to directly create an SVG element
    const span = document.createElement('span');
    span.innerHTML = arrowSvg;
    const mouseFollower = span.firstElementChild as HTMLElement;
    mouseFollower.style.position = 'absolute';
    mouseFollower.style.zIndex = '1000000';
    mouseFollower.style.width = '30px';
    // Add a white border around the arrow for contrast with dark backgrounds
    mouseFollower.style.filter =
      'drop-shadow( 1px  0px 0px white) drop-shadow(-1px  0px 0px white) drop-shadow( 0px  1px 0px white) drop-shadow( 0px -1px 0px white) drop-shadow( 3px 3px 2px rgba(0, 0, 0, .7))';
    // Animate the movement of the arrow
    mouseFollower.style.transition = `all ${animationMs}ms`;
    // Prevent the arrow from blocking clicks
    mouseFollower.style.pointerEvents = 'none';
    mouseFollower.style.fill = '#333';
    document.body.appendChild(mouseFollower);

    document.addEventListener('mousemove', event => {
      mouseFollower.style.top = event.pageY + 'px';
      mouseFollower.style.left = event.pageX + 'px';
    });
    // Prevent the arrow from causing a scrollbar when it's at the edge of the screen
    document.documentElement.style.overflow = 'hidden';
  }, animationMs);
}

export async function click(page: Page, locator: Locator): Promise<void> {
  const rect = await locator.boundingBox();
  if (rect == null) throw new Error('Bounding client rect not found');
  await page.waitForTimeout(preset.defaultUserDelay / 2);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.waitForTimeout(preset.defaultUserDelay);

  await locator.click();
  await page.waitForTimeout(preset.defaultUserDelay / 2);
}

export async function joinWithLink(page: Page, link: string, name: string): Promise<void> {
  await page.goto(link);
  await page.focus('input');
  await page.waitForTimeout(500);
  await page.fill('input', name);
  await waitForAppLoad(page);
  await page.getByRole('button', { name: 'Join' }).click();
}

export async function logOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'User' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  if (await page.getByRole('button', { name: 'Yes, log out' }).isVisible()) {
    await page.getByRole('button', { name: 'Yes, log out' }).click();
  }
  await page.waitForURL(preset.rootUrl);
}

export async function switchToLocaleOnHomePage(page: Page, localeCode: string): Promise<void> {
  if (isRootUrl(page.url())) {
    await page.getByRole('combobox').selectOption(localeCode);
    await page.waitForTimeout(50); // Wait for the page to reload
  } else throw new Error(`Cannot switch locale from page ${page.url()}`);
}

export async function switchLanguage(page: Page, localeCode: string): Promise<void> {
  const locale = locales.find(l => l.tags[0] === localeCode);
  if (locale == null) throw new Error(`Locale not found for code: ${localeCode}`);

  await page.locator('header button').first().click();
  await page.getByRole('menuitem', { name: locale.localName }).click();
  await page.waitForTimeout(200);
}

export function isRootUrl(url: string): boolean {
  let a = url;
  let b = preset.rootUrl;
  if (a.endsWith('/')) a = a.slice(0, -1);
  if (b.endsWith('/')) b = b.slice(0, -1);
  return a === b;
}

async function setLocatorToValue(page: Page, locator: string, value: string): Promise<void> {
  return await page.evaluate(
    ({ locator, value }) => {
      const element = document.querySelector(locator);
      if (element == null) throw new Error(`Element not found for locator: ${locator}`);
      // @ts-ignore Property 'value' does not exist on type 'Element'.
      element.value = value;
    },
    { locator, value }
  );
}

export async function logInAsPTUser(page: Page, user: { email: string; password: string }): Promise<void> {
  await page.goto(preset.rootUrl);
  if (!isRootUrl(page.url())) await logOut(page);

  await switchToLocaleOnHomePage(page, 'en');
  await page.getByRole('link', { name: 'Log In' }).click();
  await page.locator('a').filter({ hasText: 'Log in with Paratext' }).click();

  // Paratext Registry login

  // Type fake username so it won't detect a Google account
  await page.fill('input[name="email"]', 'user@example.com');
  // Click the next arrow button
  await page.locator('#password-group').getByRole('button').click();
  await page.fill('input[name="password"]', user.password);
  // change the value of email without triggering user input detection
  await setLocatorToValue(page, 'input[name="email"]', user.email);
  await page.locator('#password-group').getByRole('button').click();

  // The first login requires authorizing Scripture Forge to access the Paratext account
  if ((await page.title()).startsWith('Authorise Application')) {
    await page.getByRole('button', { name: 'Accept' }).click();
  }

  // On localhost only, Auth0 requires accepting access to the account
  // Wait until back in the app, or on the authorization page
  const auth0AuthorizeUrl = 'https://sil-appbuilder.auth0.com/decision';
  await page.waitForURL(url =>
    [auth0AuthorizeUrl, preset.rootUrl].some(startingUrl => url.href.startsWith(startingUrl))
  );

  if (page.url().startsWith(auth0AuthorizeUrl)) {
    await page.locator('#allow').click();
  }

  try {
    await page.waitForURL(url => /^\/projects/.test(url.pathname));
  } catch (e) {
    if (e instanceof Error && e.message.includes('Timeout')) {
      // // FIXME(application-bug) Sometimes a login failure occurs. Retry.
      expect(await page.getByRole('heading', { name: 'An error occurred during login' })).toBeVisible();
      await page.getByRole('button', { name: 'Try Again' }).click();
      await page.waitForURL(url => /^\/projects/.test(url.pathname));
    } else {
      throw e;
    }
  }
}

function siteAdminCredentials(): { email: string; password: string } {
  const adminCredentials = secrets.users.find(user => user.email.split('@')[0].split('+')[1] === 'sf_e2e_admin');
  if (adminCredentials == null) throw new Error('Admin credentials not found in secrets.json');
  return adminCredentials;
}

export async function logInAsSiteAdmin(page: Page): Promise<void> {
  await logInAsPTUser(page, siteAdminCredentials());
}

/** Logs in as a site admin and deletes a user if it exits. If it doesn't exist, no action is taken. */
export async function deleteUserAsSiteAdmin(page: Page, email: string): Promise<void> {
  await page.locator('header').getByRole('button', { name: 'Test Admin User Scripture Forge E2E' }).click();
  await page.getByRole('menuitem', { name: 'System Administration' }).click();
  await page.getByRole('textbox', { name: 'Filter users...' }).fill(email);

  const noUsersFoundLocator = page.locator('#no-users-label').getByText('No users found');
  const deleteButtonLocator = page.getByRole('row').getByRole('button').getByText('close');

  // Wait for one of the two states to be active
  await expect(noUsersFoundLocator.or(deleteButtonLocator)).toBeVisible();

  if (await deleteButtonLocator.isVisible()) {
    await deleteButtonLocator.click();
    await expect(page.locator('mat-dialog-content')).toContainText(email);
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('#no-users-label')).toContainText('No users found');
  }
}

export async function enableDraftingOnProjectAsServalAdmin(page: Page, shortName: string): Promise<void> {
  await page.locator('header').getByRole('button', { name: 'Test Admin User Scripture Forge E2E' }).click();
  await page.getByRole('menuitem', { name: 'Serval Administration' }).click();
  await page.getByRole('textbox', { name: 'Filter projects...' }).fill(shortName);
  await page.getByRole('link', { name: `${shortName} - ` }).click();
  await page.getByRole('checkbox', { name: 'Pre-Translation Drafting Enabled' }).check();
}

/**
 * Creates a new page in a new browser context for work outside the main test (for example, if needing an admin to
 * perform some action in the background to create a particular state)
 */
export async function getNewBrowserForSideWork(): Promise<{ page: Page; browser: Browser }> {
  const browser = await chromium.launch({ headless: preset.headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  return { page, browser };
}

/** Utilities. */
export class Utils {
  /** Returns date as a string in the format 'YYYY-mm-DD-HHMMSS'. */
  static formatDate(date: Date): string {
    const formatted: string = `${date.getFullYear()}-${Utils.pad(date.getMonth() + 1)}-${Utils.pad(date.getDate())}-${Utils.pad(date.getHours())}${Utils.pad(date.getMinutes())}${Utils.pad(date.getSeconds())}`;

    return formatted;
  }

  private static pad(n: number): string {
    return n.toString().padStart(2, '0');
  }
}

/**
 * Moves the caret to the end of the element using browser APIs.
 * Supports input, textarea, or contenteditable elements.
 */
export async function moveCaretToEndOfSegment(page: Page, locator: Locator): Promise<void> {
  // Focus the element
  await locator.focus();

  // Move caret to the end using browser APIs
  await locator.evaluate((el: HTMLElement) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const len: number = el.value.length;
      el.setSelectionRange(len, len);
    } else if (el.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel != null) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  });
}

/**
 * Deletes all text in the element by moving the caret to the end and pressing Backspace repeatedly.
 * Supports input, textarea, or contenteditable elements.
 */
export async function deleteAllTextInSegment(page: Page, locator: Locator): Promise<void> {
  // Move caret to the end first
  await moveCaretToEndOfSegment(page, locator);

  // Get the length of the text/content
  const length: number = await locator.evaluate((el: HTMLElement): number => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value.length;
    } else if (el.isContentEditable) {
      return el.textContent?.length ?? 0;
    }
    return 0;
  });

  // Press Backspace repeatedly to delete all text
  for (let i = 0; i < length; i++) {
    await page.keyboard.press('Backspace');
  }
}
