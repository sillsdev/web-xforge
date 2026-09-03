import { expect } from 'npm:@playwright/test';
import { Locator, Page } from 'npm:playwright';
import { E2E_SYNC_DEFAULT_TIMEOUT, preset, ScreenshotContext } from '../e2e-globals.ts';
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

const TARGET_PROJECT_SHORT_NAME = 'SFDDP';
const DRAFTING_SOURCE = { shortName: 'ntv', optionName: 'NTV - Nueva Traducción' };
const SECOND_REFERENCE = { shortName: 'dhh94', optionName: 'DHH94 - Spanish: Dios Habla' };

// Every canonical book with content in the drafting source is offered for drafting (NTV is a complete Bible).
const EXPECTED_DRAFTABLE_BOOK_COUNT = 66;

// A book that is partly translated in the target project. The test drafts some of its untranslated chapters.
const PARTIAL_BOOK_NAME = 'Genesis';
const DRAFT_CHAPTERS = '30-32';
const FIRST_DRAFTED_CHAPTER = 30;
const AN_UNDRAFTED_CHAPTER = 33;
// A book drafted in full, using the default chapter selection. It has only one chapter, so the wizard can never default
// it to a subset of chapters, whatever the target project contains.
const WHOLE_BOOK_NAME = 'Obadiah';

// Books selected for training. The New Testament is complete in the target project. Used to check that the training
// selection is remembered when returning to the wizard.
const TRAINING_NT_BOOKS = ['Matthew', 'Mark'];
// A training book deliberately left unselected. It must still be unselected when returning to the wizard.
const UNSELECTED_TRAINING_BOOK = 'Luke';

const TRAINING_FILES = [
  { path: 'test_data/partial_draft_training_1.tsv', title: 'partial_draft_training_1' },
  { path: 'test_data/partial_draft_training_2.tsv', title: 'partial_draft_training_2' }
];
// Deselected in the wizard, and expected to still be deselected when returning to the wizard.
const DESELECTED_FILE = TRAINING_FILES[1];

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

  await freshlyConnectProject(page, TARGET_PROJECT_SHORT_NAME);

  // Needed for the Echo engine option on the wizard summary step
  await enableDeveloperMode(page, { closeMenu: true });

  await user.click(page.getByRole('link', { name: 'Generate draft' }));
  await expect(page.getByRole('heading', { name: 'Generate translation drafts' })).toBeVisible();

  // Have a Serval admin enable pre-translation drafting on the project
  const siteAdminBrowser = await getNewBrowserForSideWork();
  await logInAsSiteAdmin(siteAdminBrowser.page);
  await enableDraftingOnProjectAsServalAdmin(siteAdminBrowser.page, TARGET_PROJECT_SHORT_NAME);
  await siteAdminBrowser.browser.close();

  await configureSources(page, user, context);

  // Launch a draft of part of one book and all of another
  await user.click(page.getByRole('button', { name: 'Generate draft' }));
  await stepThroughPreface(page, user, context);
  await selectBooksToDraft(page, user, context);
  await selectTrainingData(page, user, context);
  await reviewSummaryAndGenerate(page, user, context);

  await waitForDraftToComplete(page, context);
  await applyOneChapterFromEditor(page, user, context);
  await importDraft(page, user, context);
  // Verify what was actually drafted
  await verifyDraftedChaptersInEditor(page, user);

  // Return to the wizard and verify remembered selections
  await verifyRememberedSelectionsOnReturn(page, user, context);

  await logOut(page);
}

/** Configure the drafting source, two reference projects, and upload two training-data files, then save & sync. */
async function configureSources(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  await user.click(page.getByRole('button', { name: 'Configure sources' }));

  const trainingDataSection = page.locator('mat-card').nth(0);
  const translationDataSection = page.locator('mat-card').nth(1);

  await user.click(trainingDataSection.getByRole('combobox').first());
  await user.type(DRAFTING_SOURCE.shortName);
  await user.click(page.getByRole('option', { name: DRAFTING_SOURCE.optionName }));
  await user.click(page.getByRole('button', { name: 'Add another reference project' }));
  await user.click(trainingDataSection.getByRole('combobox').nth(1));
  await user.type(SECOND_REFERENCE.shortName);
  await user.click(page.getByRole('option', { name: SECOND_REFERENCE.optionName }));

  // Fixtures have a header row; skip it.
  for (const file of TRAINING_FILES) {
    await user.click(page.getByRole('button', { name: 'Upload spreadsheet' }));
    await page.locator('mat-dialog-container input[type="file"]').setInputFiles(file.path);
    await page.getByRole('checkbox', { name: 'Skip first row of data file' }).check();
    await page.locator('#upload-save-btn').click();
    await expect(page.locator('mat-dialog-container')).toHaveCount(0);
  }

  await user.click(translationDataSection.getByRole('combobox'));
  await user.type(DRAFTING_SOURCE.shortName);
  await user.click(page.getByRole('option', { name: DRAFTING_SOURCE.optionName }));

  await user.check(page.getByRole('checkbox', { name: 'All the language codes are correct' }));
  await screenshot(page, { pageName: 'generate_draft_configure_sources', ...context });
  await user.click(page.locator('#save_button'));

  // Saving/syncing can take several minutes on first sync.
  const closeLocator = page.getByRole('button', { name: 'Close' });
  await expect(closeLocator).toBeVisible({ timeout: 5 * 60_000 });
  await user.click(closeLocator);
}

/**
 * The wizard may first ask to sync projects that have changes pending in Paratext. After that (or instead, when nothing
 * is pending) it shows a read-only summary of the configured sources.
 */
async function stepThroughPreface(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  const continueAnyway = page.getByRole('button', { name: 'Continue anyway' });
  const confirmSources = page.locator('app-confirm-sources');
  await expect(confirmSources.or(continueAnyway).first()).toBeVisible();
  if (await continueAnyway.isVisible()) {
    await user.click(continueAnyway);
  }

  await expect(confirmSources).toBeVisible();
  await expect(page.locator('app-confirm-sources')).toContainText(DRAFTING_SOURCE.shortName.toUpperCase());
  await screenshot(page, { pageName: 'generate_draft_preface', ...context });
  await user.click(page.getByRole('button', { name: 'Next' }));
}

/**
 * Select two books to draft. Genesis is partly translated: check that its chapter range defaults to the untranslated
 * chapters, check that an invalid range is rejected, then set the range to DRAFT_CHAPTERS. Obadiah is drafted in full:
 * select it and leave the default selection of all its chapters.
 */
async function selectBooksToDraft(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  await expect(page.getByRole('option', { name: PARTIAL_BOOK_NAME, exact: true })).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(EXPECTED_DRAFTABLE_BOOK_COUNT);
  await user.click(page.getByRole('option', { name: PARTIAL_BOOK_NAME, exact: true }));

  const chapterInput = page.locator('.partial-book-drafting-table .chapter-input input');
  await expect(chapterInput).toBeVisible();

  // By default the chapters to draft are those that have content in the source but not in the target.
  const defaultRange = await chapterInput.inputValue();
  console.log(`Default drafting chapter range for ${PARTIAL_BOOK_NAME}: "${defaultRange}"`);
  expect(defaultRange).toMatch(/-50$/);
  expect(Number.parseInt(defaultRange)).toBeGreaterThan(1);

  await chapterInput.fill('23-21');
  await chapterInput.blur();
  await expect(page.locator('.partial-book-drafting-table .chapter-error')).toHaveCount(1);

  await chapterInput.fill(DRAFT_CHAPTERS);
  await chapterInput.blur();
  await expect(page.locator('.partial-book-drafting-table .chapter-error')).toHaveCount(0);
  await expect(chapterInput).toHaveValue(DRAFT_CHAPTERS);

  await user.click(page.getByRole('option', { name: WHOLE_BOOK_NAME, exact: true }));
  // Genesis is the only book with a chapter input. Obadiah gets none because all of it is drafted.
  await expect(page.locator('.partial-book-drafting-table .chapter-input input')).toHaveCount(1);

  await screenshot(page, { pageName: 'generate_draft_select_books', ...context });
  await user.click(page.getByRole('button', { name: 'Next' }));
}

/**
 * On the training step, select New Testament books in the target project, check they are paired in every reference
 * project, and deselect one training data file.
 */
async function selectTrainingData(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  // Select specific books and leave UNSELECTED_TRAINING_BOOK unselected, so that when returning to the wizard both the
  // selected and the unselected state can be checked.
  const bookSelects = page.locator('app-book-multi-select');
  const targetBookSelect = bookSelects.first();
  for (const book of TRAINING_NT_BOOKS) {
    await user.click(targetBookSelect.getByRole('option', { name: book, exact: true }));
  }

  // Selecting a book in the target project automatically selects it in each reference project.
  const sourceCount = await bookSelects.count();
  expect(sourceCount).toBeGreaterThan(1); // target + at least one training source
  for (let i = 1; i < sourceCount; i++) {
    for (const book of TRAINING_NT_BOOKS) {
      await expectBookSelected(bookSelects.nth(i), book, true);
    }
  }

  // A book can be deselected in one reference project as long as another reference project still has it selected.
  const toggledBook = TRAINING_NT_BOOKS[TRAINING_NT_BOOKS.length - 1];
  const firstSourceSelect = bookSelects.nth(1);
  await user.click(firstSourceSelect.getByRole('option', { name: toggledBook, exact: true }));
  await expectBookSelected(firstSourceSelect, toggledBook, false);
  await user.click(firstSourceSelect.getByRole('option', { name: toggledBook, exact: true }));
  await expectBookSelected(firstSourceSelect, toggledBook, true);

  // Both training data files are selected by default for a project's first draft. Deselect the second one.
  const fileCheckbox = page.locator('.training-data-files').getByRole('checkbox', { name: DESELECTED_FILE.title });
  await expect(fileCheckbox).toBeChecked();
  await user.click(fileCheckbox);
  await expect(fileCheckbox).not.toBeChecked();

  await screenshot(page, { pageName: 'generate_draft_training_data', ...context });
  await user.click(page.getByRole('button', { name: 'Next' }));
}

/** The summary should list both books, the partial one with its chapter range; set the engine and launch. */
async function reviewSummaryAndGenerate(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  await expect(page.locator('.draft-books-list').getByRole('listitem')).toHaveText([
    `${PARTIAL_BOOK_NAME} ${DRAFT_CHAPTERS}`,
    WHOLE_BOOK_NAME
  ]);

  if (ENGINE_MODE === 'echo') {
    await user.check(page.getByRole('checkbox', { name: 'Echo Translation Engine' }));
  } else if (ENGINE_MODE === 'fast') {
    await user.check(page.getByRole('checkbox', { name: 'Fast Training' }));
  }

  await screenshot(page, { pageName: 'generate_draft_summary', ...context });
  await user.click(page.getByRole('button', { name: 'Generate Draft' }));
  console.log('Draft started');
}

/** Wait for the draft to complete, with stall detection. */
async function waitForDraftToComplete(page: Page, context: ScreenshotContext): Promise<void> {
  const startTime = Date.now();
  const progressCardHeader = page.locator('.draft-progress-card mat-card-title');
  await expect(progressCardHeader).toContainText(PARTIAL_BOOK_NAME, { timeout: 60_000 });
  await expect(progressCardHeader).toContainText(WHOLE_BOOK_NAME);

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
  console.log('Draft generation took', ((Date.now() - startTime) / 60_000).toFixed(2), 'minutes');
  await screenshot(page, { pageName: 'generate_draft_completed', ...context });

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

/**
 * Choose formatting options, then open the Genesis draft in the editor and apply its first drafted chapter from there.
 * Because that chapter then has content, the import wizard's overwrite confirmation step is guaranteed to appear in
 * importDraft.
 */
async function applyOneChapterFromEditor(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  // Formatting options must be chosen before the preview and import actions appear.
  await user.click(page.getByRole('button', { name: 'Formatting options' }));
  await user.click(page.getByRole('button', { name: 'Save' }));

  // Obadiah's button is labeled with the book name alone; Genesis's button includes the drafted chapter range.
  await expect(page.getByRole('button', { name: WHOLE_BOOK_NAME, exact: true })).toBeVisible();
  await user.click(page.getByRole('button', { name: `${PARTIAL_BOOK_NAME} ${DRAFT_CHAPTERS}`, exact: true }));

  // The preview opens on the first drafted chapter
  await expectEditorOnChapter(page, PARTIAL_BOOK_NAME, FIRST_DRAFTED_CHAPTER);
  await user.click(page.getByRole('button', { name: 'Add to project' }));
  await user.click(page.getByRole('button', { name: 'Overwrite chapter' }));
  await user.click(page.locator('app-tab-header').filter({ hasText: TARGET_PROJECT_SHORT_NAME }));
  await screenshot(page, { pageName: 'generate_draft_chapter_applied', ...context });

  await user.click(page.getByRole('link', { name: 'Generate draft' }));
}

/** Import the completed draft into the target project, confirming the overwrite of the chapter applied earlier. */
async function importDraft(page: Page, user: UserEmulator, context: ScreenshotContext): Promise<void> {
  await user.click(page.getByRole('button', { name: 'Add to a project' }));
  await user.click(page.getByRole('combobox', { name: 'Choose a project' }));
  await user.type(TARGET_PROJECT_SHORT_NAME);
  await user.click(page.getByRole('option', { name: `${TARGET_PROJECT_SHORT_NAME} -` }));
  await user.click(page.locator('[data-test-id="step-1-next"]'));

  // With more than one drafted book, the wizard asks which to import. Both are checked by default.
  await expect(page.getByRole('heading', { name: 'Confirm books to import' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: `${PARTIAL_BOOK_NAME} ${DRAFT_CHAPTERS}` })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: WHOLE_BOOK_NAME })).toBeChecked();
  await user.click(page.locator('[data-test-id="step-4-next"]'));

  // The chapter applied from the editor already has content, so the overwrite confirmation must appear
  await user.check(page.getByRole('checkbox', { name: /I understand that existing content will be overwritten/ }));
  await user.click(page.locator('[data-test-id="step-5-next"]'));

  await expect(page.getByText('Import complete', { exact: true })).toBeVisible({ timeout: 5 * 60_000 });

  // Finish the wizard through the sync step, as a real user would, so the imported draft lands in the project.
  await user.click(page.locator('[data-test-id="step-6-next"]'));
  await user.click(page.locator('[data-test-id="step-7-sync"]'));
  await expect(page.getByText(`The draft has been imported into ${TARGET_PROJECT_SHORT_NAME}`)).toBeVisible({
    timeout: E2E_SYNC_DEFAULT_TIMEOUT
  });
  await user.click(page.locator('[data-test-id="step-7-done"]'));

  await screenshot(page, { pageName: 'generate_draft_imported', ...context });
}

/**
 * Verify that the first drafted chapter of Genesis has content, that the chapter after the drafted range is still empty,
 * and that Obadiah has content.
 */
async function verifyDraftedChaptersInEditor(page: Page, user: UserEmulator): Promise<void> {
  await user.click(page.getByRole('link', { name: 'Edit & review' }));
  await page.waitForSelector('#sync-icon:not(.sync-in-progress)');

  await selectBookAndChapter(page, user, PARTIAL_BOOK_NAME, FIRST_DRAFTED_CHAPTER);
  await expectEditorOnChapter(page, PARTIAL_BOOK_NAME, FIRST_DRAFTED_CHAPTER);
  await expectVerseHasContent(page, FIRST_DRAFTED_CHAPTER, 1);

  // Confirm the editor is on the expected chapter before checking that it is empty, so that a failed navigation is not
  // mistaken for an empty chapter.
  await selectBookAndChapter(page, user, PARTIAL_BOOK_NAME, AN_UNDRAFTED_CHAPTER);
  await expectEditorOnChapter(page, PARTIAL_BOOK_NAME, AN_UNDRAFTED_CHAPTER);
  const targetEditor = page.locator('app-tab-group:has(#target) .ql-editor').filter({ visible: true });
  await expect(targetEditor).toBeVisible();
  const verseTexts = await targetEditor.locator(`[data-segment^="verse_${AN_UNDRAFTED_CHAPTER}_"]`).allTextContents();
  const versesWithContent = verseTexts.filter(text => text.trim().length > 0);
  expect(versesWithContent).toEqual([]);

  await selectBookAndChapter(page, user, WHOLE_BOOK_NAME, 1);
  await expectEditorOnChapter(page, WHOLE_BOOK_NAME, 1);
  await expectVerseHasContent(page, 1, 1);
}

async function expectVerseHasContent(page: Page, chapter: number, verse: number): Promise<void> {
  const segment = getTargetSegment(page, chapter, verse);
  await expect(segment).toBeVisible();
  expect(((await segment.textContent()) ?? '').trim().length).toBeGreaterThan(0);
}

async function expectEditorOnChapter(page: Page, book: string, chapter: number): Promise<void> {
  const chooser = page.locator('.toolbar app-book-chapter-chooser');
  await expect(chooser.getByRole('combobox').first()).toContainText(book);
  await expect(chooser.getByRole('combobox').last()).toContainText(String(chapter));
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
  // Once a draft exists, the button is labeled "New draft" rather than "Generate draft".
  await user.click(page.getByRole('button', { name: 'New draft' }));

  await stepThroughPreface(page, user, context);

  // The selection of books to draft is intentionally not remembered: no book should be selected on return.
  await expect(page.getByRole('option', { name: PARTIAL_BOOK_NAME, exact: true })).toBeVisible();
  await expect(page.getByRole('option', { selected: true })).toHaveCount(0);
  await expect(page.locator('.partial-book-drafting-table')).toHaveCount(0);
  await user.click(page.getByRole('option', { name: PARTIAL_BOOK_NAME, exact: true }));
  const chapterInput = page.locator('.partial-book-drafting-table .chapter-input input');
  await chapterInput.fill(DRAFT_CHAPTERS);
  await chapterInput.blur();
  await user.click(page.getByRole('button', { name: 'Next' }));

  // The training selection is remembered: the selected books come back selected and the unselected one stays unselected.
  const bookSelects = page.locator('app-book-multi-select');
  const bookSelectCount = await bookSelects.count();
  expect(bookSelectCount).toBeGreaterThan(1); // target + at least one training source
  for (let i = 0; i < bookSelectCount; i++) {
    const bookSelect = bookSelects.nth(i);
    for (const book of TRAINING_NT_BOOKS) {
      await expectBookSelected(bookSelect, book, true);
    }
  }

  await expectBookSelected(bookSelects.first(), UNSELECTED_TRAINING_BOOK, false);

  const fileCheckbox = page.locator('.training-data-files').getByRole('checkbox', { name: DESELECTED_FILE.title });
  await expect(fileCheckbox).not.toBeChecked();

  await screenshot(page, { pageName: 'generate_draft_remembered_selections', ...context });
}

async function expectBookSelected(bookSelect: Locator, book: string, selected: boolean): Promise<void> {
  const option = bookSelect.getByRole('option', { name: book, exact: true });
  if (selected) {
    await expect(option).toHaveAttribute('aria-selected', 'true');
  } else {
    await expect(option).not.toHaveAttribute('aria-selected', 'true');
  }
}

// Editor helpers (mirrors edit-translation.ts)

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
