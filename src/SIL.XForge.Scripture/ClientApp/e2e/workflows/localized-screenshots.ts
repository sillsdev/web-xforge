import { Locator, Page } from 'npm:playwright';
import { expect } from 'npm:playwright/test';
import { DEFAULT_PROJECT_SHORTNAME, logger, preset, ScreenshotContext } from '../e2e-globals.ts';
import {
  deleteProject,
  installMouseFollower,
  isProjectJoined,
  logInAsPTUser,
  screenshot,
  switchLanguage,
  switchToLocaleOnHomePage
} from '../e2e-utils.ts';
import { UserEmulator } from '../user-emulator.mts';

// const translations: { [key: string]: any } = {};

// for (const localeCode of preset.locales) {
//   const localeCodeInFile = localeCode.replace('-', '_');
//   const checkingStrings = Deno.readTextFileSync(`../src/assets/i18n/checking_${localeCodeInFile}.json`);
//   const checkingStringsParsed = JSON.parse(checkingStrings);
//   const nonCheckingStrings = Deno.readTextFileSync(`../src/assets/i18n/non_checking_${localeCodeInFile}.json`);
//   const nonCheckingStringsParsed = JSON.parse(nonCheckingStrings);
//   translations[localeCode] = merge(checkingStringsParsed, nonCheckingStringsParsed);
// }

// function t(path: string, localeCode: string): string {
//   const languageTranslations = translations[localeCode];
//   // the path is a dot-separated string
//   const keys = path.split('.');
//   let currentTranslation = languageTranslations;
//   for (const key of keys) {
//     if (currentTranslation[key] == null) {
//       throw new Error(`Missing translation for ${path} in ${localeCode}`);
//     }
//     currentTranslation = currentTranslation[key];
//   }
//   return currentTranslation;
// }

interface ElementScreenshotOptions {
  margin: number;
}

async function screenshotElement(
  page: Page,
  locator: Locator,
  context: ScreenshotContext,
  options: ElementScreenshotOptions = {
    margin: 0
  }
): Promise<void> {
  const boundingBox = await locator.boundingBox();
  const viewportSize = await page.viewportSize();
  if (boundingBox == null) throw new Error('Bounding box for element not found');
  if (viewportSize == null) throw new Error('Viewport size not found');
  const x1 = Math.max(0, boundingBox.x - options.margin);
  const y1 = Math.max(0, boundingBox.y - options.margin);
  const x2 = Math.min(viewportSize.width, boundingBox.x + boundingBox.width + options.margin);
  const y2 = Math.min(viewportSize.height, boundingBox.y + boundingBox.height + options.margin);
  const clip = {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1
  };

  const fileNameParts = [context.engine, context.role, context.pageName, context.locale];
  const fileName = fileNameParts.filter(part => part != null).join('_') + '.png';
  await page.screenshot({ path: `${preset.outputDir}/${fileName}`, clip });
  logger.logScreenshot(fileName, context);
}

export async function localizedScreenshots(
  page: Page,
  context: ScreenshotContext,
  credentials: { email: string; password: string }
): Promise<void> {
  const user = new UserEmulator(page);
  const homePageSignUpButtonLocator = page.locator('.login-buttons a').first();

  for (const localeCode of preset.locales) {
    console.log(`Taking screenshots of login process for locale ${localeCode}`);

    await page.goto(preset.rootUrl);
    await switchToLocaleOnHomePage(page, localeCode);
    await expect(homePageSignUpButtonLocator).toBeVisible();
    if (preset.showArrow) await installMouseFollower(page, 0);

    // Scripture Forge home page
    const signUpButtonScreenshotClip = {
      x: 0,
      y: 0,
      width: (await page.viewportSize())!.width,
      height: 400
    };

    await user.hover(homePageSignUpButtonLocator, { x: 0.75, y: 0.6 });
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
    await screenshotElement(page, page.locator('.auth0-lock-widget-container'), {
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

  await page.goto(preset.rootUrl);
  await switchToLocaleOnHomePage(page, preset.locales[0]);
  await logInAsPTUser(page, credentials);
  if (await isProjectJoined(page, DEFAULT_PROJECT_SHORTNAME)) {
    await deleteProject(page, DEFAULT_PROJECT_SHORTNAME);
  }
  if (preset.showArrow) await installMouseFollower(page);

  for (const localeCode of preset.locales) {
    await switchLanguage(page, localeCode);
    await user.hover(page.getByRole('link').last());
    await screenshot(page, { ...context, pageName: 'localized_my_projects', locale: localeCode });
  }
}
