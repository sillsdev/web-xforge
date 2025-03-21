#!/usr/bin/env -S deno run --allow-run --allow-env --allow-sys --allow-read --allow-write e2e.mts
import { chromium, firefox, webkit } from "npm:playwright";
import { runSheet, ScreenshotContext } from "./e2e-globals.mts";
import { joinAsRoleAndTraversePages, logOut, traverseHomePageAndLoginPage } from "./smoke-tests.mts";
// import locales from "../../locales.json" with { type: "json" };
import { ensureJoinedProject, screenshot } from "./e2e-utils.mts";
import { logInAsPTUser } from "./pt_login.mts";
import secrets from "./secrets.json" with { type: "json" };

const availableEngines = { chromium, firefox, webkit };

for (const engineName of runSheet.browsers) {
  console.log(`Running tests in ${engineName}`);
  const engine = availableEngines[engineName];
  const browser = await engine.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const screenshotContext: ScreenshotContext = { prefix: runSheet.screenshotPrefix, engine: engineName };

  try {
    if (runSheet.applicationScopes.includes("home_and_login")) await traverseHomePageAndLoginPage(page);

    if (runSheet.applicationScopes.includes("main_application")) {
      for (const user of secrets.users) {
        console.log(`Logging in as ${user.email}`);
        const pageName = "my_projects_" + user.email.split("@")[0].split("+")[1];
        await logInAsPTUser(page, { email: user.email, password: atob(user.password) });

        await page.waitForURL(/\/projects/);
        await ensureJoinedProject(page, "Stp22");

        // wait for "Loading additional Paratext projects" to disappear
        await page.waitForSelector("text=Loading additional Paratext projects", { state: "hidden" });

        await screenshot(page, { ...screenshotContext, role: "pt_administrator", pageName });
        await logOut(page);
      }
      for (const role of runSheet.roles) {
        console.log(`Joining as ${role}`);
        await joinAsRoleAndTraversePages(page, { ...screenshotContext, role });
      }
    }
  } catch (e) {
    console.error("Error running tests");
    console.error(e);
    await screenshot(page, { ...screenshotContext, pageName: "test_failure" }, { overrideScreenshotSkipping: true });
  } finally {
    await context.close();
    await browser.close();
  }
}
