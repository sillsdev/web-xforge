#!/usr/bin/env -S deno run --allow-run --allow-env --allow-sys --allow-read --allow-write --unstable-sloppy-imports
import { chromium, firefox, webkit } from "npm:playwright";
import { logger, preset, ScreenshotContext } from "./e2e-globals.ts";
import { screenshot } from "./e2e-utils.ts";
import { numberOfTimesToAttemptTest } from "./pass-probability-ts";
import { presets } from "./presets.ts";
import { tests } from "./test-definitions.ts";
import testCharacterization from "./test_characterization.json" with { type: "json" };

const availableEngines = { chromium, firefox, webkit };

const availableTests = Object.keys(tests) as (keyof typeof tests)[];
const testScopes: typeof availableTests = [];

const args = Deno.args.slice(1);
for (const arg of args) {
  if ((availableTests as string[]).includes(arg)) {
    testScopes.push(arg as keyof typeof tests);
  } else if (!(arg in presets)) {
    console.log("Usage: ./e2e.mts <preset> <test1> <test2> ...");
    console.error(`Unknown test: ${arg}. Available tests: ${availableTests.join(", ")} and`);
    Deno.exit(1);
  }
}
if (testScopes.length === 0) {
  for (const scope of availableTests) testScopes.push(scope as keyof typeof testCharacterization);
}
console.log(`Running tests: ${testScopes.join(", ")}`);

let failed = false;
try {
  for (const engineName of preset.browsers) {
    console.log(`Running tests in ${engineName}`);
    const engine = availableEngines[engineName];

    for (const test of testScopes) {
      const browser = await engine.launch({ headless: preset.headless });
      const browserContext = await browser.newContext();
      if (preset.trace) {
        await browserContext.tracing.start({ screenshots: true, snapshots: true });
        await browserContext.tracing.startChunk();
      }

      // Grant permission so share links can be copied and then read from clipboard
      // Only supported in Chromium
      if (engineName === "chromium") await browserContext.grantPermissions(["clipboard-read", "clipboard-write"]);

      const page = await browserContext.newPage();

      const screenshotContext: ScreenshotContext = { engine: engineName };

      const testFn = tests[test];
      if (testFn == null) throw new Error(`Test ${test} not found`);
      const attempts = numberOfTimesToAttemptTest(test);

      console.log(`Running test ${test} with up to ${attempts} attempts`);
      let reRun = false;
      for (let i = 0; i < attempts; i++) {
        try {
          const startTime = Date.now();
          await testFn(engine, page, screenshotContext);
          const mins = (new Date().getTime() - startTime) / 60_000;
          console.log(
            `%c✔ Test ${test} passed in ${mins.toFixed(2)} minutes on attempt ${i + 1} of ${attempts}`,
            "color: green"
          );
          break; // Test passed
        } catch (e) {
          console.error(e);
          await screenshot(
            page,
            { ...screenshotContext, pageName: `${test}_try_${i + 1}_failure` },
            {},
            { overrideScreenshotSkipping: true }
          );
          if (preset.pauseOnFailure) await page.pause();
          console.log(`%c✗ Test ${test} failed on attempt ${i + 1} of ${attempts}.`, "color: red");
          console.error(e);
          if (i === attempts - 1) {
            console.error(`Test ${test} failed after ${attempts} attempts.`);
            failed = true;
          } else {
            reRun = true;
            console.log(`Retrying...`);
          }
        } finally {
          if (preset.trace) {
            await browserContext.tracing.stopChunk({
              path: `${preset.outputDir}/${test}_attempt_${i + 1}_main_trace.zip`
            });
          }
          if (reRun) {
            await browserContext.tracing.startChunk();
          }
          if (i === attempts - 1) {
            await browserContext.close();
            await browser.close();
          }
        }
      }
      await browserContext.close();
      await browser.close();
    }
  }
} catch (error) {
  console.error(error);
} finally {
  await logger.saveToFile();
}

Deno.exit(failed ? 1 : 0);
