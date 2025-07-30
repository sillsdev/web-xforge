import { expect } from 'npm:@playwright/test';
import { Locator, Page } from 'npm:playwright';
import { preset, ScreenshotContext } from '../e2e-globals.ts';
import {
  enableDeveloperMode,
  enableDraftingOnProjectAsServalAdmin,
  freshlyConnectProject,
  getNewBrowserForSideWork,
  installMouseFollower,
  logInAsPTUser,
  logInAsSiteAdmin,
  logOut,
  screenshot,
  switchLanguage
} from '../e2e-utils.ts';
import { UserEmulator } from '../user-emulator.mts';

type EngineMode = 'echo' | 'fast';

const ENGINE_MODE: EngineMode = 'echo';
const DRAFT_PROJECT_SHORT_NAME = 'SEEDSP2';

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

  await freshlyConnectProject(page, DRAFT_PROJECT_SHORT_NAME);

  await enableDeveloperMode(page, { closeMenu: true });

  await user.click(page.getByRole('link', { name: 'Generate draft beta' }));
  await expect(page.getByRole('heading', { name: 'Generate translation drafts' })).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft', ...context });

  // Have Serval admin enable pre-translation drafting
  const siteAdminBrowser = await getNewBrowserForSideWork();
  await logInAsSiteAdmin(siteAdminBrowser.page);
  await enableDraftingOnProjectAsServalAdmin(siteAdminBrowser.page, DRAFT_PROJECT_SHORT_NAME);

  // Configure sources page
  await user.click(page.getByRole('button', { name: 'Configure sources' }));
  await screenshot(page, { pageName: 'configure_sources_initial', ...context });

  // Step 1: Reference projects
  await user.click(page.getByRole('combobox').first());
  await user.type('ntv');
  await user.click(page.getByRole('option', { name: 'NTV - Nueva Traducción' }));
  await user.click(page.getByRole('button', { name: 'Add another reference project' }));
  await user.click(page.getByRole('combobox').last());
  await user.type('dhh94');
  await user.click(page.getByRole('option', { name: 'DHH94 - Spanish: Dios Habla' }));
  await user.click(page.getByRole('button', { name: 'Next' }));

  // Step 2: Source project
  await user.click(page.getByRole('combobox'));
  await user.type('ntv');
  await user.click(page.getByRole('option', { name: 'NTV - Nueva Traducción' }));
  await user.click(page.getByRole('button', { name: 'Next' }));

  // Step 3: Main project and other training data
  await user.check(page.getByRole('checkbox', { name: 'All the language codes are correct' }));
  await screenshot(page, { pageName: 'configure_sources_final', ...context });
  await user.click(page.getByRole('button', { name: 'Save & sync' }));

  // Wait for changes to be fully saved, which can take some time if the projects have never synced before
  const closeLocator = page.getByRole('button', { name: 'Close' });
  await expect(closeLocator).toBeVisible({ timeout: 5 * 60_000 });
  await user.click(closeLocator);

  // The stepper renders every step to the page at once. Get the step we're on.
  function getStep(): Locator {
    return page.locator('.mat-horizontal-stepper-content-current');
  }
  async function goToNextStepExpectingHeading(expectedHeading: string): Promise<void> {
    await user.click(getStep().getByRole('button', { name: 'Next' }));
    await expect(getStep().getByRole('heading', { name: expectedHeading })).toBeVisible();
    await user.wait(1500);
  }

  // Draft generation page
  await user.click(page.getByRole('button', { name: 'Generate draft' }));
  await expect(page.getByRole('heading', { name: 'Review draft setup' })).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft_confirm_sources', ...context });

  await goToNextStepExpectingHeading('Select books to draft');
  await expect(getStep().getByRole('option')).toHaveCount(3);
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
  if (ENGINE_MODE === 'echo') await user.check(page.getByRole('checkbox', { name: 'Use Echo Translation Engine' }));
  else if (ENGINE_MODE === 'fast') await user.check(page.getByRole('checkbox', { name: 'Enable Fast Training' }));

  await screenshot(page, { pageName: 'generate_draft_advanced_settings', ...context });

  await goToNextStepExpectingHeading('Summary');
  await page.waitForTimeout(400);
  await screenshot(page, { pageName: 'generate_draft_summary', ...context });
  await user.click(page.getByRole('button', { name: 'Generate draft' }));
  const startTime = Date.now();
  console.log('Draft started');

  const progressCard = page.locator('.draft-progress-card');
  const progressCardHeader = progressCard.locator('mat-card-title');

  // Initializing
  await expect(progressCardHeader).toContainText('Draft initializing');
  await expect(progressCardHeader).toContainText(bookToDraft);
  await screenshot(page, { pageName: 'generate_draft_initializing', ...context });

  // Queued
  await expect(progressCardHeader).toContainText('Draft queued', { timeout: 60_000 });
  await expect(progressCardHeader).toContainText(bookToDraft);
  await screenshot(page, { pageName: 'generate_draft_queued', ...context });

  // The draft ready message shouldn't show up until after progress messages, but echo jobs can run too fast for
  // progress messages to appear.
  const draftReadyLocator = page.getByRole('heading', { name: 'The draft is ready' });

  // Wait for the draft to start - timeout is long because there can be another job in the queue
  const inProgressTimeout = ENGINE_MODE === 'echo' ? 3 * 60_000 : 15 * 60_000;
  await expect(page.getByRole('heading', { name: 'Draft in progress' }).or(draftReadyLocator)).toBeVisible({
    timeout: inProgressTimeout
  });
  console.log('UI shows draft in progress after', ((Date.now() - startTime) / 60_000).toFixed(2), 'minutes');
  await screenshot(page, { pageName: 'generate_draft_in_progress', ...context });

  // Make sure the progress is changing
  let progress: number | null = null;
  let lastProgressChange: number | null = null;
  while (!(await draftReadyLocator.isVisible())) {
    // Use allTextContents so it won't crash if the element disappears before we can read it
    // FIXME Sometimes fails with "Execution context was destroyed, most likely because of a navigation"
    const currentProgressText = (await page.locator('circle-progress').allTextContents())[0];
    if (currentProgressText == null) break;

    const currentProgress = Number.parseInt(currentProgressText);
    if (progress !== currentProgress) {
      lastProgressChange = Date.now();
      progress = currentProgress;
    }
    // If the progress hasn't changed in a while, throw an error
    const progressChangeTimeoutMinutes = 3;
    if (lastProgressChange != null && Date.now() - lastProgressChange > 60_000 * progressChangeTimeoutMinutes) {
      throw new Error(
        `Draft progress stalled at ${progress}% and unchanged in ${progressChangeTimeoutMinutes} minutes.`
      );
    }
    await page.waitForTimeout(100);
  }

  // Completion
  await expect(draftReadyLocator).toBeVisible();
  await screenshot(page, { pageName: 'generate_draft_completed', ...context });
  console.log('Draft generation took', ((Date.now() - startTime) / 60_000).toFixed(2), 'minutes');

  // FIXME(application-bug) If we don't reload the page at this step, the page freezes, especially on lower-end machines
  // (including GitHub actions) while attempting to click on the name of the book to draft.
  // The reload also serves to trigger the update of the draft status
  await page.reload();

  // Preview and apply chapter 1
  await user.click(page.getByRole('radio', { name: bookToDraft }));
  await user.click(page.getByRole('button', { name: 'Add to project' }));
  await user.click(page.getByRole('button', { name: 'Overwrite chapter' }));
  await user.click(page.locator('app-tab-header').filter({ hasText: DRAFT_PROJECT_SHORT_NAME }));

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
