import { BrowserType, Page } from 'npm:playwright';
import { expect } from 'npm:playwright/test';
import { DEFAULT_PROJECT_SHORTNAME, ScreenshotContext } from '../e2e-globals.ts';
import {
  createShareLinksAsAdmin,
  deleteProject,
  ensureJoinedOrConnectedToProject,
  ensureNavigatedToProject,
  installMouseFollower,
  isProjectJoined,
  joinWithLink,
  screenshot
} from '../e2e-utils.ts';
import { logInAsPTUser } from '../pt-login.ts';
import { UserEmulator } from '../user.mts';

export async function communityChecking(
  page: Page,
  engine: BrowserType,
  screenshotContext: ScreenshotContext,
  credentials: { email: string; password: string }
): Promise<void> {
  await logInAsPTUser(page, credentials);
  await installMouseFollower(page);
  const user = new UserEmulator(page);

  if (await isProjectJoined(page, DEFAULT_PROJECT_SHORTNAME)) {
    await deleteProject(page, DEFAULT_PROJECT_SHORTNAME);
  }

  await ensureJoinedOrConnectedToProject(page, DEFAULT_PROJECT_SHORTNAME);
  await ensureNavigatedToProject(page, DEFAULT_PROJECT_SHORTNAME);

  // Add an answer
  await user.click(page.getByRole('link', { name: 'Manage questions' }));
  await user.click(page.getByRole('button', { name: 'Add question' }));
  await user.type('JHN 1:1');
  await user.click(page.getByRole('textbox', { name: 'Question' }));
  await user.type('What was in the beginning?');
  await user.click(page.getByRole('button', { name: 'Save' }));

  // Open the expansion panel and edit the question
  await user.click(page.getByRole('button', { name: /John \d+ questions/ }).first());
  await user.click(page.getByRole('button', { name: /John \d+ \d+ questions/ }));
  await user.click(page.getByRole('button').filter({ hasText: 'edit' }).first());
  await user.click(page.getByRole('textbox', { name: 'Question' }));
  await user.clearField(page.getByRole('textbox', { name: 'Question' }));
  await user.type('Who or what was in the beginning?');
  await user.click(page.getByRole('button', { name: 'Save' }));

  // Archive the question so we can import instead
  await user.click(
    page
      .getByRole('button', { name: /John \d+ questions/ })
      .getByRole('button')
      .filter({ hasText: 'archive' })
  );
  await expect(
    page.getByRole('heading', { name: 'Are you sure you want to archive all the questions in John?' })
  ).toBeVisible();
  await user.click(page.getByRole('button', { name: 'Archive' }));

  await user.click(page.getByRole('button', { name: 'Bulk import' }));
  const fileChooserPromise = page.waitForEvent('filechooser');
  await user.click(page.getByRole('button', { name: 'Import from spreadsheet' }));
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('test_data/tq_JHN.tsv');

  await expect(page.getByText('These rows in the CSV file were invalid and will be skipped.')).toBeVisible();
  await user.click(page.getByRole('button', { name: 'Continue import' }));
  await user.check(page.getByRole('checkbox', { name: 'Select All' }));
  const importButtonLocator = page.getByRole('button', { name: /Import \d+ Selected Questions/ });
  const count = Number.parseInt((await importButtonLocator.textContent())!.match(/\d+/)![0]);
  console.log(`Importing ${count} questions`);
  await user.click(importButtonLocator);
  await expect(page.getByRole('heading', { name: /Imported \d+ of \d+ questions/ })).toBeVisible();
  await user.click(page.getByRole('button', { name: /John \d+ questions/ }).first()); // FIXME digest cycle

  await screenshot(page, { pageName: 'community_check_questions_imported', ...screenshotContext });

  await user.click(page.getByRole('link', { name: 'Questions & answers' }));
  await page.waitForTimeout(5000);

  await screenshot(page, { pageName: 'community_check_questions_q_and_a_page', ...screenshotContext });

  const shareLinks = await createShareLinksAsAdmin(page);

  const link = shareLinks['Community Checker'];
  const checkerCount = 3;
  const answerCount = 10;
  const checkerPromises = [];
  const serial = false;
  for (let i = 0; i < checkerCount; i++) {
    const promise = joinAsChecker(link, engine, screenshotContext, i, answerCount);
    checkerPromises.push(promise);
    if (serial) await promise;
  }
  await Promise.all(checkerPromises);

  // Go to Manage questions
  await user.click(page.getByRole('link', { name: 'Manage questions' }));
  await expect(page.locator('.card-content-answer .stat-total')).toContainText(checkerCount * answerCount + '');
}

async function joinAsChecker(
  link: string,
  engine: BrowserType,
  screenshotContext: ScreenshotContext,
  i: number,
  answerCount: number
): Promise<void> {
  const browserContext = await engine.launch({ headless: false });
  const page = await browserContext.newPage();
  await joinWithLink(page, link, `Community checker test user ${i + 1}`);
  await page.waitForURL(/\/projects\/[a-z0-9]+\/checking/);
  await screenshot(page, { pageName: `community_checker_${i + 1}`, ...screenshotContext });

  const user = new UserEmulator(page);

  for (let i = 0; i < answerCount; i++) {
    await user.click(page.getByRole('button', { name: 'Add answer' }));
    await user.type('In the beginning was the Word.');
    await user.click(page.getByRole('button', { name: 'Save' }));
    await screenshot(page, { pageName: 'community_checker_add_answer', ...screenshotContext });
    await user.click(page.getByRole('button', { name: 'Next', exact: true }));
    await page.waitForTimeout(500);
  }
  // Give time for the last answer to be saved
  await page.waitForTimeout(500);
  await browserContext.close();
}
