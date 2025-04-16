import { expect } from 'npm:@playwright/test';
import { Locator, Page } from 'npm:playwright';
import { DEFAULT_PROJECT_SHORTNAME, preset, ScreenshotContext } from '../e2e-globals.ts';
import {
  deleteProject,
  enableDeveloperMode,
  ensureJoinedOrConnectedToProject,
  ensureNavigatedToProject,
  installMouseFollower,
  isProjectJoined,
  logInAsPTUser,
  logOut,
  screenshot,
  switchLanguage
} from '../e2e-utils.ts';
import { UserEmulator } from '../user-emulator.mts';

export async function generateDraft(
  page: Page,
  context: ScreenshotContext,
  credentials: { email: string; password: string }
): Promise<void> {
  await logInAsPTUser(page, credentials);
  await switchLanguage(page, 'en');
  if (preset.showArrow) await installMouseFollower(page);
  await page.waitForTimeout(500);
  const user = new UserEmulator(page);

  if (await isProjectJoined(page, DEFAULT_PROJECT_SHORTNAME)) {
    await deleteProject(page, DEFAULT_PROJECT_SHORTNAME);
  }

  await ensureJoinedOrConnectedToProject(page, DEFAULT_PROJECT_SHORTNAME);
  await ensureNavigatedToProject(page, DEFAULT_PROJECT_SHORTNAME);

  await enableDeveloperMode(page, { closeMenu: true });

  await user.click(page.getByRole('link', { name: 'Generate draft beta' }));
  await expect(page.getByRole('heading', { name: 'Generate translation drafts' })).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft', ...context });
  await user.wait(1500);

  // Enable pre-translation drafting, then close the panel
  await user.click(page.getByRole('button', { name: 'Serval administration' }));
  await user.check(page.getByRole('checkbox', { name: 'Pre-Translation Drafting Enabled' }));
  await user.click(page.getByRole('button', { name: 'Serval administration' }));

  await user.info('Step 1: Configure sources');

  // Configure sources page
  await user.click(page.getByRole('button', { name: 'Configure sources' }));
  await screenshot(page, { pageName: 'configure_sources_initial', ...context });

  await user.click(page.getByRole('combobox'));
  await user.type('ntv');
  await user.click(page.getByRole('option', { name: 'NTV - Nueva Traducción' }));
  await user.click(page.getByRole('button', { name: 'Next' }));
  await user.click(page.getByRole('combobox').first());
  await user.type('ntv');
  await user.click(page.getByRole('option', { name: 'NTV - Nueva Traducción' }));
  await user.click(page.getByRole('button', { name: 'Add another reference project' }));
  await user.click(page.getByRole('combobox').last());
  await user.type('dhh94');
  await user.click(page.getByRole('option', { name: 'DHH94 - Spanish: Dios Habla' }));
  await user.click(page.getByRole('button', { name: 'Next' }));
  await user.check(page.getByRole('checkbox', { name: 'All the language codes are' }));
  await screenshot(page, { pageName: 'configure_sources_final', ...context });
  await user.click(page.getByRole('button', { name: 'Save & sync' }));
  await user.click(page.getByRole('button', { name: 'Close' }));

  // The stepper renders every step to the page at once, so we need to keep track of which step we're on
  let currentStep = 0;
  function getStep(): Locator {
    return page.locator(`#cdk-step-content-0-${currentStep}`);
  }
  async function goToNextStepExpectingHeading(expectedHeading: string): Promise<void> {
    await user.click(getStep().getByRole('button', { name: 'Next' }));
    currentStep++;
    await expect(getStep().getByRole('heading', { name: expectedHeading })).toBeVisible();
    await user.wait(1500);
  }

  // Draft generation page
  await user.click(page.getByRole('button', { name: 'Generate draft' }));
  await expect(page.getByRole('heading', { name: 'Review draft setup' })).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft_confirm_sources', ...context });

  await goToNextStepExpectingHeading('Select books to draft');
  await expect(getStep().getByRole('option')).toHaveCount(66);
  const options = await getStep().getByRole('option').all();

  let previousBookWasSelected = false;
  let firstBookFollowingLastSelectedBook: string | undefined;
  for (const option of options) {
    const isSelected = (await option.getAttribute('aria-selected')) === 'true';
    if (isSelected) await user.click(option);

    if (previousBookWasSelected && !isSelected) {
      firstBookFollowingLastSelectedBook = (await option.textContent())!.trim();
    }

    previousBookWasSelected = isSelected;
  }

  const bookToDraft = firstBookFollowingLastSelectedBook == null ? 'Obadiah' : firstBookFollowingLastSelectedBook;

  await user.click(getStep().getByRole('option', { name: bookToDraft }));
  await screenshot(page, { pageName: 'generate_draft_select_books_to_draft', ...context });

  await goToNextStepExpectingHeading('Select books to train on');
  await user.check(page.getByRole('checkbox', { name: 'New Testament' }));
  await screenshot(page, { pageName: 'generate_draft_select_books_to_train', ...context });

  await goToNextStepExpectingHeading('Advanced');
  await user.check(page.getByRole('checkbox', { name: 'Enable Fast Training' }));
  await screenshot(page, { pageName: 'generate_draft_advanced_settings', ...context });

  await goToNextStepExpectingHeading('Summary');
  await page.waitForTimeout(400);
  await screenshot(page, { pageName: 'generate_draft_summary', ...context });
  await user.click(page.getByRole('button', { name: 'Generate draft' }));
  const startTime = Date.now();
  console.log('Draft started');

  await expect(page.getByRole('paragraph')).toContainText('Your project is being synced before queuing the draft.');
  await expect(page.getByRole('heading', { name: 'Draft initializing' })).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft_initializing', ...context });
  await expect(page.getByRole('heading', { name: 'Draft queued' })).toBeVisible({ timeout: 60_000 });
  await screenshot(page, { pageName: 'generate_draft_queued', ...context });
  await expect(page.getByRole('heading', { name: 'Draft in progress' })).toBeVisible({ timeout: 5 * 60_000 });
  console.log('UI shows draft in progress after', ((Date.now() - startTime) / 60_000).toFixed(2), 'minutes');
  await screenshot(page, { pageName: 'generate_draft_in_progress', ...context });

  // Make sure the progress is changing
  let progress: number | null = null;
  let letLastProgressChange: number | null = null;
  while (true) {
    // Use allTextContents so it won't crash if the element disappears before we can read it
    // FIXME Sometimes fails with "Execution context was destroyed, most likely because of a navigation"
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
  console.log('Draft generation took', ((Date.now() - startTime) / 60_000).toFixed(2), 'minutes');
  await user.click(page.getByRole('button', { name: 'Serval administration' }));
  await user.click(page.getByRole('button', { name: 'Run webhook to update draft status' }));
  await user.click(page.getByRole('button', { name: 'Serval administration' }));

  // Preview and apply chapter 1
  await user.click(page.getByRole('radio', { name: bookToDraft }));
  await user.click(page.getByRole('button', { name: 'Add to project' }));
  await user.click(page.getByRole('button', { name: 'Overwrite chapter' }));
  await user.click(page.locator('app-tab-header').filter({ hasText: DEFAULT_PROJECT_SHORTNAME }));

  // Go back to generate draft page and apply all chapters
  await user.click(page.getByRole('link', { name: 'Generate draft' }));
  await user.click(page.locator('app-draft-preview-books mat-button-toggle:last-child button'));
  await user.click(page.getByRole('menuitem', { name: 'Add to project' }));
  await user.check(page.getByRole('checkbox', { name: /I understand the draft will overwrite .* in .* project/ }));
  await user.click(page.getByRole('button', { name: 'Add to project' }));
  await expect(
    page.getByRole('heading', { name: `Successfully applied all chapters to ${bookToDraft}` })
  ).toBeVisible();
  await user.click(page.getByRole('button', { name: 'Close' }));

  await screenshot(page, { pageName: 'generate_draft_add_to_project', ...context });

  await logOut(page);
}
