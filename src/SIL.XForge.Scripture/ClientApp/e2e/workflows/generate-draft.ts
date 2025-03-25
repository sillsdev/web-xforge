import { expect } from 'npm:@playwright/test';
import { Locator, Page } from 'npm:playwright';
import { DEFAULT_PROJECT_SHORTNAME, ScreenshotContext } from '../e2e-globals.ts';
import {
  deleteProject,
  enableFeatureFlag,
  ensureJoinedOrConnectedToProject,
  ensureNavigatedToProject,
  isProjectJoined,
  screenshot
} from '../e2e-utils.ts';
import { logInAsPTUser } from '../pt-login.ts';

export async function generateDraft(
  page: Page,
  context: ScreenshotContext,
  user: { email: string; password: string }
): Promise<void> {
  await logInAsPTUser(page, user);

  if (await isProjectJoined(page, DEFAULT_PROJECT_SHORTNAME)) {
    await deleteProject(page, DEFAULT_PROJECT_SHORTNAME);
  }

  await ensureJoinedOrConnectedToProject(page, DEFAULT_PROJECT_SHORTNAME);
  await ensureNavigatedToProject(page, DEFAULT_PROJECT_SHORTNAME);

  await enableFeatureFlag(page, 'Allow Fast Pre-Translation');

  await page.getByRole('link', { name: 'Generate draft beta' }).click();
  await expect(page.getByRole('heading', { name: 'Generate translation drafts' })).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft', ...context });

  // Enable pre-translation drafting, then close the panel
  await page.getByRole('button', { name: 'Serval administration' }).click();
  await page.getByRole('checkbox', { name: 'Pre-Translation Drafting Enabled' }).check();
  await page.getByRole('button', { name: 'Serval administration' }).click();

  // Configure sources page
  await page.getByRole('button', { name: 'Configure sources' }).click();
  await screenshot(page, { pageName: 'configure_sources_initial', ...context });

  await page.getByRole('combobox').click();
  await page.getByRole('combobox').fill('ntv');
  await page.getByRole('option', { name: 'NTV - Nueva Traducción' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('combobox').first().click();
  await page.getByRole('combobox').first().fill('ntv');
  await page.getByRole('option', { name: 'NTV - Nueva Traducción' }).click();
  await page.getByRole('button', { name: 'Add another reference project' }).click();
  await page.getByRole('combobox').last().click();
  await page.getByRole('combobox').last().fill('dhh94');
  await page.getByRole('option', { name: 'DHH94 - Spanish: Dios Habla' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox', { name: 'All the language codes are' }).check();
  await screenshot(page, { pageName: 'configure_sources_final', ...context });
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
  await expect(page.getByRole('heading', { name: 'Review draft setup' })).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft_confirm_sources', ...context });

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

  const bookToDraft = firstBookFollowingLastSelectedBook == null ? 'Obadiah' : firstBookFollowingLastSelectedBook;

  await getStep().getByRole('option', { name: bookToDraft }).click();
  await screenshot(page, { pageName: 'generate_draft_select_books_to_draft', ...context });

  await goToNextStepExpectingHeading('Select books to train on');
  await page.getByRole('checkbox', { name: 'New Testament' }).check();
  await screenshot(page, { pageName: 'generate_draft_select_books_to_train', ...context });

  await goToNextStepExpectingHeading('Advanced');
  await page.getByRole('checkbox', { name: 'Enable Fast Training' }).check();
  await screenshot(page, { pageName: 'generate_draft_advanced_settings', ...context });

  await goToNextStepExpectingHeading('Summary');
  await page.waitForTimeout(400);
  await screenshot(page, { pageName: 'generate_draft_summary', ...context });
  await page.getByRole('button', { name: 'Generate draft' }).click();
  const startTime = Date.now();

  await expect(page.getByRole('paragraph')).toContainText('Your project is being synced before queuing the draft.');
  await expect(page.getByRole('heading', { name: 'Draft initializing' })).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft_initializing', ...context });
  await expect(page.getByRole('heading', { name: 'Draft queued' })).toBeVisible({ timeout: 60_000 });
  await screenshot(page, { pageName: 'generate_draft_queued', ...context });
  await expect(page.getByRole('heading', { name: 'Draft in progress' })).toBeVisible({ timeout: 90_000 });
  await screenshot(page, { pageName: 'generate_draft_in_progress', ...context });

  // Make sure the progress is changing
  let progress: number | null = null;
  let letLastProgressChange: number | null = null;
  while (true) {
    // Use allTextContents so it won't crash if the element disappears before we can read it
    const currentProgressText = (await page.locator('circle-progress').allTextContents())[0];
    if (currentProgressText == null) break;

    const currentProgress = Number.parseInt(currentProgressText);
    if (progress !== currentProgress) {
      letLastProgressChange = Date.now();
      progress = currentProgress;
    }
    // If the progress hasn't changed in a while, throw an error
    const progressChangeTimeoutMinutes = 3;
    if (letLastProgressChange != null && Date.now() - letLastProgressChange > 60_000 * progressChangeTimeoutMinutes) {
      throw new Error(
        `Draft progress stalled at ${progress}% and unchanged in ${progressChangeTimeoutMinutes} minutes.`
      );
    }
    await page.waitForTimeout(100);
  }

  // Completion
  await expect(page.getByText('Your draft is ready')).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft_completed', ...context });
  console.log('Draft generation took', (Date.now() - startTime) / 1000 / 60, 'minutes');
  await page.getByRole('button', { name: 'Serval administration' }).click();
  await page.getByRole('button', { name: 'Run webhook to update draft status' }).click();
  await page.getByRole('button', { name: 'Serval administration' }).click();
  await page.locator('app-draft-preview-books mat-button-toggle:last-child button').click();
  await page.getByRole('menuitem', { name: 'Add to project' }).click();
  await page.getByRole('checkbox', { name: /I understand the draft will overwrite .* in .* project/ }).check();
  await page.getByRole('button', { name: 'Add to project' }).click();
  await screenshot(page, { pageName: 'generate_draft_add_to_project', ...context });
}
