#!/usr/bin/env node
// Browser driver for the mock system: performs common Scripture Forge UI flows headlessly so
// scripted checks (and coding agents) don't have to write Playwright from scratch.
//
// Usage: node scripts/drive.mjs <command> [args] [--as <authId>]
//
//   projects                       List PT projects as the user sees them (shortName, SF id,
//                                  connected/connectable)
//   connect <SHORTNAME>            Connect a project and wait for its initial sync
//   sync <SHORTNAME>               Run "Sync with Paratext" on a connected project, report result
//   text <path>                    Log in, open http://localhost:5000<path>, print the page text
//   shot <path> <file.png>         Log in, open the page, save a screenshot
//
// --as defaults to 'oauth2|paratext|mock-admin' (see seed users in the README / control API).
// In <path>, '@SHORTNAME' resolves to the SF project id: e.g. text /projects/@MSRC/translate/RUT/1
//
// Requires the app stack to be running — run scripts/doctor.sh to check. Uses playwright-core
// from ClientApp's node_modules (run `npm install` there once). If Chromium is missing:
//   cd ../SIL.XForge.Scripture/ClientApp && npx playwright install chromium

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.SF_APP_URL ?? 'http://localhost:5000';
const CONTROL = (process.env.MOCK_BASE_URL ?? 'http://localhost:5100') + '/_control';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientApp = path.resolve(packageRoot, '..', 'SIL.XForge.Scripture', 'ClientApp');
const { chromium } = await import(path.join(clientApp, 'node_modules', 'playwright-core', 'index.mjs')).catch(() => {
  console.error(`error: playwright-core not found — run: cd ${clientApp} && npm install`);
  process.exit(1);
});

const args = process.argv.slice(2);
const asIndex = args.indexOf('--as');
const authId = asIndex >= 0 ? args.splice(asIndex, 2)[1] : 'oauth2|paratext|mock-admin';
const [command, arg1, arg2] = args;

if (command === undefined) {
  console.error('usage: drive.mjs <projects|connect|sync|text|shot> [args] [--as <authId>]  (see file header)');
  process.exit(1);
}

// Some sandboxes keep Chromium's shared libraries outside the system paths.
const env = { ...process.env };
const pwLibs = path.join(process.env.HOME ?? '', 'pw-libs');
if (fs.existsSync(pwLibs)) {
  const libPaths = [`${pwLibs}/usr/lib/x86_64-linux-gnu`, `${pwLibs}/lib/x86_64-linux-gnu`];
  env.LD_LIBRARY_PATH = [...libPaths, env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}

const browser = await chromium.launch({ env }).catch(error => {
  console.error('error: could not launch Chromium.', error.message);
  console.error(`hint: cd ${clientApp} && npx playwright install chromium`);
  process.exit(1);
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(60000);

async function login() {
  const response = await fetch(`${CONTROL}/next-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ authId })
  });
  if (!response.ok) throw new Error(`next-login failed for ${authId}: ${(await response.json()).error}`);
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.locator('a:has-text("Log In"), a:has-text("Log in")').first().click();
  await page.waitForURL(/\/(projects|callback)/, { timeout: 60000 });
  await page.waitForTimeout(3000);
}

/** PT projects as the app reports them (uses the logged-in user's token from localStorage). */
async function fetchProjects() {
  return await page.evaluate(async () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('@@auth0spajs@@'));
    const entry = keys.map(k => JSON.parse(localStorage.getItem(k) ?? 'null')).find(v => v?.body?.access_token);
    if (entry == null) throw new Error('no access token in localStorage — login failed?');
    const res = await fetch('/paratext-api/projects', {
      headers: { Authorization: `Bearer ${entry.body.access_token}` }
    });
    if (!res.ok) throw new Error(`GET /paratext-api/projects -> ${res.status}`);
    return await res.json();
  });
}

async function resolvePath(urlPath) {
  const match = urlPath.match(/@([A-Za-z0-9_-]+)/);
  if (match == null) return urlPath;
  const projects = await fetchProjects();
  const project = projects.find(p => p.shortName.toLowerCase() === match[1].toLowerCase());
  if (project?.projectId == null) throw new Error(`no connected project with short name ${match[1]}`);
  return urlPath.replace(match[0], project.projectId);
}

async function screenshot(file) {
  // Font readiness can hang in some sandboxes; a screenshot is best-effort.
  await page
    .screenshot({ path: file, timeout: 8000 })
    .catch(() => page.screenshot({ path: file, timeout: 8000, caret: 'initial' }).catch(() => {}));
}

try {
  await login();

  if (command === 'projects') {
    const projects = await fetchProjects();
    for (const p of projects) {
      console.log(
        `${p.shortName}\tsfId=${p.projectId ?? '-'}\t${p.isConnected ? 'connected' : p.isConnectable ? 'connectable' : 'not connectable'}\trole=${p.role}`
      );
    }
  } else if (command === 'connect') {
    if (arg1 == null) throw new Error('usage: connect <SHORTNAME>');
    const before = await fetchProjects();
    const target = before.find(p => p.shortName.toLowerCase() === arg1.toLowerCase());
    if (target == null) throw new Error(`project ${arg1} not visible to ${authId} (check members/roles in the mock)`);
    if (target.isConnected) {
      console.log(`${arg1} already connected (sfId=${target.projectId})`);
    } else {
      await page.goto(`${APP}/connect-project`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      // Either the page lists rows with Connect buttons, or (when projects are already
      // connected) offers a project combobox.
      const row = page.locator(`.user-unconnected-project:has-text("${arg1}")`).first();
      if (await row.isVisible().catch(() => false)) {
        await row
          .getByRole('link', { name: 'Connect' })
          .or(row.getByRole('button', { name: 'Connect' }))
          .first()
          .click();
      } else {
        const combo = page.getByRole('combobox').first();
        if (await combo.isVisible().catch(() => false)) {
          await combo.click();
          await page.keyboard.type(arg1.toLowerCase());
          await page.waitForTimeout(1500);
          await page
            .getByRole('option', { name: new RegExp(arg1, 'i') })
            .first()
            .click();
          await page.waitForTimeout(1000);
        } else {
          // Fall back to the projects page row
          await page.goto(`${APP}/projects`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(4000);
          await page.locator(`text=${arg1}`).first().waitFor();
          await page.locator('button:has-text("Connect"), a:has-text("Connect")').first().click();
        }
      }
      await page.waitForTimeout(2000);
      const submit = page.locator('button:has-text("Connect")').first();
      if (await submit.isVisible().catch(() => false)) await submit.click();
      // Wait for the project page, but fail fast (with the message) if the app shows an error
      // dialog — e.g. "A directory for this project already exists" after an incomplete reset
      // (fix: scripts/reset-all.sh + restart the backend).
      const connectDeadline = Date.now() + 300000;
      for (;;) {
        if (/projects\/[a-f0-9]{24}/.test(page.url())) break;
        const dialog = page.locator('mat-dialog-container, .mat-mdc-snack-bar-label').first();
        if (await dialog.isVisible().catch(() => false)) {
          const dialogText = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
          if (/error|exists|failed|unable/i.test(dialogText)) {
            throw new Error(`the app reported an error while connecting: "${dialogText}"`);
          }
        }
        if (Date.now() > connectDeadline) throw new Error('timed out waiting for the project page after Connect');
        await page.waitForTimeout(1000);
      }
      console.log('connected; waiting for initial sync…');
      await page.waitForTimeout(8000);
      const after = await fetchProjects();
      const result = after.find(p => p.shortName.toLowerCase() === arg1.toLowerCase());
      console.log(`${arg1} connected (sfId=${result?.projectId}); url: ${page.url()}`);
    }
  } else if (command === 'sync') {
    if (arg1 == null) throw new Error('usage: sync <SHORTNAME>');
    const syncPath = await resolvePath(`/projects/@${arg1}/sync`);
    await page.goto(`${APP}${syncPath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.locator('button:has-text("Synchronize"), button:has-text("Sync")').first().click();
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5000);
      const text = await page.locator('body').innerText();
      if (/successfully synchronized|synchronization failed|error occurred/i.test(text)) break;
    }
    const text = await page.locator('body').innerText();
    const success = /successfully/i.test(text) && !/fail|error/i.test(text);
    console.log(`sync ${arg1}: ${success ? 'SUCCESS' : 'FAILED (or still running)'}`);
    if (!success) console.log(text.split('\n').slice(0, 20).join('\n'));
    process.exitCode = success ? 0 : 1;
  } else if (command === 'text' || command === 'shot') {
    if (arg1 == null) throw new Error(`usage: ${command} <path>${command === 'shot' ? ' <file.png>' : ''}`);
    const urlPath = await resolvePath(arg1);
    await page.goto(`${APP}${urlPath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    if (command === 'text') {
      console.log(await page.locator('body').innerText());
    } else {
      await screenshot(arg2 ?? 'page.png');
      console.log(`saved ${arg2 ?? 'page.png'} (url: ${page.url()})`);
    }
  } else {
    throw new Error(`unknown command '${command}' — see the header of this file`);
  }
} catch (error) {
  console.error('FAILED:', error.message);
  await screenshot('drive-failure.png');
  console.error('screenshot (best effort): drive-failure.png');
  process.exitCode = 1;
} finally {
  await browser.close();
}
