#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run

import { walk } from "jsr:@std/fs/walk";
import { pngImagesDiffer } from "./compare-images.mts";
import { ScreenshotEvent } from "./e2e-test-run-logger.ts";

const runLogDir = Deno.args[0];
const helpRepo = Deno.args[1];
const copyFilesEvenIfIdentical = true;

if (runLogDir == null || helpRepo == null) {
  console.error("Usage: ./copy-help-site-screenshots.mts <run_log_dir> <help_repo>");
  Deno.exit(1);
}

const runLog = JSON.parse(await Deno.readTextFile(`${runLogDir}/run_log.json`));
if (!(await Deno.stat(helpRepo)).isDirectory) {
  console.error(`Help repo "${helpRepo}" is not a directory`);
  Deno.exit(1);
}

const screenshotEvents: ScreenshotEvent[] = runLog.screenshotEvents;

function getDirForLocale(localeCode: string): string {
  return localeCode === "en"
    ? `${helpRepo}/docs`
    : `${helpRepo}/i18n/${localeCode}/docusaurus-plugin-content-docs/current`;
}

function getScreenshotByFileNameAndLocale(fileName: string, localeCode: string): any | undefined {
  const pageName = fileName.replace(/\.png$/, "");
  return screenshotEvents.find(event => event.context.pageName === pageName && event.context.locale === localeCode);
}

function localeCodesInRunLog(): string[] {
  return [...new Set(screenshotEvents.map(event => event.context.locale))] as string[];
}

const markdownImageRegex = /!\[.*?\]\(.\/([\w]+\.png)\)/gm;

async function imagesInMarkdownFile(filePath: string): Promise<string[]> {
  const content = await Deno.readTextFile(filePath);
  const matches = Array.from(content.matchAll(markdownImageRegex));
  return matches.map(match => match[1]);
}

for (const locale of localeCodesInRunLog()) {
  const localeDir = getDirForLocale(locale);
  try {
    console.log(`Walking directory: ${localeDir}`);
    for await (const entry of walk(localeDir)) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        for (const imageFileName of await imagesInMarkdownFile(entry.path)) {
          const screenshot = getScreenshotByFileNameAndLocale(imageFileName, locale);
          if (screenshot) {
            console.log(`Found screenshot for image ${imageFileName} in locale ${locale}:`, screenshot.fileName);
            const markdownFileDir = entry.path.substring(0, entry.path.lastIndexOf("/"));
            const source = `${runLogDir}/${screenshot.fileName}`;
            const destination = `${markdownFileDir}/${imageFileName}`;
            await copyScreenshotIfDiffers(source, destination);
          } else {
            console.warn(`No screenshot found for image ${imageFileName} in locale ${locale}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${localeDir}:`, error);
  }
}

/**
 * Copies a file from point A to point B if the files differ, or if there is no file at point B, or if
 * copyFilesEvenIfIdentical is set to true.
 * Uses zopflipng to optimize the PNG file.
 * @param source The source file path.
 * @param destination The destination file path.
 * @returns A promise that resolves when the copy is complete.
 * @throws If the source file does not exist or if the copy fails.
 */
async function copyScreenshotIfDiffers(source: string, destination: string): Promise<void> {
  const imageDiffers = pngImagesDiffer(source, destination);
  if (imageDiffers || copyFilesEvenIfIdentical) {
    // zopflipng npm package must be installed globally for this to work
    console.log(`Copying ${source} to ${destination} using zopflipng...`);
    const zopflipng = new Deno.Command("zopflipng", { args: ["-y", source, destination], stdout: "inherit" });
    const status = await zopflipng.output();
    if (status.code !== 0) {
      throw new Error(`Failed to copy ${source} to ${destination} using zopflipng:`, status);
    }
  } else {
    console.log(`Skipping ${source} as it is identical to ${destination}`);
  }
}
