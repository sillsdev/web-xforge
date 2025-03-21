#!/usr/bin/env -S deno run --allow-run --allow-env --allow-sys --allow-read --allow-write pt_login.mts
import { Page } from "@playwright/test";

export const E2E_ROOT_URL = "http://localhost:5000";

async function setLocatorToValue(page: Page, locator: string, value: string) {
  // Trick TypeScript into not complaining that the document isn't defined
  // The function is actually evaluated in the browser, not in Deno
  // deno-lint-ignore no-explicit-any
  const document = {} as any;
  return await page.evaluate(
    ({ locator, value }) => {
      document.querySelector(locator).value = value;
    },
    { locator, value }
  );
}

export async function logInAsPTUser(page: Page, user: { email: string; password: string }) {
  await page.goto(E2E_ROOT_URL);
  await page.getByRole("link", { name: "Log In" }).click();
  await page.locator("a").filter({ hasText: "Log in with paratext" }).click();

  // Paratext Registry login

  // Type fake username so it won't detect a Google account
  await page.fill('input[name="email"]', "user@example.com");
  // Click the next arrow button
  await page.locator("#password-group").getByRole("button").click();
  await page.fill('input[name="password"]', user.password);
  // change the value of email without triggering user input detection
  await setLocatorToValue(page, 'input[name="email"]', user.email);
  await page.locator("#password-group").getByRole("button").click();

  // The first login requires authorizing Scripture Forge to access the Paratext account
  if ((await page.title()).startsWith("Authorise Application")) {
    await page.getByRole("button", { name: "Accept" }).click();
  }

  // On localhost only, Auth0 requires accepting access to the account
  // Wait until back in the app, or on the authorization page
  const auth0AuthorizeUrl = "https://sil-appbuilder.auth0.com/decision";
  await page.waitForURL(url => [auth0AuthorizeUrl, E2E_ROOT_URL].some(startingUrl => url.href.startsWith(startingUrl)));

  if ((await page.url()).startsWith(auth0AuthorizeUrl)) {
    await page.locator("#allow").click();
  }
}
