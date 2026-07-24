/// <reference lib="dom" />
import { Page } from 'npm:playwright';

/**
 * Helpers for E2E tests running against the local mock services (src/MockServices) with the
 * `mock` preset. Scenario setup goes through the control API instead of secrets.json accounts.
 */

const CONTROL_URL = Deno.env.get('MOCK_SERVICES_URL') ?? 'http://localhost:5100';

export async function control(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${CONTROL_URL}/_control${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`mock control API ${method} ${path} failed: ${JSON.stringify(json)}`);
  return json;
}

/** Wipes mock state (users, projects, hg repos) and applies the named seed. */
export async function resetMockState(seed = 'default'): Promise<void> {
  await control('POST', `/reset?seed=${encodeURIComponent(seed)}`);
}

/**
 * Logs in through the real auth flow (Log In button → fake Auth0 → callback) as the given
 * seeded user, without any credentials. Default seed authIds: 'oauth2|paratext|mock-admin',
 * 'oauth2|paratext|mock-translator', 'oauth2|paratext|mock-observer', 'auth0|mock-unlinked'.
 */
export async function logInAsMockUser(page: Page, rootUrl: string, authId: string): Promise<void> {
  await control('POST', '/next-login', { authId });
  await page.goto(rootUrl);
  await page
    .getByRole('button', { name: /log in/i })
    .or(page.getByRole('link', { name: /log in/i }))
    .first()
    .click();
  await page.waitForURL(/\/projects/, { timeout: 30000 });
}
