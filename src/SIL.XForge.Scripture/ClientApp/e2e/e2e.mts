#!/usr/bin/env -S deno run --allow-run --allow-env --allow-sys --allow-read --allow-write e2e.mts
import { chromium, firefox, webkit } from "npm:playwright";
import { runSheet, ScreenshotContext } from "./e2e-globals.mts";
import { joinAsRoleAndTraversePages, screenshot, traverseHomePageAndLoginPage } from "./smoke-tests.mts";
// import locales from "../../locales.json" with { type: "json" };

const availableEngines = { chromium, firefox, webkit };
console.log("one");
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
      for (const role of runSheet.roles) {
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
