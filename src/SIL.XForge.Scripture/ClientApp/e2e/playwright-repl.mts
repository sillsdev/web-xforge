import { chromium } from "npm:playwright";
import { logInAsPTUser } from "./pt-login.ts";
import secrets from "./secrets.json" with { type: "json" };

// Usage:
// Run Deno REPL by running deno
// Run the following commands in the REPL:
// import launch from './playwright-repl.mts';
// const page = await launch();

export default async function launch() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto("http://localhost:5000");
  await logInAsPTUser(page, secrets.users[0]);
  return page;
}
