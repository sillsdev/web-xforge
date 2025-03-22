import { expect, Locator, Page, test } from '@playwright/test';
import { ensureJoinedProject, ensureNavigatedToProject } from './e2e-utils';
import { logInAsPTUser } from './pt_login';
import secrets from './secrets.json';

const E2E_ROOT_URL = 'http://localhost:5000';

async function enableFeatureFlag(page: Page, flag: string): Promise<void> {
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

  await page.getByRole('menuitem', { name: 'Developer settings' }).click();
  await page.getByRole('checkbox', { name: flag }).check();
  await page.keyboard.press('Escape');
}

test('test', async ({ page }) => {
  test.setTimeout(60_000 * 10);

  await logInAsPTUser(page, secrets.users[0]);
  await ensureJoinedProject(page, 'Stp22');
  await ensureNavigatedToProject(page, 'Stp22');

  await enableFeatureFlag(page, 'Allow Fast Pre-Translation');

  await page.getByRole('link', { name: 'Generate draft beta' }).click();

  // Enable pre-translation drafting, then close the panel
  await page.getByRole('button', { name: 'Serval administration' }).click();
  await page.getByRole('checkbox', { name: 'Pre-Translation Drafting Enabled' }).check();
  await page.getByRole('button', { name: 'Serval administration' }).click();

  // Configure sources page
  await page.getByRole('button', { name: 'Configure sources' }).click();
  await page.locator('#mat-input-0').click();
  await page.locator('#mat-input-0').fill('ntv');
  await page.getByRole('option', { name: 'NTV - Nueva Traducción' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('#mat-input-1').click();
  await page.locator('#mat-input-1').fill('ntv');
  await page.getByRole('option', { name: 'NTV - Nueva Traducción' }).click();
  await page.getByRole('button', { name: 'Add another reference project' }).click();
  await page.locator('#mat-input-3').click();
  await page.locator('#mat-input-3').fill('dhh94');
  await page.getByRole('option', { name: 'DHH94 - Spanish: Dios Habla' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox', { name: 'All the language codes are' }).check();
  await page.getByRole('button', { name: 'Save & sync' }).click();
  await page.getByRole('button', { name: 'Close' }).click();

  // The stepper renders every step to the page at once, so we need to keep track of which step we're on
  let currentStep = 0;
  function getStep(): Locator {
    return page.locator(`#cdk-step-content-0-${currentStep}`);
  }
  async function goToNextStepExpectingHeading(expectedHeading: string): Promise<void> {
    await getStep().getByRole('button', { name: 'Next' }).click();
    currentStep++;
    await expect(getStep().getByRole('heading', { name: expectedHeading })).toBeVisible();
  }

  // Draft generation page
  await page.getByRole('button', { name: 'Generate draft' }).click();

  await goToNextStepExpectingHeading('Select books to draft');
  await expect(getStep().getByRole('option')).toHaveCount(66);
  const options = await getStep().getByRole('option').all();

  let previousBookWasSelected = false;
  let firstBookFollowingLastSelectedBook: string | undefined;
  for (const option of options) {
    const isSelected = (await option.getAttribute('aria-selected')) === 'true';
    if (isSelected) await option.click();

    if (previousBookWasSelected && !isSelected) {
      firstBookFollowingLastSelectedBook = (await option.textContent())!.trim();
    }

    previousBookWasSelected = isSelected;
  }

  const bookToDraft =
    firstBookFollowingLastSelectedBook == null
      ? (await getStep().getByRole('option').first().textContent())!.trim()
      : firstBookFollowingLastSelectedBook;

  await getStep().getByRole('option', { name: bookToDraft }).click();

  await goToNextStepExpectingHeading('Select books to train on');
  await page.getByRole('checkbox', { name: 'New Testament' }).check();

  await goToNextStepExpectingHeading('Advanced');
  await page.getByRole('checkbox', { name: 'Enable Fast Training' }).check();

  await goToNextStepExpectingHeading('Summary');
  await page.getByRole('button', { name: 'Generate draft' }).click();
  const startTime = Date.now();

  await expect(page.getByRole('paragraph')).toContainText('Your project is being synced before queuing the draft.');
  await expect(page.getByRole('heading', { name: 'Draft initializing' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Draft queued' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Draft in progress' })).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole('paragraph', { name: 'Generating draft; this usually takes at least 2.5 hours.' })
  ).toBeVisible({ timeout: 60_000 });

  // Completion
  await expect(page.getByRole('heading', { name: 'Your draft is ready' })).toBeVisible({ timeout: 60_000 * 5 });
  console.log('Draft generation took', (Date.now() - startTime) / 1000 / 60, 'minutes');
  await page.getByRole('button', { name: 'Serval administration' }).click();
  await page.getByRole('button', { name: 'Run webhook to update draft status' }).click();
  await page.getByRole('button', { name: 'Serval administration' }).click();
  await page.getByRole('button', { name: bookToDraft }).click();
});
