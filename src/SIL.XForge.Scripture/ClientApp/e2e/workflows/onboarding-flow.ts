import { expect } from 'npm:@playwright/test';
import { BrowserType, Page } from 'npm:playwright';
import { preset, ScreenshotContext } from '../e2e-globals.ts';
import {
  disableFeatureFlag,
  enableFeatureFlag,
  freshlyConnectProject,
  getNewBrowserForSideWork,
  installMouseFollower,
  logInAsPTUser,
  logInAsSiteAdmin,
  screenshot,
  switchLanguage
} from '../e2e-utils.ts';
import { UserEmulator } from '../user-emulator.mts';

/**
 * E2E test for the complete onboarding flow:
 * 1. Regular user fills out and submits the draft signup form
 * 2. Serval admin reviews the submission on the draft requests page
 * 3. Serval admin interacts with the submission on the draft request detail page
 */

// ---- Configuration ----
const SIGNUP_PROJECT_SHORT_NAME = 'SEEDSP2';
const INCLUDE_BACK_TRANSLATION = true;
const REFERENCE_PROJECT_COUNT = 2;
const COMPLETED_BOOKS = ['Mark'];
const NEXT_BOOKS_TO_DRAFT = ['Obadiah', 'Jonah'];

export async function onboardingFlow(
  _engine: BrowserType,
  page: Page,
  context: ScreenshotContext,
  credentials: { email: string; password: string }
): Promise<void> {
  // Part 1: Regular user submits the onboarding form
  await logInAsPTUser(page, credentials);
  await switchLanguage(page, 'en');
  if (preset.showArrow) await installMouseFollower(page);
  const user = new UserEmulator(page);

  await enableFeatureFlag(page, 'Show in-app draft signup form instead of external link');
  await disableFeatureFlag(page, 'Show developer tools');

  // Ensure project exists and is connected for this user
  await freshlyConnectProject(page, SIGNUP_PROJECT_SHORT_NAME);

  // Navigate to Generate draft area, where the signup form lives
  await user.click(page.getByRole('link', { name: 'Generate draft' }));
  await expect(page.getByRole('heading', { name: 'Generate translation drafts' })).toBeVisible();
  await screenshot(page, { pageName: 'onboarding_generate_draft_home', ...context });

  await user.click(page.getByRole('button', { name: /Sign up for drafting/i }));

  // Verify we are on the signup form
  const formRoot = page.locator('form.signup-form');
  await expect(formRoot).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign up for draft generation' })).toBeVisible();
  await screenshot(page, { pageName: 'onboarding_form_loaded', ...context });

  // Fill out the form
  // Contact Information
  const nameField = page.getByRole('textbox', { name: 'Name', exact: true });
  await user.click(nameField);
  await user.clearField(nameField);
  await user.type('E2E Test User');
  const emailField = page.getByRole('textbox', { name: 'Email' });
  await user.click(emailField);
  await user.clearField(emailField);
  await user.type('e2e_tester@example.org');
  const orgField = page.getByRole('textbox', { name: 'Your organization' });
  await user.click(orgField);
  await user.type('E2E Test Organization');
  const partnerCombo = page.getByRole('combobox', { name: 'Select partner organization' });
  await user.click(partnerCombo);
  const partnerNone = page.getByRole('option', { name: 'None of the above' });
  await user.click(partnerNone);

  // Project Information: translation language
  await user.click(page.getByRole('textbox', { name: 'Language name' }));
  await user.type('E2E Test Language');
  await user.click(page.getByRole('textbox', { name: 'Language ISO code' }));
  await user.type('e2e');

  // Completed books
  const completedBookSelection = page
    .locator('mat-card')
    .filter({ hasText: 'Completed books' })
    .locator('app-book-multi-select');
  for (const book of COMPLETED_BOOKS) {
    await user.click(completedBookSelection.getByRole('option', { name: book }));
  }

  // Reference Projects
  await selectReferenceProjects(page, user, REFERENCE_PROJECT_COUNT);

  // Drafting source project
  await selectProjectByFieldName(page, user, 'Select source text for drafting', 'NTV');

  // Planned books to draft next
  const plannedBooksSelection = page
    .locator('mat-card')
    .filter({ hasText: 'Planned for Translation' })
    .locator('app-book-multi-select');
  for (const book of NEXT_BOOKS_TO_DRAFT) {
    await user.click(plannedBooksSelection.getByRole('option', { name: book }));
  }

  // Back Translation section
  if (INCLUDE_BACK_TRANSLATION) {
    const btStage = page.getByRole('combobox', { name: 'Do you have a written back translation?' });
    await user.click(btStage);
    await user.click(page.getByRole('option', { name: 'Yes (Up-to-Date)' }));

    await selectProjectByFieldName(page, user, 'Select your back translation', 'DHH94');

    const btLangName = page.getByText('Back translation language name');
    await user.click(btLangName);
    await user.type('E2E-BT-Lang');
    const btIso = page.getByRole('textbox', { name: 'Back translation language ISO code' });
    await user.click(btIso);
    await user.type('e2b');
  } else {
    const btStage = page.getByRole('combobox', { name: 'Do you have a written back translation?' });
    await user.click(btStage);
    await user.click(page.getByRole('option', { name: 'No written back translation' }));
  }

  await screenshot(page, { pageName: 'onboarding_form_filled', ...context });

  // Submit the form
  const submitBtn = page.getByRole('button', { name: 'Submit', exact: true });
  await expect(submitBtn).toBeVisible();
  await user.click(submitBtn);

  // Expect success message
  await expect(page.getByText('Thank you for signing up!')).toBeVisible();
  await screenshot(page, { pageName: 'onboarding_form_submitted', ...context });

  await user.click(page.getByRole('button', { name: 'Return to draft generation' }));

  await expect(
    page.getByText('A team member will contact you within 1 to 3 business days to discuss your project and next steps.')
  ).toBeVisible();

  // Part 2: Serval admin reviews the submission

  // Open a new browser as Serval admin
  const adminBrowser = await getNewBrowserForSideWork();
  await logInAsSiteAdmin(adminBrowser.page);
  await switchLanguage(adminBrowser.page, 'en');
  if (preset.showArrow) await installMouseFollower(adminBrowser.page);
  const adminUser = new UserEmulator(adminBrowser.page);

  // Navigate to Serval Administration
  await adminBrowser.page
    .locator('header')
    .getByRole('button', { name: 'Test Admin User Scripture Forge E2E' })
    .click();
  await adminUser.click(adminBrowser.page.getByRole('menuitem', { name: 'Serval Administration' }));
  await expect(adminBrowser.page.getByRole('heading', { name: 'Serval Administration' })).toBeVisible();
  await screenshot(adminBrowser.page, { pageName: 'admin_serval_home', ...context });

  // Navigate to Draft Requests tab
  const draftRequestsTab = adminBrowser.page.getByRole('tab', { name: 'Draft Requests' });
  await adminUser.click(draftRequestsTab);
  await expect(adminBrowser.page.getByText('New draft requests start with "New" status')).toBeVisible();
  await screenshot(adminBrowser.page, { pageName: 'admin_draft_requests_list', ...context });

  // Find the newly submitted request
  const requestRow = adminBrowser.page
    .locator('table.requests-table tr')
    .filter({ hasText: SIGNUP_PROJECT_SHORT_NAME });
  await expect(requestRow).toBeVisible();
  await screenshot(adminBrowser.page, { pageName: 'admin_found_request', ...context });

  // Interact with the request in the table - assign it to the admin
  const assigneeSelect = requestRow.locator('mat-select').first();
  await adminUser.click(assigneeSelect);
  await adminUser.click(adminBrowser.page.getByRole('option', { name: 'Me' }));
  await screenshot(adminBrowser.page, { pageName: 'admin_assigned_request', ...context });

  // Click on the request to view details
  const requestLink = requestRow.getByRole('link', { name: SIGNUP_PROJECT_SHORT_NAME });
  await adminUser.click(requestLink);

  // Part 3: Serval admin interacts on the detail page

  // Verify we're on the detail page
  await expect(
    adminBrowser.page.getByRole('heading', { name: `Onboarding request for ${SIGNUP_PROJECT_SHORT_NAME}` })
  ).toBeVisible();
  await screenshot(adminBrowser.page, { pageName: 'admin_request_detail', ...context });

  // Add a comment
  const commentTextarea = adminBrowser.page.getByPlaceholder('Enter your comment here...');
  await adminUser.click(commentTextarea);
  await adminUser.type('This is a test comment from the E2E test.');
  const addCommentBtn = adminBrowser.page.getByRole('button', { name: 'Add Comment' });
  await adminUser.click(addCommentBtn);

  // Wait for the comment to appear
  await expect(adminBrowser.page.getByText('This is a test comment from the E2E test.')).toBeVisible();
  await screenshot(adminBrowser.page, { pageName: 'admin_comment_added', ...context });

  // Approve the request
  await adminUser.click(adminBrowser.page.getByRole('button', { name: 'Approve & Enable' }));
  await adminUser.click(adminBrowser.page.getByRole('button', { name: 'Approve', exact: true })); // Confirm in dialog

  // Verify the user now sees drafting enabled
  await expect(page.getByRole('button', { name: 'Configure sources' })).toBeVisible();

  // Clean up
  await adminBrowser.browser.close();
}

// ---- Helper Functions ----

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
