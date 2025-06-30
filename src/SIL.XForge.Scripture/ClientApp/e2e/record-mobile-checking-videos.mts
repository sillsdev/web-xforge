#!/usr/bin/env -S deno run --allow-env --allow-sys --allow-read --allow-write --allow-run
/// <reference lib="dom" />

import { chromium, devices, expect } from "npm:@playwright/test";
import { Page } from "npm:playwright";
import locales from "../../locales.json" with { type: "json" };

// This is a legacy script that is left here for future reference. It works, but is not currently used by the tests.

const typingDelayFactor = 1; // reduce to 0 to speed up typing

async function injectBlinkAnimation(page: Page) {
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.innerHTML = `
    @keyframes blink-animation {
      0% { opacity: 0.0; }
      50% { opacity: 1; }
      100% { opacity: 0.0; }
    }`;
    document.head.appendChild(style);
  });
}

async function highlightElement(page: Page, selector: string) {
  await page.evaluate(selector => {
    const div = document.createElement("div");
    div.id = "element-highlight";
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    if (!rect) throw new Error(`Element not found for selector: ${selector}`);
    div.style.position = "absolute";
    div.style.top = `${rect.top}px`;
    div.style.left = `${rect.left}px`;
    div.style.width = `${rect.width}px`;
    div.style.height = `${rect.height}px`;
    div.style.zIndex = "1000";
    div.style.outline = "3px dashed red";
    div.style.borderRadius = "10px";
    div.style.scale = "1.1";
    div.style.animation = "blink-animation 0.5s ease infinite";
    document.body.appendChild(div);
  }, selector);
}

function removeElementHighlight(page: Page) {
  return page.evaluate(() => document.getElementById("element-highlight")?.remove());
}

async function highlightAndClickElement(page: Page, selector: string, delay = 1500) {
  await highlightElement(page, selector);
  await page.waitForTimeout(delay);
  await removeElementHighlight(page);
  await page.locator(selector).tap();
}

async function run(locale: string) {
  const outputDir = `videos/${locale}`;
  const localizations = JSON.parse(
    await Deno.readTextFile(`../src/assets/i18n/checking_${locale.replace(/-/g, "_")}.json`)
  );
  const browser = await chromium.launch({ headless: true });
  const device = devices["Pixel 5"];
  const context = await browser.newContext({
    ...device,
    recordVideo: {
      dir: outputDir,
      size: {
        width: device.viewport.width,
        height: device.viewport.height
      }
    }
  });

  const page = await context.newPage();

  await page.goto(`http://localhost:5000/join/isvMCG6ruSfMGNYW/${locale}`);
  await expect(page).toHaveTitle("Scripture Forge");
  await injectBlinkAnimation(page);

  await page.focus("input");
  await page.waitForTimeout(500);
  await page.keyboard.type(localizations.edit_name_dialog.your_name, { delay: 200 * typingDelayFactor });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outputDir}/checking_sign_up_${locale}.png` });

  await highlightAndClickElement(page, "form button");

  await page.waitForSelector("#add-answer");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outputDir}/checking_add_answer_${locale}.png` });
  await highlightAndClickElement(page, "#add-answer");
  await page.waitForTimeout(1500);
  await page.keyboard.type("A messenger would come before him.", { delay: 25 * typingDelayFactor });
  await page.waitForTimeout(500);
  await highlightAndClickElement(page, "#save-response");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${outputDir}/checking_added_answer_${locale}.png` });
  await highlightAndClickElement(page, "button.next-question[mat-icon-button]");
  await page.waitForTimeout(1000);
  await highlightAndClickElement(page, "#add-answer");
  await page.waitForTimeout(1000);

  await page.close();
  await page.video()!.saveAs(`${outputDir}/checking_demo_${locale}.webm`);
  await context.close();
  await browser.close();
}

for (const locale of locales) {
  const canonicalTag = locale.tags[0];
  if (canonicalTag !== "en-GB") {
    console.log(`Running test for ${locale.englishName} (${locale.tags[0]})`);
    await run(locale.tags[0]);
  }
}
