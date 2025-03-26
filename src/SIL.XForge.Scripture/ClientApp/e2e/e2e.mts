#!/usr/bin/env -S deno run --allow-run --allow-env --allow-sys --allow-read --allow-write --unstable-sloppy-imports e2e.mts
import { chromium, firefox, webkit } from "npm:playwright";
import { logger, runSheet, ScreenshotContext, UserRole } from "./e2e-globals.ts";
import { createShareLinksAsAdmin, screenshot } from "./e2e-utils.ts";
import secrets from "./secrets.json" with { type: "json" };
import {
  joinAsUserAndTraversePages,
  joinWithLinkAndTraversePages,
  logOut,
  traverseHomePageAndLoginPage
} from "./smoke-tests.mts";
import { communityChecking } from "./workflows/community-checking.ts";
import { generateDraft } from "./workflows/generate-draft.ts";

const availableEngines = { chromium, firefox, webkit };

const ptUsersByRole = {
  [runSheet.roles[0]]: secrets.users[0],
  [runSheet.roles[1]]: secrets.users[1],
  [runSheet.roles[2]]: secrets.users[2],
  [runSheet.roles[3]]: secrets.users[3]
} as const;

for (const engineName of runSheet.browsers) {
  console.log(`Running tests in ${engineName}`);
  const engine = availableEngines[engineName];
  const browser = await engine.launch({ headless: false });
  const context = await browser.newContext();

  // Grant permission so share links can be copied and then read from clipboard
  // Only supported in Chromium
  if (engineName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const page = await context.newPage();

  const screenshotContext: ScreenshotContext = { prefix: runSheet.screenshotPrefix, engine: engineName };

  try {
    if (runSheet.testScopes.includes("home_and_login")) {
      await traverseHomePageAndLoginPage(page, screenshotContext);
    }

    if (runSheet.testScopes.includes("smoke_tests")) {
      for (const role of Object.keys(ptUsersByRole)) {
        const user = ptUsersByRole[role];
        await joinAsUserAndTraversePages(page, user, { ...screenshotContext, role: role as UserRole });
      }
      const shareLinks = await createShareLinksAsAdmin(page, secrets.users[0]);
      await logOut(page);
      for (const [roleName, link] of Object.entries(shareLinks)) {
        console.log(`Joining as ${roleName}`);
        const role = roleName as UserRole; // FIXME invalid assertion
        await joinWithLinkAndTraversePages(page, link, { ...screenshotContext, role });
      }
    }

    if (runSheet.testScopes.includes("generate_draft")) {
      await generateDraft(page, screenshotContext, secrets.users[0]);
    }

    if (runSheet.testScopes.includes("community_checking")) {
      await communityChecking(page, screenshotContext, secrets.users[0]);
    }
  } catch (e) {
    console.error("Error running tests");
    console.error(e);
    await screenshot(page, { ...screenshotContext, pageName: "test_failure" }, { overrideScreenshotSkipping: true });
  } finally {
    await context.close();
    await browser.close();
    logger.saveToFile();
  }
}
