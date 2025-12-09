import { expect } from 'npm:@playwright/test';
import { Page } from 'npm:playwright';
import { preset, ScreenshotContext } from '../e2e-globals.ts';
import {
  enableFeatureFlag,
  freshlyConnectProject,
  installMouseFollower,
  logInAsPTUser,
  logOut,
  screenshot,
  switchLanguage
} from '../e2e-utils.ts';
import { UserEmulator } from '../user-emulator.mts';

/**
 * E2E: Fill and submit the Draft Signup form.
 * This uses hard-coded configuration values to drive the form.
 */

// ---- Configuration ----
const SIGNUP_PROJECT_SHORT_NAME = 'SEEDSP2';
const INCLUDE_BACK_TRANSLATION = true; // set to false to skip BT section
const REFERENCE_PROJECT_COUNT = 2; // 1..3
const COMPLETED_BOOKS = ['Mark']; // books shown in the current project
const NEXT_BOOKS_TO_DRAFT = ['Obadiah', 'Jonah']; // any canonical OT/NT books

export async function submitDraftSignupForm(
  page: Page,
  context: ScreenshotContext,
  credentials: { email: string; password: string }
): Promise<void> {
  await logInAsPTUser(page, credentials);
  await switchLanguage(page, 'en');
  if (preset.showArrow) await installMouseFollower(page);
  const user = new UserEmulator(page);

  await enableFeatureFlag(page, 'Show in-app draft signup form instead of external link');

  // Ensure project exists and is connected for this user
  await freshlyConnectProject(page, SIGNUP_PROJECT_SHORT_NAME);

  // Enable developer mode to expose dev-only helpers if needed

  // Navigate to Generate draft area, where the signup form lives
  await user.click(page.getByRole('link', { name: 'Generate draft' }));
  await expect(page.getByRole('heading', { name: 'Generate translation drafts' })).toBeVisible();
  await screenshot(page, { pageName: 'signup_generate_draft_home', ...context });

  // If a direct link or button exists to open the signup form, click it; otherwise fallback to URL navigation
  let openedSignup = false;
  const possibleOpeners = [
    page.getByRole('button', { name: /Sign up/i }),
    page.getByRole('link', { name: /Sign up/i })
  ];
  for (const opener of possibleOpeners) {
    if (await opener.isVisible().catch(() => false)) {
      await user.click(opener);
      openedSignup = true;
      break;
    }
  }

  if (!openedSignup) {
    // Fallback: try navigating directly via URL route commonly used for signup
    // This is resilient if the UI entry point name changes.
    const projectTab = page.locator('app-tab-header').filter({ hasText: SIGNUP_PROJECT_SHORT_NAME });
    if (await projectTab.isVisible().catch(() => false)) await user.click(projectTab);

    // Guess common route path for the signup form
    await page.goto(`/projects/${SIGNUP_PROJECT_SHORT_NAME}/draft-generation/signup`).catch(() => {});
  }

  // Verify we are on the signup form deterministically
  const formRoot = page.locator('form.signup-form');
  await expect(formRoot).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign up for draft generation' })).toBeVisible();
  await screenshot(page, { pageName: 'signup_form_loaded', ...context });

  // Directly locate each field without scoping to sections

  // Contact Information
  const nameField = page.getByRole('textbox', { name: 'Name', exact: true });
  await user.click(nameField);
  await user.clearField(nameField);
  await user.type('Test User');
  const emailField = page.getByRole('textbox', { name: 'Email' });
  await user.click(emailField);
  await user.clearField(emailField);
  await user.type('tester@example.org');
  const orgField = page.getByRole('textbox', { name: 'Your organization' });
  await user.click(orgField);
  await user.type('Test Org');
  const partnerCombo = page.getByRole('combobox', { name: 'Select partner organization' });
  await user.click(partnerCombo);
  const partnerNone = page.getByRole('option', { name: 'None of the above' });
  await user.click(partnerNone);

  // Project Information: translation language
  await user.click(page.getByRole('textbox', { name: 'Language name' }));
  await user.type('Some language');
  await user.click(page.getByRole('textbox', { name: 'Language ISO code' }));
  await user.type('unk');
  const completedBookSelection = page
    .locator('mat-card')
    .filter({ hasText: 'Completed books' })
    .locator('app-book-multi-select');
  for (const book of COMPLETED_BOOKS) {
    await user.click(completedBookSelection.getByRole('option', { name: book }));
  }

  // Reference Projects section - primary + optional secondary/additional
  await selectReferenceProjects(page, user, REFERENCE_PROJECT_COUNT);

  // Drafting source project (required)
  await selectProjectByFieldName(page, user, 'Select source text for drafting', 'NTV');

  // Planned books to draft next
  const plannedBooksSelection = page
    .locator('mat-card')
    .filter({ hasText: 'Planned for Translation' })
    .locator('app-book-multi-select');
  for (const book of NEXT_BOOKS_TO_DRAFT) {
    await user.click(plannedBooksSelection.getByRole('option', { name: book }));
  }

  // Back Translation section (optional)
  if (INCLUDE_BACK_TRANSLATION) {
    const btStage = page.getByRole('combobox', { name: 'Do you have a written back translation?' });
    await user.click(btStage);
    await user.click(page.getByRole('option', { name: 'Yes (Up-to-Date)' }));

    // Back translation project (required when stage is written)
    await selectProjectByFieldName(page, user, 'Select your back translation', 'DHH94');

    const btLangName = page.getByText('Back translation language name');
    await user.click(btLangName);
    await user.type('BT-Lang');
    const btIso = page.getByRole('textbox', { name: 'Back translation language ISO code' });
    await user.click(btIso);
    await user.type('btl');
  } else {
    const btStage = page.getByRole('combobox', { name: 'Do you have a written back translation?' });
    await user.click(btStage);
    await user.click(page.getByRole('option', { name: 'No written back translation' }));
  }

  await screenshot(page, { pageName: 'signup_form_filled', ...context });

  // Submit
  const submitBtn = page.getByRole('button', { name: 'Submit', exact: true });
  await expect(submitBtn).toBeVisible();
  await user.click(submitBtn);

  // Expect success message
  // Success: after submission, the dev-only JSON viewer appears with submitted data
  const devJsonViewer = page.locator('app-dev-only app-json-viewer');
  await expect(devJsonViewer).toBeVisible({ timeout: 60_000 });
  await screenshot(page, { pageName: 'signup_form_submitted', ...context });

  // Log out to clean up session
  await logOut(page);
}

// ---- Helpers ----

async function selectProjectByFieldName(
  page: Page,
  user: UserEmulator,
  name: string,
  projectShortName: string
): Promise<void> {
  await user.click(page.getByRole('combobox', { name }));
  await user.type(projectShortName);
  await user.click(page.getByRole('option', { name: `${projectShortName} - ` }));
}

async function selectReferenceProjects(page: Page, user: UserEmulator, count: number): Promise<void> {
  // Primary source project (required)
  await selectProjectByFieldName(page, user, 'First reference project', 'NTV');

  if (count >= 2) {
    await selectProjectByFieldName(page, user, 'Second reference project', 'DHH94');
  }
  if (count >= 3) {
    await selectProjectByFieldName(page, user, 'Third reference project', 'NIV84');
  }
}
