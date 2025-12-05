import { expect } from 'npm:@playwright/test';
import { Locator, Page } from 'npm:playwright';
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
const COMPLETED_BOOKS = ['Genesis', 'Exodus']; // books shown in the current project
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

  // Verify we are on the signup form
  await expect(
    page
      .getByRole('heading', { name: 'Draft signup' })
      .or(page.getByRole('heading', { name: 'Drafting sign up' }))
      .or(page.getByRole('heading', { name: 'Sign up for drafting' }))
      .or(page.getByRole('heading', { name: 'Draft signup form' }))
      .or(page.getByRole('heading', { name: 'Submit draft signup' }))
      .or(page.locator('form.signup-form'))
  ).toBeVisible();
  await screenshot(page, { pageName: 'signup_form_loaded', ...context });

  // Helper: locate form container
  const formRoot = page.locator('form.signup-form');

  // Contact Information
  await user.click(formRoot.getByLabel('Name').or(formRoot.getByPlaceholder('Your full name')));
  await user.type('Test User');
  await user.click(formRoot.getByLabel('Email').or(formRoot.getByPlaceholder('you@example.org')));
  await user.type('tester@example.org');
  await user.click(formRoot.getByLabel('Organization').or(formRoot.getByPlaceholder('Your organization')));
  await user.type('Test Org');
  await user.click(
    formRoot
      .getByRole('combobox')
      .filter({ hasText: /Partner organization/i })
      .first()
      .or(
        formRoot
          .getByLabel('Partner organization')
          .or(formRoot.getByText('Partner organization').locator('..').getByRole('combobox'))
      )
  );
  // Choose a concrete partner or "none"
  // Prefer selecting "none" to avoid dependency on external lists
  const partnerOption = page
    .getByRole('option', { name: /None|none/i })
    .or(page.getByRole('option', { name: 'Seed Company' }));
  await user.click(partnerOption);

  // Project Information: translation language
  await user.click(formRoot.getByLabel('Translation language name').or(formRoot.getByLabel(/language name/i)));
  await user.type('SampleLang');
  await user.click(formRoot.getByLabel('Translation language ISO Code').or(formRoot.getByLabel(/ISO/i)));
  await user.type('smp');

  // Completed books (from project)
  await selectBooksInMultiSelect(formRoot, /*sectionLabel*/ 'Completed books', COMPLETED_BOOKS);

  // Reference Projects section - primary + optional secondary/additional
  await selectReferenceProjects(formRoot, REFERENCE_PROJECT_COUNT);

  // Drafting source project (required)
  await selectProjectByPlaceholder(formRoot, /Drafting source project/i, 'NTV');

  // Planned books to draft next
  await selectBooksInMultiSelect(formRoot, /*sectionLabel*/ 'Planned books', NEXT_BOOKS_TO_DRAFT);

  // Back Translation section (optional)
  if (INCLUDE_BACK_TRANSLATION) {
    await user.click(
      formRoot
        .getByRole('combobox', { name: /Back translation stage/i })
        .or(formRoot.getByLabel(/Back translation stage/i))
    );
    await user.click(page.getByRole('option', { name: /Written \(Up-to-Date\)/i }));

    // Back translation project (required when stage is written)
    await selectProjectByPlaceholder(formRoot, /Back translation project/i, 'DHH94');

    await user.click(formRoot.getByLabel(/Back translation language name/i));
    await user.type('BT-Lang');
    await user.click(formRoot.getByLabel(/Back translation ISO Code/i));
    await user.type('btl');
  } else {
    await user.click(
      formRoot
        .getByRole('combobox', { name: /Back translation stage/i })
        .or(formRoot.getByLabel(/Back translation stage/i))
    );
    await user.click(page.getByRole('option', { name: /No written back translation/i }));
  }

  await screenshot(page, { pageName: 'signup_form_filled', ...context });

  // Submit
  const submitBtn = formRoot
    .getByRole('button', { name: /Submit/i })
    .or(formRoot.getByRole('button', { name: /Send/i }));
  await user.click(submitBtn);

  // Expect success message
  const successHeading = page
    .getByRole('heading', { name: /Thanks|Success|Submission/i })
    .or(page.getByRole('heading', { name: /submission success/i }));
  await expect(successHeading).toBeVisible({ timeout: 60_000 });
  await screenshot(page, { pageName: 'signup_form_submitted', ...context });

  // Log out to clean up session
  await logOut(page);
}

// ---- Helpers ----

async function selectProjectByPlaceholder(
  formRoot: Locator,
  placeholder: RegExp | string,
  quickFilter: string
): Promise<void> {
  // Click the app-project-select's combobox by placeholder text and pick the first filtered option
  const selectRoot = formRoot.getByPlaceholder(placeholder).or(formRoot.getByText(placeholder).locator('..'));
  const combo = selectRoot.getByRole('combobox').first();
  await combo.click();
  await combo.type(quickFilter);
  const firstOption = combo.page().getByRole('option').first();
  await firstOption.click();
}

async function selectReferenceProjects(formRoot: Locator, count: number): Promise<void> {
  // Primary source project (required)
  await selectProjectByPlaceholder(formRoot, /First reference project/i, 'NTV');

  if (count >= 2) {
    await selectProjectByPlaceholder(formRoot, /Second reference project/i, 'DHH94');
  }
  if (count >= 3) {
    await selectProjectByPlaceholder(formRoot, /Third reference project/i, 'RVR60');
  }
}

async function selectBooksInMultiSelect(formRoot: Locator, sectionLabel: string, books: string[]): Promise<void> {
  // Locate the section by its visible label, then interact with options inside
  const section = formRoot.getByText(new RegExp(sectionLabel, 'i')).locator('..');
  // Click each desired book option by name
  for (const book of books) {
    const option = section.getByRole('option', { name: book });
    // Some multi-selects require opening a panel; attempt click and fall back to searching globally
    if (!(await option.isVisible().catch(() => false))) {
      // fallback search in the step content
      const globalOption = formRoot.getByRole('option', { name: book });
      await expect(globalOption).toBeVisible();
      await globalOption.click();
    } else {
      await option.click();
    }
  }
}
