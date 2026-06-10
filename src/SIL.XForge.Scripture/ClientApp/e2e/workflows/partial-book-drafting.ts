import { expect } from 'npm:@playwright/test';
import { Locator, Page } from 'npm:playwright';
import { E2E_SYNC_DEFAULT_TIMEOUT, preset, ScreenshotContext } from '../e2e-globals.ts';
import {
  enableDeveloperMode,
  enableDraftingOnProjectAsServalAdmin,
  enableExperimentalFeature,
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

// Echo is fast and deterministic, so it's the default for CI. Switch to 'fast' to exercise a real (slow) training run.
const ENGINE_MODE: EngineMode = 'echo';

// The target project (created manually on the Paratext registry, shared with e2e PT user 1 as administrator):
// New Testament complete, Genesis ~1-20 translated and 21-50 present-but-empty. This shape makes Genesis eligible for
// partial drafting (drafting source has >=12 chapters with content, target has >=1 chapter with content) and gives a
// meaningful "untranslated tail" default.
const TARGET_PROJECT_SHORT_NAME = 'SFDDP';

// Full-Bible references reused from the existing draft test. NTV is the drafting source (full Genesis => Genesis is
// partial-eligible); NTV + DHH94 are training reference projects.
const DRAFTING_SOURCE = { shortName: 'ntv', optionName: 'NTV - Nueva Traducción' };
const SECOND_REFERENCE = { shortName: 'dhh94', optionName: 'DHH94 - Spanish: Dios Habla' };

const EXPERIMENTAL_FEATURE_NAME = 'Enable chapter-level drafting & training';

// The book we draft a partial range of. Chapters 30-32 sit safely inside the untranslated tail regardless of the exact
// seed boundary (~20), so they are empty in the target before drafting and unambiguous to verify afterward.
const PARTIAL_BOOK_NAME = 'Genesis';
const DRAFT_CHAPTERS = '30-32';
const DRAFTED_CHAPTER = 30; // expected to have draft content after import
const UNDRAFTED_CHAPTER = 33; // immediately outside the drafted range; must remain empty

// Whole books we train on from the (complete) New Testament, to verify training-book persistence on return.
const TRAINING_NT_BOOKS = ['Matthew', 'Mark'];

const TRAINING_FILES = [
  { path: 'test_data/partial_draft_training_1.tsv', title: 'partial_draft_training_1' },
  { path: 'test_data/partial_draft_training_2.tsv', title: 'partial_draft_training_2' }
];
// We deselect the second file in the wizard, then verify on return that the deselection was remembered.
const DESELECTED_FILE = TRAINING_FILES[1];

export async function partialBookDrafting(
  page: Page,
  context: ScreenshotContext,
  credentials: { email: string; password: string }
): Promise<void> {
  await logInAsPTUser(page, credentials);
  await switchLanguage(page, 'en');
  if (preset.showArrow) await installMouseFollower(page);
  await page.waitForTimeout(500);
  const user = new UserEmulator(page);

  await freshlyConnectProject(page, TARGET_PROJECT_SHORT_NAME);

  // Developer mode is needed both for the "Generate draft" menu entry and for the Echo toggle in the wizard's
  // developer options.
  await enableDeveloperMode(page, { closeMenu: true });

  // Turn the feature on the way a user would: User menu > Experimental features. The menu item is available because
  // this user is a Paratext administrator on the connected target project.
  await enableExperimentalFeature(page, EXPERIMENTAL_FEATURE_NAME);

  await user.click(page.getByRole('link', { name: 'Generate draft' }));
  await expect(page.getByRole('heading', { name: 'Generate translation drafts' })).toBeVisible();

  // Have a Serval admin enable pre-translation drafting on the project (separate browser/session).
  const siteAdminBrowser = await getNewBrowserForSideWork();
  await logInAsSiteAdmin(siteAdminBrowser.page);
  await enableDraftingOnProjectAsServalAdmin(siteAdminBrowser.page, TARGET_PROJECT_SHORT_NAME);
  await siteAdminBrowser.browser.close();

  await configureSources(page, user, context);

  // ---- Run 1: configure and launch a partial-book draft -------------------------------------------------------------
  await user.click(page.getByRole('button', { name: 'Generate draft' }));

  await stepThroughPreface(page, user, context);
  await selectPartialDraftBook(page, user, context);
  await selectTrainingData(page, user, context);
  await reviewSummaryAndGenerate(page, user, context);

  await waitForDraftToComplete(page, context);

  // ---- Verify what was actually drafted, end to end ----------------------------------------------------------------
  await importDraft(page, user, context);
  await verifyDraftedChaptersInEditor(page, user);

  // ---- Run 2: return to the wizard and verify remembered selections -------------------------------------------------
  await verifyRememberedSelectionsOnReturn(page, user, context);

  await logOut(page);
}

/**
 * Configure the drafting source, two reference projects, and upload two training-data files, then save & sync. Mirrors
 * the configure-sources flow used by the existing generate-draft test, with training-data uploads added.
 */
async function configureSources(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  await user.click(page.getByRole('button', { name: 'Configure sources' }));

  const trainingDataSection = page.locator('mat-card').nth(0);
  const translationDataSection = page.locator('mat-card').nth(1);

  // Reference (training source) projects
  await user.click(trainingDataSection.getByRole('combobox').first());
  await user.type(DRAFTING_SOURCE.shortName);
  await user.click(page.getByRole('option', { name: DRAFTING_SOURCE.optionName }));
  await user.click(page.getByRole('button', { name: 'Add another reference project' }));
  await user.click(trainingDataSection.getByRole('combobox').nth(1));
  await user.type(SECOND_REFERENCE.shortName);
  await user.click(page.getByRole('option', { name: SECOND_REFERENCE.optionName }));

  // Upload the training-data files (each upload dialog handles one file). The fixtures have a header row, so skip it.
  for (const file of TRAINING_FILES) {
    await user.click(page.getByRole('button', { name: 'Upload spreadsheet' }));
    await page.locator('mat-dialog-container input[type="file"]').setInputFiles(file.path);
    await page.getByRole('checkbox', { name: 'Skip first row of data file' }).check();
    await page.locator('#upload-save-btn').click();
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);
  }

  // Drafting (translation) source project
  await user.click(translationDataSection.getByRole('combobox'));
  await user.type(DRAFTING_SOURCE.shortName);
  await user.click(page.getByRole('option', { name: DRAFTING_SOURCE.optionName }));

  await user.check(page.getByRole('checkbox', { name: 'All the language codes are correct' }));
  await screenshot(page, { pageName: 'partial_draft_configure_sources', ...context });
  await user.click(page.locator('#save_button'));

  // Saving/syncing can take a while if the projects have never synced before.
  const closeLocator = page.getByRole('button', { name: 'Close' });
  await expect(closeLocator).toBeVisible({ timeout: 5 * 60_000 });
  await user.click(closeLocator);
}

/** The pre-step (pending updates) may or may not appear; then the read-only source-confirmation preface. */
async function stepThroughPreface(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  // Pre-step: if any involved project has pending Paratext updates, a soft-block interstitial appears first.
  const continueAnyway = page.getByRole('button', { name: 'Continue anyway' });
  if (await continueAnyway.isVisible().catch(() => false)) {
    await user.click(continueAnyway);
  }

  // Preface: embeds the existing confirm-sources component. It should show the source we just configured.
  await expect(page.locator('app-confirm-sources')).toBeVisible();
  await expect(page.locator('app-confirm-sources')).toContainText(DRAFTING_SOURCE.shortName.toUpperCase());
  await screenshot(page, { pageName: 'partial_draft_preface', ...context });
  await user.click(page.getByRole('button', { name: 'Next' }));
}

/** Select Genesis, assert the untranslated-tail default, exercise validation, then narrow to a known sub-range. */
async function selectPartialDraftBook(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  await expect(page.getByRole('option', { name: PARTIAL_BOOK_NAME, exact: true })).toBeVisible();
  await user.click(page.getByRole('option', { name: PARTIAL_BOOK_NAME, exact: true }));

  const chapterInput = page.locator('.partial-book-drafting-table .chapter-input input');
  await expect(chapterInput).toBeVisible();

  // Default = chapters in the source but not the target (the untranslated chapters). With NT-only-translated Genesis,
  // that's the tail of the book: it reaches chapter 50 and excludes the already-translated opening chapters.
  const defaultRange = await chapterInput.inputValue();
  console.log(`Default drafting chapter range for ${PARTIAL_BOOK_NAME}: "${defaultRange}"`);
  expect(defaultRange).toMatch(/-50$/);
  expect(Number.parseInt(defaultRange)).toBeGreaterThan(1);

  // Invalid input surfaces an inline error and does not clear it until fixed.
  await chapterInput.fill('23-21');
  await chapterInput.blur();
  await expect(page.locator('.partial-book-drafting-table .chapter-error')).toBeVisible();

  // Narrow to the range we will verify against.
  await chapterInput.fill(DRAFT_CHAPTERS);
  await chapterInput.blur();
  await expect(page.locator('.partial-book-drafting-table .chapter-error')).toHaveCount(0);
  await expect(chapterInput).toHaveValue(DRAFT_CHAPTERS);

  await screenshot(page, { pageName: 'partial_draft_select_books', ...context });
  await user.click(page.getByRole('button', { name: 'Next' }));
}

/** On the training step: pick target training NT books, per-source books, and deselect one training-data file. */
async function selectTrainingData(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  // Target project training books (the complete NT is available; Genesis 1-20 is also available since only 30-32 is
  // being drafted, but here we deliberately pick whole NT books for a clean persistence check).
  const targetBookSelect = page.locator('app-book-multi-select').first();
  for (const book of TRAINING_NT_BOOKS) {
    await user.click(targetBookSelect.getByRole('option', { name: book, exact: true }));
  }

  // Per training-source book selections: choose the same NT books from each reference project's selector.
  const sourceSelects = page.locator('app-book-multi-select');
  const sourceCount = await sourceSelects.count();
  for (let i = 1; i < sourceCount; i++) {
    for (const book of TRAINING_NT_BOOKS) {
      await user.click(sourceSelects.nth(i).getByRole('option', { name: book, exact: true }));
    }
  }

  // Deselect the second training-data file; both start selected by default for a first build.
  const fileCheckbox = page.locator('.training-data-files').getByRole('checkbox', { name: DESELECTED_FILE.title });
  await expect(fileCheckbox).toBeChecked();
  await user.click(fileCheckbox);
  await expect(fileCheckbox).not.toBeChecked();

  await screenshot(page, { pageName: 'partial_draft_training_data', ...context });
  await user.click(page.getByRole('button', { name: 'Next' }));
}

/** The summary should reflect the partial book selection; set the engine and launch. */
async function reviewSummaryAndGenerate(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  // The summary heading names the book(s) being drafted, including the chapter range.
  await expect(page.locator('.draft-heading')).toContainText(PARTIAL_BOOK_NAME);

  if (ENGINE_MODE === 'echo') {
    await user.check(page.getByRole('checkbox', { name: 'Echo Translation Engine' }));
  } else if (ENGINE_MODE === 'fast') {
    await user.check(page.getByRole('checkbox', { name: 'Fast Training' }));
  }

  await screenshot(page, { pageName: 'partial_draft_summary', ...context });
  await user.click(page.getByRole('button', { name: 'Generate Draft' }));
  console.log('Partial draft started');
}

/** Reuse the progress-monitoring approach from the existing draft test, with stall detection. */
async function waitForDraftToComplete(page: Page, context: ScreenshotContext): Promise<void> {
  const startTime = Date.now();
  const progressCardHeader = page.locator('.draft-progress-card mat-card-title');
  await expect(progressCardHeader).toContainText(PARTIAL_BOOK_NAME, { timeout: 60_000 });

  const draftReadyLocator = page.getByRole('heading', { name: 'The draft is ready' });
  const inProgressTimeout = ENGINE_MODE === 'echo' ? 3 * 60_000 : 15 * 60_000;
  await expect(page.getByRole('heading', { name: 'Draft in progress' }).or(draftReadyLocator)).toBeVisible({
    timeout: inProgressTimeout
  });

  let progress: number | null = null;
  let lastProgressChange: number | null = null;
  while (!(await draftReadyLocator.isVisible())) {
    const currentProgressText = (await page.locator('circle-progress').allTextContents())[0];
    if (currentProgressText == null) break;
    const currentProgress = Number.parseInt(currentProgressText);
    if (progress !== currentProgress) {
      lastProgressChange = Date.now();
      progress = currentProgress;
    }
    const progressChangeTimeoutMinutes = 3;
    if (lastProgressChange != null && Date.now() - lastProgressChange > 60_000 * progressChangeTimeoutMinutes) {
      throw new Error(
        `Draft progress stalled at ${progress}% and unchanged in ${progressChangeTimeoutMinutes} minutes.`
      );
    }
    await page.waitForTimeout(100);
  }

  await expect(draftReadyLocator).toBeVisible();
  console.log('Partial draft generation took', ((Date.now() - startTime) / 60_000).toFixed(2), 'minutes');
  await screenshot(page, { pageName: 'partial_draft_completed', ...context });

  // Reloading triggers the draft-status update and avoids a known freeze on lower-end machines.
  await page.reload();
  let finishing: boolean;
  try {
    await expect(page.getByText('Draft is Finishing')).toBeVisible({ timeout: 15_000 });
    finishing = true;
  } catch {
    finishing = false;
  }
  if (finishing) await expect(page.getByText('Draft is Finishing')).not.toBeVisible({ timeout: 15_000 });
}

/** Run the full import-to-project flow from the completed draft. */
async function importDraft(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  // A completed draft first asks the user to choose formatting options; the import actions (book preview buttons and
  // "Add to a project") only appear afterward.
  await user.click(page.getByRole('button', { name: 'Formatting options' }));
  await user.click(page.getByRole('button', { name: 'Save' }));

  // The completed preview should now offer the drafted book.
  await expect(page.getByRole('button', { name: PARTIAL_BOOK_NAME, exact: true })).toBeVisible();

  await user.click(page.getByRole('button', { name: 'Add to a project' }));
  await user.click(page.getByRole('combobox', { name: 'Choose a project' }));
  await user.type(TARGET_PROJECT_SHORT_NAME);
  await user.click(page.getByRole('option', { name: `${TARGET_PROJECT_SHORT_NAME} -` }));
  // Advance from project selection. When the drafted chapters are empty in the target there is no overwrite step, and
  // this button starts the import directly; otherwise it advances to the overwrite confirmation.
  await user.click(page.locator('[data-test-id="step-1-next"]'));

  // Overwrite confirmation only appears when drafted chapters already have content in the target. We're importing
  // untranslated chapters, so it should be skipped — but handle it defensively in case the seed changes.
  const understand = page.getByRole('checkbox', { name: /I understand that existing content will be overwritten/ });
  if (await understand.isVisible().catch(() => false)) {
    await user.check(understand);
    await user.click(page.locator('[data-test-id="step-5-next"]'));
  }

  await expect(page.getByText('Import complete', { exact: true })).toBeVisible({ timeout: 5 * 60_000 });

  // Finish the wizard through the sync step, as a real user would, so the imported draft lands in the project.
  await user.click(page.locator('[data-test-id="step-6-next"]'));
  await user.click(page.locator('[data-test-id="step-7-sync"]'));
  await expect(page.getByText(`The draft has been imported into ${TARGET_PROJECT_SHORT_NAME}`)).toBeVisible({
    timeout: E2E_SYNC_DEFAULT_TIMEOUT
  });
  await user.click(page.getByRole('button', { name: 'Done' }));

  await screenshot(page, { pageName: 'partial_draft_imported', ...context });
}

/**
 * The strongest "did it draft what I told it?" check: open the target editor and confirm a chapter inside the drafted
 * range now has imported content, while the chapter immediately outside the range remains empty.
 */
async function verifyDraftedChaptersInEditor(page: Page, user: UserEmulator): Promise<void> {
  await user.click(page.getByRole('link', { name: 'Edit & review' }));
  await page.waitForSelector('#sync-icon:not(.sync-in-progress)');

  // A drafted chapter (inside 30-32) should now have content in the target.
  await selectBookAndChapter(page, user, PARTIAL_BOOK_NAME, DRAFTED_CHAPTER);
  const draftedSegment = getTargetSegment(page, DRAFTED_CHAPTER, 1);
  await expect(draftedSegment).toBeVisible();
  expect(((await draftedSegment.textContent()) ?? '').trim().length).toBeGreaterThan(0);

  // The chapter immediately after the drafted range was not drafted, so it must remain empty (no verse content).
  await selectBookAndChapter(page, user, PARTIAL_BOOK_NAME, UNDRAFTED_CHAPTER);
  const undraftedSegment = getTargetSegment(page, UNDRAFTED_CHAPTER, 1);
  const undraftedText = ((await undraftedSegment.textContent().catch(() => '')) ?? '').trim();
  expect(undraftedText.length).toBe(0);
}

/**
 * Returning to generate another draft, the wizard should restore the training selections (training source books,
 * target training books, and training-data file selection) but NOT the drafting book/chapter selection.
 */
async function verifyRememberedSelectionsOnReturn(
  page: Page,
  user: UserEmulator,
  context: ScreenshotContext
): Promise<void> {
  await user.click(page.getByRole('link', { name: 'Generate draft' }));
  // Once a draft exists, the wizard-entry CTA is labeled "New draft" rather than "Generate draft".
  await user.click(page.getByRole('button', { name: 'New draft' }));

  await stepThroughPreface(page, user, context);

  // Drafting selection is intentionally NOT persisted: no book should be pre-selected on return.
  await expect(page.getByRole('option', { name: PARTIAL_BOOK_NAME, exact: true })).toBeVisible();
  await expect(page.locator('.partial-book-drafting-table')).toHaveCount(0);
  // Pick the book again so we can advance to the training step.
  await user.click(page.getByRole('option', { name: PARTIAL_BOOK_NAME, exact: true }));
  const chapterInput = page.locator('.partial-book-drafting-table .chapter-input input');
  await chapterInput.fill(DRAFT_CHAPTERS);
  await chapterInput.blur();
  await user.click(page.getByRole('button', { name: 'Next' }));

  // Training selections ARE persisted: the NT training books and the file deselection should be restored.
  const targetBookSelect = page.locator('app-book-multi-select').first();
  for (const book of TRAINING_NT_BOOKS) {
    await expect(targetBookSelect.getByRole('option', { name: book, exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  }

  const fileCheckbox = page.locator('.training-data-files').getByRole('checkbox', { name: DESELECTED_FILE.title });
  await expect(fileCheckbox).not.toBeChecked();

  await screenshot(page, { pageName: 'partial_draft_remembered_selections', ...context });
}

// ---- Editor helpers (mirrors edit-translation.ts) -----------------------------------------------------------------

function getTargetSegment(page: Page, chapter: number, verse: number): Locator {
  return page
    .locator('app-tab-group:has(#target) .ql-editor')
    .locator(`[data-segment="verse_${chapter}_${verse}"]`)
    .filter({ visible: true });
}

async function selectBookAndChapter(page: Page, user: UserEmulator, book: string, chapter: number): Promise<void> {
  const bookChapterChooser = page.locator('.toolbar app-book-chapter-chooser');
  const bookChooser = bookChapterChooser.getByRole('combobox').first();
  const chapterChooser = bookChapterChooser.getByRole('combobox').last();

  const currentBookText = (await bookChooser.textContent())?.trim() ?? '';
  if (book !== currentBookText) {
    await user.click(bookChooser);
    await user.click(page.getByRole('option', { name: book, exact: true }));
  }

  const currentChapterText = (await chapterChooser.textContent())?.trim() ?? '';
  if (chapter.toString() !== currentChapterText) {
    await user.click(chapterChooser);
    await user.click(page.getByRole('option', { name: chapter.toString(), exact: true }));
  }
}
