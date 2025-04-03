#!/usr/bin/env -S deno run --allow-read --allow-write

import { ScreenshotContext } from "./presets.ts";

const runLogDir = Deno.args[0];
const helpRepo = Deno.args[1];

if (runLogDir == null || helpRepo == null) {
  console.error("Usage: ./update_help_site_screenshots.mts <run_log_dir> <help_repo>");
  Deno.exit(1);
}

const runLog = JSON.parse(await Deno.readTextFile(`${runLogDir}/run_log.json`));
if (!(await Deno.stat(helpRepo)).isDirectory) {
  console.error(`Help repo "${helpRepo}" is not a directory`);
  Deno.exit(1);
}

const pageNameToFileName = {
  localized_page_sign_up: "1786056439.png",
  localized_auth0_sign_up_with_pt: "1624359167.png",
  localized_pt_registry_login: "448045579.png"
};

function getDirForLocale(localeCode: string): string {
  return localeCode === "en"
    ? `${helpRepo}/docs`
    : `${helpRepo}/i18n/${localeCode}/docusaurus-plugin-content-docs/current`;
}

for (const screenshot of runLog.screenshotEvents) {
  const context: ScreenshotContext = screenshot.context;
  const pageName = context.pageName;
  const localeCode = context.locale;
  if (pageName == null || localeCode == null) {
    console.error("Screenshot context is missing pageName or locale:", JSON.stringify(context));
    continue;
  }

  if (pageName in pageNameToFileName) {
    const currentFile = `${runLogDir}/${screenshot.fileName}`;
    const newFile = `${getDirForLocale(localeCode)}/${pageNameToFileName[pageName as keyof typeof pageNameToFileName]}`;
    console.log(`Moving ${currentFile} to ${newFile}`);
    await Deno.copyFile(currentFile, newFile);
  }
}
