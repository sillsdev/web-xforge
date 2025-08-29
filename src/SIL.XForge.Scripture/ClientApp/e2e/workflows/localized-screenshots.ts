import { Locator, Page, ViewportSize } from 'npm:playwright';
import { expect } from 'npm:playwright/test';
import { navLocator } from '../components/navigation.ts';
import { E2E_SYNC_DEFAULT_TIMEOUT, logger, preset, ScreenshotContext } from '../e2e-globals.ts';
import {
  deleteProject,
  deleteUserAsSiteAdmin,
  enableDeveloperMode,
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
      { ...context, pageName: 'page_sign_up', locale: localeCode },
      { clip: signUpButtonScreenshotClip }
    );

    // Auth0 login page
    await homePageSignUpButtonLocator.click();
    await page.waitForSelector('.auth0-lock-social-button');
    if (preset.showArrow) await installMouseFollower(page);
    await user.hover(page.locator('.auth0-lock-social-button').first(), { x: 0.85, y: 0.6 });
    await screenshotElements(page, [page.locator('.auth0-lock-widget-container')], {
      ...context,
      pageName: 'auth0_sign_up_with_pt',
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
      { ...context, pageName: 'pt_registry_login', locale: localeCode },
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
      // Only switch the language if not already on the default
      if (i !== 0) await switchLanguage(page, localeCode);
      await callback(localeCode);
    }
    // Only switch back to the default language if there was another locale to switch to
    if (preset.locales.length > 1) await switchLanguage(page, 'en');
  }

  await forEachLocale(async locale => {
    await user.hover(joinOrConnectLocator.first(), defaultArrowLocation);
    await screenshot(page, { ...context, pageName: 'my_projects', locale });
  });

  await joinOrConnectLocator.click();

  const connectButtonLocator = page.locator('app-connect-project').getByRole('button');
  await expect(connectButtonLocator).toBeEnabled();
  await connectButtonLocator.click({ trial: true }); // wait for the button to be clickable
  await forEachLocale(async locale => {
    await user.hover(connectButtonLocator, defaultArrowLocation);
    await screenshot(page, { ...context, pageName: 'connect_project', locale });
  });

  await connectButtonLocator.click();
  await page.waitForURL(/\/projects\/[a-z0-9]+/, { timeout: E2E_SYNC_DEFAULT_TIMEOUT });

  await navLocator(page, 'sync').click();

  const syncButtonLocator = page.locator('mat-card').getByRole('button');
  await forEachLocale(async locale => {
    await user.hover(syncButtonLocator, defaultArrowLocation);
    await screenshot(page, { ...context, pageName: 'sync', locale });
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

  await page.locator('[data-test-id="configure-button"]').click();

  const originalViewportSize = await page.viewportSize()!;
  // Increase the height of the viewport to ensure all elements are visible
  await page.setViewportSize({ width: originalViewportSize.width, height: 1200 });

  await page.getByRole('combobox').fill('ntv');
  await page.getByRole('option', { name: 'NTV - Nueva Traducción' }).click();

  const addReference = page.locator('.add-another-project');
  const nextButton = page.locator('.step-button-wrapper').getByRole('button').last();

  await forEachLocale(async locale => {
    await user.hover(addReference);
    await screenshotElements(
      page,
      [page.locator('app-draft-sources > .draft-sources-stepper'), page.locator('app-draft-sources > .overview')],
      { ...context, pageName: 'configure_sources_draft_reference', locale },
      { margin: 8 }
    );
  });
  await page.getByRole('combobox').fill('ntv');
  await page.getByRole('option', { name: 'NTV - Nueva Traducción' }).click();
  await user.click(addReference);
  await page.getByRole('combobox').last().fill('dhh94');
  await page.getByRole('option', { name: 'DHH94 - Spanish: Dios Habla' }).click();
  await nextButton.click();

  await forEachLocale(async locale => {
    await page.getByRole('combobox').fill('ntv');
    await page.getByRole('option', { name: 'NTV - Nueva Traducción' }).click();
    await user.hover(nextButton);
    await screenshotElements(
      page,
      [page.locator('app-draft-sources > .draft-sources-stepper'), page.locator('app-draft-sources > .overview')],
      { ...context, pageName: 'configure_sources_draft_reference', locale },
      { margin: 8 }
    );
  });

  await page.getByRole('combobox').fill('ntv');
  await page.getByRole('option', { name: 'NTV - Nueva Traducción' }).click();
  await nextButton.click();

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
    await user.hover(
      page.locator('app-draft-generation-steps .button-strip').getByRole('button').last(),
      defaultArrowLocation
    );
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

  // Reset the viewport size to the original size full page screenshots aren't excessively tall
  await page.setViewportSize(originalViewportSize);

  // Generate the draft

  await enableDeveloperMode(page, { closeMenu: true });
  await user.check(page.getByRole('checkbox', { name: 'Use Echo Translation Engine' }));
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Generate draft' }).click();
  await expect(page.getByText('Draft queued')).toBeVisible({ timeout: 60_000 });

  // Go to settings page and set a source while the draft is being generated
  await navLocator(page, 'settings').click();
  await page.getByRole('combobox', { name: 'Source text (optional)' }).fill('ntv');
  await page.getByRole('option', { name: 'NTV - ' }).click();

  // While we're on the settings page, take screenshots of settings
  const settingsSectionTitles = await page.locator('app-settings mat-card-title').allInnerTexts();

  // Community Checking settings
  const indexOfCommunityCheckingSettings = settingsSectionTitles.indexOf('Community Checking');
  const communityCheckingSettingsLocator = page.locator('app-settings mat-card').nth(indexOfCommunityCheckingSettings);
  await forEachLocale(async locale => {
    await communityCheckingSettingsLocator.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await user.hover(page.locator('#checkbox-community-checking'), defaultArrowLocation);
    await screenshotElements(
      page,
      [communityCheckingSettingsLocator],
      { ...context, pageName: 'settings_community_checking', locale },
      { margin: 8 }
    );
    await user.hover(page.locator('#checkbox-see-others-responses'), defaultArrowLocation);
    await screenshotElements(
      page,
      [communityCheckingSettingsLocator],
      { ...context, pageName: 'checking_enable_see_others_responses', locale },
      { margin: 8 }
    );
  });

  // Sharing settings
  const indexOfSharingSettings = settingsSectionTitles.indexOf('Sharing Settings');
  const sharingSettingsLocator = page.locator('app-settings mat-card').nth(indexOfSharingSettings);
  await page.locator('#checkbox-community-checkers-share').getByRole('checkbox').check();
  await forEachLocale(async locale => {
    await sharingSettingsLocator.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await user.hover(page.locator('#checkbox-community-checkers-share'), { ...defaultArrowLocation, y: 0.4 });
    await screenshotElements(
      page,
      [sharingSettingsLocator],
      { ...context, pageName: 'settings_sharing', locale },
      { margin: 8 }
    );
  });

  // Go to users page
  await navLocator(page, 'users').click();
  const sharingLocator = page.locator('app-share-control');
  await forEachLocale(async locale => {
    await sharingLocator.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await user.hover(sharingLocator.getByRole('button').last(), defaultArrowLocation);
    await screenshotElements(page, [sharingLocator], { ...context, pageName: 'invite_users', locale }, { margin: 8 });
  });

  // Wait for sync to finish
  await page.waitForSelector('#sync-icon:not(.sync-in-progress)', { timeout: E2E_SYNC_DEFAULT_TIMEOUT });

  // Go back to the draft generation page
  await navLocator(page, 'generate_draft').click();
  await expect(page.getByText('The draft is ready')).toBeVisible({ timeout: 180_000 });

  await forEachLocale(async locale => {
    await user.hover(page.getByRole('radio').first(), defaultArrowLocation);
    await screenshot(page, { ...context, pageName: 'draft_complete', locale });
  });

  await page.getByRole('radio', { name: 'Ruth' }).first().click();

  await expect(page.getByRole('button', { name: 'Add to project' })).toBeVisible();

  await forEachLocale(async locale => {
    await user.hover(page.locator('.apply-draft-button-container').getByRole('button'), defaultArrowLocation);
    await screenshot(page, { ...context, pageName: 'draft_preview', locale });
  });

  await page.getByRole('button', { name: 'Add to project' }).click();
  await page.getByRole('button', { name: 'Overwrite chapter' }).click();

  await forEachLocale(async locale => {
    await user.hover(page.locator('.apply-draft-button-container').getByRole('button'), defaultArrowLocation);

    await screenshot(page, { ...context, pageName: 'chapter_imported', locale });
  });

  // Go back to the draft generation page
  await navLocator(page, 'generate_draft').click();
  await expect(page.getByText('The draft is ready')).toBeVisible();

  await forEachLocale(async locale => {
    await page.getByRole('radio').nth(1).click();
    await user.hover(page.getByRole('menuitem').last(), defaultArrowLocation);
    await screenshot(page, { ...context, pageName: 'import_book', locale });
    await page.keyboard.press('Escape');
  });

  await forEachLocale(async locale => {
    await page.getByRole('radio').nth(1).click();
    await page.getByRole('menuitem').last().click();
    await page.getByRole('combobox').fill('seedsp2');
    await page.getByRole('option', { name: 'seedsp2 - ' }).click();
    await page.getByRole('checkbox').check();
    await user.hover(page.getByRole('button').last(), defaultArrowLocation);
    await screenshotElements(
      page,
      [page.locator('mat-dialog-container')],
      { ...context, pageName: 'import_book_dialog', locale },
      { margin: 8 }
    );
    await page.keyboard.press('Escape');
  });

  await forEachLocale(async locale => {
    await user.hover(page.locator('[data-test-id="download-button"]'), defaultArrowLocation);
    await screenshotElements(
      page,
      [page.locator('app-draft-history-entry').first()],
      { ...context, pageName: 'download_usfm', locale },
      { margin: 8 }
    );
  });

  await siteAdminBrowser.browser.close();
  await logOut(page);
}
