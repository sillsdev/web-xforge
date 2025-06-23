import { Locator, Page } from 'npm:playwright';
import { expect } from 'npm:playwright/test';
import { DEFAULT_PROJECT_SHORTNAME, preset, ScreenshotContext } from '../e2e-globals.ts';
import {
  deleteAllTextInSegment,
  deleteProject,
  freshlyConnectProject,
  installMouseFollower,
  logInAsPTUser,
  moveCaretToEndOfSegment,
  switchLanguage
} from '../e2e-utils.ts';
import { UserEmulator } from '../user-emulator.mts';

const NOTE_PRE_CLICK_TIMEOUT = 0;

type Side = 'source' | 'target';

export async function editTranslation(
  page: Page,
  _context: ScreenshotContext,
  credentials: { email: string; password: string }
): Promise<void> {
  await logInAsPTUser(page, credentials);
  await switchLanguage(page, 'en');
  if (preset.showArrow) await installMouseFollower(page);
  const user = new UserEmulator(page);

  await freshlyConnectProject(page, DEFAULT_PROJECT_SHORTNAME, 'NTV');

  // Wait for the sync to finish
  await page.waitForSelector('#sync-icon:not(.sync-in-progress)');

  // Go to the editor
  await user.click(page.getByRole('link', { name: 'Edit & review' }));

  const book = 'Ruth';
  const chapter = 3;
  const verse = 2;
  await selectBookAndChapter(page, user, book, chapter);

  const segment = getSegment(page, 'target', chapter, verse);
  const initialSegmentText = await segment.textContent();

  // Test needs to be run with a clean setup
  expect(initialSegmentText).toBe('This is the initial text of Ruth 3:2 ');

  await user.click(segment);

  await moveCaretToEndOfSegment(page, segment);
  await deleteAllTextInSegment(page, segment);
  const newVerseText =
    'And now is not Boaz of our kindred, with whose maidens thou wast? Behold, he winnoweth barley to night in the threshingfloor.';
  await user.type(newVerseText);

  // Click the new tab button and open the History tab
  await openNewTab(page, user, 'target', 'History');
  await user.click(page.locator('app-history-chooser').getByRole('combobox'));
  // click the second option in the menu
  await user.click(page.getByRole('option').nth(1));
  await user.click(page.getByRole('button', { name: 'Hide changes' }));
  await user.click(page.getByRole('button', { name: 'Show changes' }));

  const insertedSegments = await page.locator('app-editor-history .insert-segment').allTextContents();
  let deletedSegments = await page.locator('app-editor-history .delete-segment').allTextContents();

  // FIXME(application-bug) The history diff includes the verse number of the following verse, even though it was not
  // changed. It shows up as a second element that was deleted, and as an appended character in the inserted segment.
  if (deletedSegments.length === 2 && deletedSegments[1] === '3') {
    deletedSegments = deletedSegments.slice(0, 1); // Remove the verse deletion segment
  }
  if (insertedSegments.length === 1 && insertedSegments[insertedSegments.length - 1] === '3') {
    insertedSegments[0] = insertedSegments[0].slice(0, -1); // Remove the verse insertion
  }

  expect(insertedSegments).toHaveLength(1);
  expect(deletedSegments).toHaveLength(1);
  await expect(insertedSegments[0]).toBe(newVerseText);
  await expect(deletedSegments[0]).toBe(initialSegmentText);

  await user.click(page.getByRole('button', { name: 'Restore this version' }));
  await user.click(page.getByRole('button', { name: 'Restore' }));

  // Go back to the editor tab
  await goToProjectTab(page, user, 'target', DEFAULT_PROJECT_SHORTNAME);

  // Add a note to the verse
  // FIXME(application-bug) We have to click a *different* verse and then back to the one we want to add a note to
  await user.click(getSegment(page, 'target', chapter, verse + 1));
  await user.click(segment);
  await user.click(page.getByRole('button', { name: 'Add Comment' }));
  await page.getByRole('textbox', { name: 'Your comment' }).click();
  await page.getByRole('textbox', { name: 'Your comment' }).fill('How do you like my translation of this verse?');
  await user.click(page.getByRole('radio', { name: 'Save' }));

  // Open the note and edit it
  await openNote(page, user, 'target', chapter, 2);
  await user.click(page.getByRole('button').filter({ hasText: 'edit' }));
  await user.click(page.getByRole('textbox', { name: 'Your comment' }));
  await page
    .getByRole('textbox', { name: 'Your comment' })
    .fill("How do you like my translation of this verse? Do you think it's too archaic?");
  await user.click(page.getByRole('radio', { name: 'Save' }));

  // Add a followup comment on the note thread
  await openNote(page, user, 'target', chapter, 2);
  await user.click(page.getByRole('textbox', { name: 'Your comment' }));
  await page.getByRole('textbox', { name: 'Your comment' }).fill('Here is a followup comment.');
  await user.click(page.getByRole('radio', { name: 'Save' }));

  // Resolve the note thread
  await openNote(page, user, 'target', chapter, 2);
  await user.click(page.getByRole('textbox', { name: 'Your comment' }));
  await page.getByRole('textbox', { name: 'Your comment' }).fill('Resolving this now.');
  await user.click(page.getByRole('presentation').filter({ hasText: 'expand_less' }));
  await user.click(page.getByRole('menuitem', { name: 'Save and resolve' }));
  await user.click(page.getByRole('radio', { name: 'Save and resolve' }));

  // Add a resource to the project
  await openNewTab(page, user, 'source', 'Resource...');
  await user.click(page.getByRole('combobox', { name: 'Project or resource' }));
  await page.getByRole('combobox', { name: 'Project or resource' }).fill('dhh94');
  await user.click(page.getByRole('option', { name: 'DHH94 - ' }));
  await user.click(page.getByRole('button', { name: 'Select' }));

  // Swap the source and target sides
  await user.click(page.getByRole('button', { name: 'Swap source and target' }));

  // Delete the project so edits don't persist and cloud the history
  await deleteProject(page, DEFAULT_PROJECT_SHORTNAME);
}

function getEditor(page: Page, side: Side): Locator {
  return page.locator(`app-tab-group:has(#${side}) .ql-editor`);
}

function getSegment(page: Page, side: Side, chapter: number, verse: number): Locator {
  // Background tabs are still in the DOM, so we need to filter by visibility
  return getEditor(page, side).locator(`[data-segment="verse_${chapter}_${verse}"]`).filter({ visible: true });
}

async function openNote(page: Page, user: UserEmulator, side: Side, chapter: number, verse: number): Promise<void> {
  // FIXME(application-bug) we shouldn't have to wait
  const noteLocator = getSegment(page, side, chapter, verse).locator('display-note');
  await noteLocator.waitFor({ state: 'attached' });
  await page.waitForTimeout(NOTE_PRE_CLICK_TIMEOUT / 10);
  await noteLocator.waitFor({ state: 'attached' });
  await user.click(noteLocator);
}

async function openNewTab(page: Page, user: UserEmulator, side: Side, tabName: string): Promise<void> {
  await user.click(getTab(page, side, 'add'));
  await user.click(page.getByRole('menuitem', { name: tabName }));
}

function getTab(page: Page, side: Side, tabName: string): Locator {
  return page.locator(`#${side} app-tab-header`).filter({ hasText: tabName });
}

async function selectBookAndChapter(page: Page, user: UserEmulator, book: string, chapter: number): Promise<void> {
  const bookChapterChooser = page.locator('.toolbar app-book-chapter-chooser');
  const bookChoser = bookChapterChooser.getByRole('combobox').first();
  const chapterChoser = bookChapterChooser.getByRole('combobox').last();

  const currentBookText: string = (await bookChoser.textContent())?.trim() ?? '';
  if (book !== currentBookText) {
    await user.click(bookChoser);
    await user.click(page.getByRole('option', { name: book }));
  }

  const currentChapterText: string = (await chapterChoser.textContent())?.trim() ?? '';
  if (chapter.toString() !== currentChapterText) {
    await user.click(chapterChoser);
    await user.click(page.getByRole('option', { name: chapter.toString() }));
  }
}

async function goToProjectTab(page: Page, user: UserEmulator, side: Side, projectShortName: string): Promise<void> {
  // The project/resource tabs differ from history tabs in that they start with the book icon
  await user.click(getTab(page, side, `book ${projectShortName}`));
}
