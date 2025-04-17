#!/usr/bin/env -S deno run --allow-run --allow-env --allow-sys --allow-read --allow-write --unstable-sloppy-imports
import { chromium } from "npm:playwright";
import { preset } from "./e2e-globals.ts";
import { Utils } from "./e2e-utils.js";
import { numberOfTimesToAttemptTest } from "./pass-probability-ts";
import { ScreenshotContext } from "./presets.ts";
import { tests } from "./test-definitions.ts";

const resultFilePath = "test_characterization.json";
const testNames = Object.keys(tests) as (keyof typeof tests)[];
let mostRecentResultData = JSON.parse(await Deno.readTextFile(resultFilePath));

printRetriesForEachTest();

while (true) {
  const testName = nextTestToRun();
  const testFunction = tests[testName];
  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext();
  await browserContext.grantPermissions(["clipboard-read", "clipboard-write"]);
  await browserContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await browserContext.newPage();
  const screenshotContext: ScreenshotContext = { engine: "chromium" };
  try {
    const attempts = numberOfTimesToAttemptTest(testName, mostRecentResultData);
    console.log(`Running test: ${testName}, which currently has ${attempts} attempts`);

    await testFunction(chromium, page, screenshotContext);
    await saveResult("success", testName);
  } catch (error: unknown) {
    console.error(error);
    await saveResult("failure", testName);
    const tracePath = `${preset.outputDir}/characterization-trace-${testName}-${Utils.formatDate(new Date())}.zip`;
    console.log(`Saving trace to ${tracePath}`);
    browserContext.tracing.stop({ path: tracePath });
  } finally {
    printRetriesForEachTest();
  }
}

async function saveResult(result: "success" | "failure", testName: string): Promise<void> {
  mostRecentResultData = JSON.parse(await Deno.readTextFile(resultFilePath));
  mostRecentResultData[testName] ??= {};
  mostRecentResultData[testName][result] ??= 0;
  mostRecentResultData[testName][result]++;
  await Deno.writeTextFile(resultFilePath, JSON.stringify(mostRecentResultData, null, 2) + "\n");
  console.log(
    `%c✔ Test ${testName} finished with result: ${result}`,
    `color: ${result === "success" ? "green" : "red"}`
  );
}

function nextTestToRun(): keyof typeof tests {
  return testNames
    .slice()
    .sort(
      (a, b) =>
        numberOfTimesToAttemptTest(b, mostRecentResultData) - numberOfTimesToAttemptTest(a, mostRecentResultData)
    )[0];
}

function printRetriesForEachTest(): void {
  const info: { [key: string]: number } = {};
  for (const testName of testNames) {
    info[testName] = numberOfTimesToAttemptTest(testName, mostRecentResultData);
  }
  console.log("Retries for each test:");
  console.table(info);
}
