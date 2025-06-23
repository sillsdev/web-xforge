import { Locator, Page, ViewportSize } from 'npm:playwright';
import { expect } from 'npm:playwright/test';
import { navLocator } from '../components/navigation.ts';
import { E2E_SYNC_DEFAULT_TIMEOUT, logger, preset, ScreenshotContext } from '../e2e-globals.ts';
import {
  deleteProject,
  deleteUserAsSiteAdmin,
  enableDraftingOnProjectAsServalAdmin,
  ensureJoinedOrConnectedToProject,
  getNewBrowserForSideWork,
  installMouseFollower,
  logInAsPTUser,
  logInAsSiteAdmin,
  logOut,
  screenshot,
  switchLanguage,
  switchToLocaleOnHomePage
} from '../e2e-utils.ts';
import { UserEmulator } from '../user-emulator.mts';

interface ElementScreenshotOptions {
  margin: number;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Finds the smallest bounding box that surrounds all the elements specified by the list of locators */
async function locatorsToBoundingBox(locators: Locator[]): Promise<BoundingBox> {
  const boxes = await Promise.all(locators.map(locator => locator.boundingBox()));
  if (boxes.some(box => box == null)) throw new Error('Bounding box for element not found');
  const x = Math.min(...boxes.map(box => box!.x));
  const y = Math.min(...boxes.map(box => box!.y));
  const width = Math.max(...boxes.map(box => box!.width + box!.x)) - x;
  const height = Math.max(...boxes.map(box => box!.height + box!.y)) - y;
  return { x, y, width, height };
}

/** Adds margin to a bounding box while preventing it from exceeding the bounds of the viewport */
function addMarginToBoundingBox(boundingBox: BoundingBox, margin: number, viewportSize: ViewportSize): BoundingBox {
  const x1 = Math.max(0, boundingBox.x - margin);
  const y1 = Math.max(0, boundingBox.y - margin);
  const x2 = Math.min(viewportSize.width, boundingBox.x + boundingBox.width + margin);
  const y2 = Math.min(viewportSize.height, boundingBox.y + boundingBox.height + margin);
  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1
  };
}

/** Takes a single screenshot that encompasses all the elements specified by the list of locators. */
async function screenshotElements(
  page: Page,
  locators: Locator[],
  context: ScreenshotContext,
  options: ElementScreenshotOptions = {
    margin: 0
  }
): Promise<void> {
  const viewportSize = await page.viewportSize();
  if (viewportSize == null) throw new Error('Viewport size not found');
  const boundingBox = await locatorsToBoundingBox(locators);
  const clip = addMarginToBoundingBox(boundingBox, options.margin, viewportSize);

  const fileNameParts = [context.engine, context.role, context.pageName, context.locale];
  const fileName = fileNameParts.filter(part => part != null).join('_') + '.png';
  await page.screenshot({ path: `${preset.outputDir}/${fileName}`, clip, animations: 'disabled' });
  logger.logScreenshot(fileName, context);
}

export async function localizedScreenshots(
  page: Page,
  context: ScreenshotContext,
  credentials: { email: string; password: string }
): Promise<void> {
  const user = new UserEmulator(page);
  const defaultArrowLocation = { x: 0.75, y: 0.6 };

  const homePageSignUpButtonLocator = page.locator('.login-buttons a').first();

  for (const localeCode of preset.locales) {
    console.log(`Taking screenshots of login process for locale ${localeCode}`);

    await page.goto(preset.rootUrl);
    await switchToLocaleOnHomePage(page, localeCode);
    await expect(homePageSignUpButtonLocator).toBeVisible();
    if (preset.showArrow) await installMouseFollower(page);

    // Scripture Forge home page
    const signUpButtonScreenshotClip = {
      x: 0,
      y: 0,
      width: (await page.viewportSize())!.width,
      height: 400
    };

    await user.hover(homePageSignUpButtonLocator, defaultArrowLocation);
    await screenshot(
      page,
      { ...context, pageName: 'localized_page_sign_up', locale: localeCode },
      { clip: signUpButtonScreenshotClip }
    );

    // Auth0 login page
    await homePageSignUpButtonLocator.click();
    await page.waitForSelector('.auth0-lock-social-button');
    if (preset.showArrow) await installMouseFollower(page);
    await user.hover(page.locator('.auth0-lock-social-button').first(), { x: 0.85, y: 0.6 });
    await screenshotElements(page, [page.locator('.auth0-lock-widget-container')], {
      ...context,
      pageName: 'localized_auth0_sign_up_with_pt',
      locale: localeCode
    });
    await page.locator('.auth0-lock-social-button').first().click();

    // Paratext login page
    await expect(page.getByRole('heading', { name: 'Authorise Application' })).toBeVisible();
    if (preset.showArrow) await installMouseFollower(page);
    await page.getByRole('alert').getByText('Warning: This server is for').getByRole('button').click();
    await page.locator('#email').fill('user@gmail.com');
    await user.hover(page.locator('#password-group').getByRole('button'));
    await screenshot(
      page,
      { ...context, pageName: 'localized_pt_registry_login', locale: localeCode },
      { animations: 'disabled' }
    );
  }

  const shortName = 'SEEDSP2';
  await logInAsPTUser(page, credentials);
  await switchLanguage(page, 'en');
  await ensureJoinedOrConnectedToProject(page, shortName);
  await deleteProject(page, shortName);
  await logOut(page); // log out in preparation for user being deleted

  // delete the user for a clean start
  const siteAdminBrowser = await getNewBrowserForSideWork();
  await logInAsSiteAdmin(siteAdminBrowser.page);
  await deleteUserAsSiteAdmin(siteAdminBrowser.page, credentials.email);

  await page.goto(preset.rootUrl);
  await switchToLocaleOnHomePage(page, 'en');
  await logInAsPTUser(page, credentials);
  if (preset.showArrow) await installMouseFollower(page);

  const joinOrConnectLocator = page.locator(`.user-unconnected-project:has-text("${shortName}")`).getByRole('link');
  await expect(joinOrConnectLocator).toBeVisible({ timeout: 30_000 });

  async function forEachLocale(callback: (localeCode: string) => Promise<void>): Promise<void> {
    for (let i = 0; i < preset.locales.length; i++) {
      const localeCode = preset.locales[i];
      if (i !== 0) await switchLanguage(page, localeCode);
      await callback(localeCode);
    }
    await switchLanguage(page, 'en');
  }

  await forEachLocale(async locale => {
    await user.hover(joinOrConnectLocator.first(), defaultArrowLocation);
    await screenshot(page, { ...context, pageName: 'localized_my_projects', locale });
  });

  await joinOrConnectLocator.click();

  const connectButtonLocator = page.locator('app-connect-project').getByRole('button');
  await expect(connectButtonLocator).toBeEnabled();
  await connectButtonLocator.click({ trial: true }); // wait for the button to be clickable
  await forEachLocale(async locale => {
    await user.hover(connectButtonLocator, defaultArrowLocation);
    await screenshot(page, { ...context, pageName: 'localized_connected_project', locale });
  });

  await connectButtonLocator.click();
  await page.waitForURL(/\/projects\/[a-z0-9]+/, { timeout: E2E_SYNC_DEFAULT_TIMEOUT });

  await navLocator(page, 'sync').click();

  const syncButtonLocator = page.locator('mat-card').getByRole('button');
  await forEachLocale(async locale => {
    await user.hover(syncButtonLocator, defaultArrowLocation);
    await screenshot(page, { ...context, pageName: 'localized_sync', locale });
  });

  await navLocator(page, 'generate_draft').click();

  await forEachLocale(async locale => {
    await user.hover(page.locator('[data-test-id="approval-needed"]').getByRole('link'), defaultArrowLocation);
    await screenshot(page, { ...context, pageName: 'sign_up_for_drafting', locale });
  });

  await enableDraftingOnProjectAsServalAdmin(siteAdminBrowser.page, shortName);

  await expect(page.getByRole('button', { name: 'Configure sources' })).toBeVisible();
  if (preset.showArrow) await installMouseFollower(page);

  await forEachLocale(async locale => {
    await user.hover(page.locator('[data-test-id="configure-button"]'), defaultArrowLocation);
    await screenshot(page, { ...context, pageName: 'configure_sources_button', locale });
  });

  // Make the viewport taller to fit the "confirm languages" area
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.locator('[data-test-id="configure-button"]').click();
  await forEachLocale(async locale => {
    await page.getByRole('combobox').fill('ntv');
    await user.hover(page.getByRole('option', { name: 'NTV - Nueva Traducción' }), defaultArrowLocation);
    await screenshotElements(
      page,
      [page.locator('app-draft-sources > .draft-sources-stepper'), page.locator('app-draft-sources > .overview')],
      { ...context, pageName: 'configure_sources_draft_source', locale },
      { margin: 8 }
    );
  });
  await page.getByRole('combobox').fill('ntv');
  await page.getByRole('option', { name: 'NTV - Nueva Traducción' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await forEachLocale(async locale => {
    await user.hover(await page.getByRole('combobox'), defaultArrowLocation);
    await screenshotElements(
      page,
      [page.locator('app-draft-sources > .draft-sources-stepper'), page.locator('app-draft-sources > .overview')],
      { ...context, pageName: 'configure_sources_draft_reference', locale },
      { margin: 8 }
    );
  });

  await page.getByRole('combobox').fill('ntv');
  await page.getByRole('option', { name: 'NTV - Nueva Traducción' }).click();
  await user.click(page.getByRole('button', { name: 'Add another reference project' }));
  await page.getByRole('combobox').last().fill('dhh94');
  await page.getByRole('option', { name: 'DHH94 - Spanish: Dios Habla' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await forEachLocale(async locale => {
    await user.hover(await page.getByRole('checkbox'));
    await screenshotElements(
      page,
      [page.locator('app-draft-sources')],
      { ...context, pageName: 'configure_sources_confirm_languages', locale },
      { margin: 8 }
    );
  });

  await page.getByRole('checkbox', { name: 'All the language codes are correct' }).check();
  await page.getByRole('button', { name: 'Save & sync' }).click();
  // Wait for the sync (if there are any) to finish
  await page.getByRole('button', { name: 'Close' }).click({ timeout: 3 * 60_000 });

  // Back on main generate draft page
  await forEachLocale(async locale => {
    await user.hover(page.locator('.action-button-strip').getByRole('button').first(), defaultArrowLocation);
    await screenshotElements(
      page,
      [page.locator('app-draft-generation')],
      { ...context, pageName: 'generate_draft_button', locale },
      { margin: 8 }
    );
  });
  await page.getByRole('button', { name: 'Generate draft' }).click();

  // FIXME(application-bug) This sometimes fails when "You have no books available for drafting." is shown
  await expect(page.getByRole('heading', { name: 'Review draft setup' })).toBeVisible();
  await forEachLocale(async locale => {
    await screenshotElements(
      page,
      [page.locator('app-draft-generation')],
      { ...context, pageName: 'generate_draft_confirm_sources', locale },
      { margin: 8 }
    );
  });

  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1000);

  await page.getByRole('option', { name: 'Ruth' }).click();
  await forEachLocale(async locale => {
    await user.hover(page.getByRole('option', { selected: true }), defaultArrowLocation);
    await screenshotElements(
      page,
      [page.locator('app-draft-generation')],
      { ...context, pageName: 'generate_draft_select_books_to_draft', locale },
      { margin: 8 }
    );
  });

  await page.getByRole('button', { name: 'Next' }).click();
  const ntCheckboxLocator = page.locator('app-book-multi-select').getByRole('checkbox').nth(1);
  await ntCheckboxLocator.check();
  await forEachLocale(async locale => {
    await user.hover(ntCheckboxLocator);
    await screenshotElements(
      page,
      [page.locator('app-draft-generation')],
      { ...context, pageName: 'generate_draft_select_books_to_train', locale },
      { margin: 8 }
    );
  });

  await page.getByRole('button', { name: 'Next' }).click();

  await forEachLocale(async locale => {
    await user.hover(page.getByRole('button').last(), defaultArrowLocation);
    await screenshotElements(
      page,
      [page.locator('app-draft-generation')],
      { ...context, pageName: 'generate_draft_summary', locale },
      { margin: 8 }
    );
  });

  await siteAdminBrowser.browser.close();
  await logOut(page);
}
