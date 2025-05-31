import os from 'node:os';
import { BrowserType, Page } from 'npm:playwright';
import { expect } from 'npm:playwright/test';
import { CHECKING_PROJECT_NAME, preset, ScreenshotContext } from '../e2e-globals.ts';
import {
  createShareLinksAsAdmin,
  deleteProject,
  ensureJoinedOrConnectedToProject,
  ensureNavigatedToProject,
  installMouseFollower,
  isProjectConnected,
  joinWithLink,
  logInAsPTUser,
  screenshot
} from '../e2e-utils.ts';
import { UserEmulator } from '../user-emulator.mts';

const questionFileData = Deno.readTextFileSync('test_data/tq_JHN.tsv')
  .split(os.EOL)
  .map(line => line.split('\t'));
const questionColumn = questionFileData[0].indexOf('Question');
const answerColumn = questionFileData[0].indexOf('Response');
if (questionColumn === -1 || answerColumn === -1) {
  throw new Error('TSV header is missing a required header');
}

function getAnswer(question: string | null): string {
  return (
    questionFileData.find(row => row[questionColumn] === question?.trim())?.[answerColumn] ??
    "I don't know how to answer this."
  );
}

export async function communityChecking(
  page: Page,
  engine: BrowserType,
  screenshotContext: ScreenshotContext,
  credentials: { email: string; password: string }
): Promise<void> {
  await logInAsPTUser(page, credentials);
  if (preset.showArrow) await installMouseFollower(page);
  const user = new UserEmulator(page);

  if (await isProjectConnected(page, CHECKING_PROJECT_NAME)) {
    await ensureJoinedOrConnectedToProject(page, CHECKING_PROJECT_NAME);
    await deleteProject(page, CHECKING_PROJECT_NAME);
  }

  await ensureJoinedOrConnectedToProject(page, CHECKING_PROJECT_NAME);
  await ensureNavigatedToProject(page, CHECKING_PROJECT_NAME);
  await user.click(page.getByRole('link', { name: 'Manage questions' }));
  await expect(page.getByText('There are no published questions. Click Add question, above.')).toBeVisible();
  await expect(page.getByText('There are no archived questions.')).toBeVisible();

  // Add an answer
  await user.click(page.getByRole('button', { name: 'Add question' }));
  await user.type('JHN 1:1');
  await user.click(page.getByRole('textbox', { name: 'Question' }));
  await user.type('What was in the beginning?');
  await user.click(page.getByRole('button', { name: 'Save' }));

  // Open the expansion panel and edit the question
  await user.click(page.getByRole('button', { name: /John \d+ questions/ }).first());
  await user.click(page.getByRole('button', { name: /John \d+ \d+ questions/ }).first());
  await user.click(page.getByRole('button').filter({ hasText: 'edit' }).first());

  const editQuestionWarningLocator = page.getByRole('heading', { name: 'This question has an answer.' });
  const questionInputLocator = page.getByRole('textbox', { name: 'Question' });
  await expect(editQuestionWarningLocator.or(questionInputLocator)).toBeVisible();

  if (await editQuestionWarningLocator.isVisible()) {
    await user.click(page.getByRole('button', { name: 'Edit anyway' }));
  }

  await user.click(questionInputLocator);
  await user.clearField(questionInputLocator);
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
  // FIXME(application-bug) We should be able to look for the exact number of questions that should be imported, but the
  // page frequently fails to update after the import is complete. A single digest cycle appears to always fix it.
  await user.click(page.getByRole('button', { name: /John \d+ questions/ }).first());

  await screenshot(page, { pageName: 'community_check_questions_imported', ...screenshotContext });

  await user.click(page.getByRole('link', { name: 'Questions & answers' }));
  await page.waitForTimeout(5000);

  await screenshot(page, { pageName: 'community_check_questions_q_and_a_page', ...screenshotContext });

  const shareLinks = await createShareLinksAsAdmin(page, CHECKING_PROJECT_NAME);

  const link = shareLinks['Community Checker'];
  const checkerCount = 2;
  const answerCount = 5;
  const checkerPromises = [];
  const serial = false;
  for (let i = 0; i < checkerCount; i++) {
    const promise = joinAsChecker(link, engine, screenshotContext, i, answerCount);
    checkerPromises.push(promise);
    if (serial) await promise;
  }
  await Promise.all(checkerPromises);

  // Go to the questions and comment
  await user.click(page.getByRole('link', { name: 'Questions & answers' }));
  await addComment('Thank you for your answer', page, user);

  // Go to Manage questions
  await user.click(page.getByRole('link', { name: 'Manage questions' }));
  await expect(page.locator('.card-content-answer .stat-total')).toContainText(checkerCount * answerCount + '');
  await expect(page.locator('.card-content-comment .stat-total')).toContainText('2');
}

async function joinAsChecker(
  link: string,
  engine: BrowserType,
  screenshotContext: ScreenshotContext,
  userNumber: number,
  answerCount: number
): Promise<void> {
  const browser = await engine.launch({ headless: preset.headless });
  const page = await browser.newPage();

  try {
    await joinWithLink(page, link, `Community checker test user ${userNumber + 1}`);
    await page.waitForURL(/\/projects\/[a-z0-9]+\/checking/);
    await screenshot(page, { pageName: `community_checker_${userNumber + 1}`, ...screenshotContext });

    const user = new UserEmulator(page);

    for (let questionNumber = 0; questionNumber < answerCount; questionNumber++) {
      const questionText = await page.locator('#answer-panel').getByRole('paragraph').textContent();

      await user.click(page.getByRole('button', { name: 'Add answer' }));
      await user.type(getAnswer(questionText));
      await user.click(page.getByRole('button', { name: 'Save' }));
      await screenshot(page, { pageName: 'community_checker_add_answer', ...screenshotContext });

      if (questionNumber === 0 && userNumber === 0) {
        await addComment('This is a nice answer.', page, user);
      }

      // FIXME(application-bug) The Next button is often (always?) disabled when at the end of a chapter. Click the
      // "Next chapter" button instead when the Next button is disabled.
      if (await page.getByRole('button', { name: 'Next', exact: true }).isEnabled()) {
        await user.click(page.getByRole('button', { name: 'Next', exact: true }));
      } else {
        await user.click(page.getByTitle('Next chapter'));
      }

      await page.waitForTimeout(500);
    }
    // Give time for the last answer to be saved
    await page.waitForTimeout(500);
  } catch (e) {
    console.error('Error running tests for checker ' + userNumber);
    console.error(e);
    await screenshot(
      page,
      { ...screenshotContext, pageName: 'test_failure_checker_' + userNumber },
      {},
      { overrideScreenshotSkipping: true }
    );
  } finally {
    await browser.close();
  }
}

async function addComment(text: string, page: Page, user: UserEmulator): Promise<void> {
  const showMoreLocator = page.getByRole('button', { name: /Show \d more unread answers/ });
  const addCommentLocator = page.getByRole('button', { name: 'Add a comment' }).first();
  // Wait until one of the buttons is visible. Both can be visible, so first() is used to prevent a strict mode
  // violation
  await expect(showMoreLocator.or(addCommentLocator).first()).toBeVisible();
  if (await showMoreLocator.isVisible()) await showMoreLocator.click();
  await addCommentLocator.click();
  await user.type(text);
  await user.click(page.getByRole('button', { name: 'Save' }));
}
