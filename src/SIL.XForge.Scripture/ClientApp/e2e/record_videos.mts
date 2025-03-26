#!/usr/bin/env -S deno run --allow-env --allow-sys --allow-read --allow-write --allow-run record_videos.mts
import { chromium, devices, expect } from "npm:@playwright/test";
import { Page } from "npm:playwright";
import locales from "../../locales.json" with { type: "json" };

const typingDelayFactor = 1; // reduce to 0 to speed up typing

// Trick TypeScript into not complaining that the document isn't defined for functions that are actually evaluated in
// the browser, not in Deno.
// deno-lint-ignore no-explicit-any
const document = {} as any;

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
    const rect = document.querySelector(selector).getBoundingClientRect();
    div.style = `
      position: absolute;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      z-index: 1000;
      outline: 3px dashed red;
      border-radius: 10px;
      scale: 1.1;
      animation: blink-animation 0.5s ease infinite;
      `;
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
  const context = await browser.newContext({
    ...devices["Pixel 5"],
    recordVideo: { dir: outputDir }
  });

  const page = await context.newPage();

  await page.goto(`http://localhost:5000/join/TbWBa20bL_HyzbQG/${locale}`);
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
