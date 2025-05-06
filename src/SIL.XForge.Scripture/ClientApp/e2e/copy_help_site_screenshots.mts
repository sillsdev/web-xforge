#!/usr/bin/env -S deno run --allow-read --allow-write

import { ScreenshotContext } from "./presets.ts";

const runLogDir = Deno.args[0];
const helpRepo = Deno.args[1];

if (runLogDir == null || helpRepo == null) {
  console.error("Usage: ./copy_help_site_screenshots.mts <run_log_dir> <help_repo>");
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
  localized_pt_registry_login: "448045579.png",
  localized_my_projects: "1783795116.png",
  localized_sync: "1990846672.png",
  sign_up_for_drafting: "Draft-Generation/sign_up_for_drafting.png",
  configure_sources_button: "Draft-Generation/configure_sources_button.png",
  configure_sources_draft_source: "Draft-Generation/configure_sources_draft_source.png",
  configure_sources_draft_reference: "Draft-Generation/configure_sources_draft_reference.png",
  configure_sources_confirm_languages: "Draft-Generation/configure_sources_confirm_languages.png",
  generate_draft_button: "Draft-Generation/generate_draft_button.png",
  generate_draft_confirm_sources: "Draft-Generation/generate_draft_confirm_sources.png",
  generate_draft_select_books_to_draft: "Draft-Generation/generate_draft_select_books_to_draft.png",
  generate_draft_select_books_to_train: "Draft-Generation/generate_draft_select_books_to_train.png",
  generate_draft_summary: "Draft-Generation/generate_draft_summary.png"
};

const screenshotsWithNoDestination = new Set();

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
  } else {
    screenshotsWithNoDestination.add(pageName);
  }
}

if (screenshotsWithNoDestination.size > 0) {
  console.error("Screenshots with no destination:", Array.from(screenshotsWithNoDestination).join(", "));
  console.error("Please update the script to handle these screenshots.");
}
