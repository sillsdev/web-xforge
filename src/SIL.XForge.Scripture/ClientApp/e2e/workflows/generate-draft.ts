import { expect } from 'npm:@playwright/test';
import { Locator, Page } from 'npm:playwright';
import { DEFAULT_PROJECT_SHORTNAME, ScreenshotContext } from '../e2e-globals.ts';
import {
  click,
  deleteProject,
  enableFeatureFlag,
  ensureJoinedOrConnectedToProject,
  ensureNavigatedToProject,
  installMouseFollower,
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
  await installMouseFollower(page);

  if (await isProjectJoined(page, DEFAULT_PROJECT_SHORTNAME)) {
    await deleteProject(page, DEFAULT_PROJECT_SHORTNAME);
  }

  await ensureJoinedOrConnectedToProject(page, DEFAULT_PROJECT_SHORTNAME);
  await ensureNavigatedToProject(page, DEFAULT_PROJECT_SHORTNAME);

  await enableFeatureFlag(page, 'Allow Fast Pre-Translation');

  await click(page, page.getByRole('link', { name: 'Generate draft beta' }));
  await expect(page.getByRole('heading', { name: 'Generate translation drafts' })).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft', ...context });

  // Enable pre-translation drafting, then close the panel
  await click(page, page.getByRole('button', { name: 'Serval administration' }));
  await page.getByRole('checkbox', { name: 'Pre-Translation Drafting Enabled' }).check();
  await click(page, page.getByRole('button', { name: 'Serval administration' }));

  // Configure sources page
  await click(page, page.getByRole('button', { name: 'Configure sources' }));
  await screenshot(page, { pageName: 'configure_sources_initial', ...context });

  await click(page, page.getByRole('combobox'));
  await page.getByRole('combobox').fill('ntv');
  await click(page, page.getByRole('option', { name: 'NTV - Nueva Traducción' }));
  await click(page, page.getByRole('button', { name: 'Next' }));
  await click(page, page.getByRole('combobox').first());
  await page.getByRole('combobox').first().fill('ntv');
  await click(page, page.getByRole('option', { name: 'NTV - Nueva Traducción' }));
  await click(page, page.getByRole('button', { name: 'Add another reference project' }));
  await click(page, page.getByRole('combobox').last());
  await page.getByRole('combobox').last().fill('dhh94');
  await click(page, page.getByRole('option', { name: 'DHH94 - Spanish: Dios Habla' }));
  await click(page, page.getByRole('button', { name: 'Next' }));
  await page.getByRole('checkbox', { name: 'All the language codes are' }).check();
  await screenshot(page, { pageName: 'configure_sources_final', ...context });
  await click(page, page.getByRole('button', { name: 'Save & sync' }));
  await click(page, page.getByRole('button', { name: 'Close' }));

  // The stepper renders every step to the page at once, so we need to keep track of which step we're on
  let currentStep = 0;
  function getStep(): Locator {
    return page.locator(`#cdk-step-content-0-${currentStep}`);
  }
  async function goToNextStepExpectingHeading(expectedHeading: string): Promise<void> {
    await click(page, getStep().getByRole('button', { name: 'Next' }));
    currentStep++;
    await expect(getStep().getByRole('heading', { name: expectedHeading })).toBeVisible();
  }

  // Draft generation page
  await click(page, page.getByRole('button', { name: 'Generate draft' }));
  await expect(page.getByRole('heading', { name: 'Review draft setup' })).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft_confirm_sources', ...context });

  await goToNextStepExpectingHeading('Select books to draft');
  await expect(getStep().getByRole('option')).toHaveCount(66);
  const options = await getStep().getByRole('option').all();

  let previousBookWasSelected = false;
  let firstBookFollowingLastSelectedBook: string | undefined;
  for (const option of options) {
    const isSelected = (await option.getAttribute('aria-selected')) === 'true';
    if (isSelected) await click(page, option);

    if (previousBookWasSelected && !isSelected) {
      firstBookFollowingLastSelectedBook = (await option.textContent())!.trim();
    }

    previousBookWasSelected = isSelected;
  }

  const bookToDraft = firstBookFollowingLastSelectedBook == null ? 'Obadiah' : firstBookFollowingLastSelectedBook;

  await click(page, getStep().getByRole('option', { name: bookToDraft }));
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
  await click(page, page.getByRole('button', { name: 'Generate draft' }));
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
  console.log('Draft generation took', ((Date.now() - startTime) / 1000 / 60).toFixed(2), 'minutes');
  await click(page, page.getByRole('button', { name: 'Serval administration' }));
  await click(page, page.getByRole('button', { name: 'Run webhook to update draft status' }));
  await click(page, page.getByRole('button', { name: 'Serval administration' }));
  await click(page, page.locator('app-draft-preview-books mat-button-toggle:last-child button'));
  await click(page, page.getByRole('menuitem', { name: 'Add to project' }));
  await page.getByRole('checkbox', { name: /I understand the draft will overwrite .* in .* project/ }).check();
  await click(page, page.getByRole('button', { name: 'Add to project' }));
  await screenshot(page, { pageName: 'generate_draft_add_to_project', ...context });
}
