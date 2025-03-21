import { chromium, devices, expect } from '@playwright/test';
import fs from 'fs';
import locales from '../../locales.json' assert { type: 'json' };

const typingDelayFactor = 1; // reduce to 0 to speed up typing

async function injectBlinkAnimation(page) {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.innerHTML = `
    @keyframes blink-animation {
      0% { opacity: 0.0; }
      50% { opacity: 1; }
      100% { opacity: 0.0; }
    }`;
    document.head.appendChild(style);
  });

}

async function highlightElement(page, selector) {
  await page.evaluate((selector) => {
    const div = document.createElement('div');
    div.id = 'element-highlight';
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
      `
    document.body.appendChild(div);
  }, selector);
}

function removeElementHighlight(page) {
  return page.evaluate(() => document.getElementById('element-highlight')?.remove());
}

async function highlightAndClickElement(page, selector, delay = 1500) {
  await highlightElement(page, selector);
  await page.waitForTimeout(delay);
  await removeElementHighlight(page);
  await page.locator(selector).tap();
}

async function run(locale) {
  const outputDir = `output/${locale}`;
  const localizations = JSON.parse(await fs.promises.readFile(`../src/assets/i18n/checking_${locale.replace(/-/g, '_')}.json`, 'utf8'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['Pixel 5'],
    headless: true,
    recordVideo: {
      dir: outputDir,
    },
  });
  const page = await context.newPage();

  await page.goto(`http://localhost:5000/join/LyMbS8GqM1NH_yhg/${locale}`);
  await expect(page).toHaveTitle('Scripture Forge');
  await injectBlinkAnimation(page);

  await page.focus('input');
  await page.waitForTimeout(500);
  await page.keyboard.type(localizations.edit_name_dialog.your_name, { delay: 200 * typingDelayFactor });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outputDir}/checking_sign_up_${locale}.png` });

  await highlightAndClickElement(page, 'form button');

  await page.waitForSelector('#add-answer');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outputDir}/checking_add_answer_${locale}.png` });
  await highlightAndClickElement(page, '#add-answer');
  await page.waitForTimeout(1500);
  await page.keyboard.type('A messenger would come before him.', { delay: 25 * typingDelayFactor });
  await page.waitForTimeout(500);
  await highlightAndClickElement(page, '#save-answer');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${outputDir}/checking_added_answer_${locale}.png` });
  await highlightAndClickElement(page, 'button.next-question[mat-icon-button]');
  await page.waitForTimeout(1000);
  await highlightAndClickElement(page, '#add-answer');
  await page.waitForTimeout(1000);

  await page.close();
  await page.video().saveAs(`${outputDir}/checking_demo_${locale}.webm`);
  await context.close();
  await browser.close();
}

for (const locale of locales) {
  const canonicalTag = locale.tags[0];
  if (canonicalTag !== 'en-GB') {
    console.log(`Running test for ${locale.englishName} (${locale.tags[0]})`);
    await run(locale.tags[0]);
  }
}
