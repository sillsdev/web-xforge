#!/usr/bin/env -S deno run --allow-read --allow-write

// Compares two sets of Storybook screenshots at the pixel level and creates a Netlify deploy
// directory containing an interactive diff UI for any screenshots that differ.
//
// Reads PNG files from two directories (one for the base commit, one for the PR branch commit),
// decodes each PNG to raw RGBA pixel data, and compares every pixel. Any screenshots that are
// within the per-channel threshold on all channels are treated as identical. Screenshots with
// different dimensions are always treated as changed.
//
// The deploy directory is always created, even when there are no differences, so that a stale
// Netlify deploy from a previous PR push (which may have had differences) is replaced with an
// up-to-date "no changes" page.
//
// Output deploy directory layout:
//   index.html         — interactive diff UI (side-by-side and pixel-diff overlay modes)
//   screenshots.json   — diff metadata fetched by index.html
//   base/<story-id>.png    — screenshot from the base commit (changed and removed stories)
//   branch/<story-id>.png  — screenshot from the PR branch commit (changed and added stories)
//
// Usage:
//   scripts/compare-storybook-screenshots.mts <base-dir> <branch-dir> <deploy-dir> [options]
//
// Arguments:
//   base-dir     Directory containing screenshots from the base/target branch
//   branch-dir   Directory containing screenshots from the PR branch
//   deploy-dir   Path where the deploy directory should be written
//
// Options:
//   --threshold N   Per-channel pixel difference threshold (default: 8). Pixels where every
//                   channel differs by at most N are treated as identical. Higher values reduce
//                   false positives from font hinting, sub-pixel rendering, or lossy compression.
//   --pr-url URL    GitHub PR URL to link back from the diff page
//   --pr-number N   GitHub PR number displayed on the diff page
//   --pr-title STR  GitHub PR title displayed on the diff page

import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { PNG } from 'npm:pngjs@7.0.0';

/** Default per-channel pixel difference threshold. Higher values tolerate minor rendering variance. */
const DEFAULT_THRESHOLD = 8;

/** Decoded PNG image with raw RGBA pixel data. */
interface DecodedPng {
  width: number;
  height: number;
  /** Flat RGBA buffer: 4 bytes per pixel, row-major order. */
  data: Uint8Array;
}

/**
 * Metadata written by the screenshot script alongside the PNG files.
 * Used by this script to exclude intentionally-skipped stories and apply per-story
 * pixel-count thresholds.
 */
interface Metadata {
  /** Story IDs skipped because chromatic.disableSnapshot is true. */
  skipped: string[];
  /**
   * Per-story maximum number of differing pixels that is still treated as "no change".
   * Set in a story via parameters.screenshot.maxDiffPixels.
   * A value of 0 (the default) means any differing pixel is a change.
   */
  maxDiffPixels: Record<string, number>;
}

/** Reads metadata.json from a screenshot directory. Throws if the file is absent or malformed. */
function readMetadata(dir: string): Metadata {
  const filePath = join(dir, 'metadata.json');
  const text = Deno.readTextFileSync(filePath);
  const data = JSON.parse(text);
  return {
    skipped: Array.isArray(data.skipped) ? data.skipped : [],
    maxDiffPixels:
      data.maxDiffPixels != null && typeof data.maxDiffPixels === 'object' && !Array.isArray(data.maxDiffPixels)
        ? data.maxDiffPixels
        : {}
  };
}

/** Decodes a PNG file synchronously to raw RGBA pixel data. */
function readPng(filePath: string): DecodedPng {
  const fileData = Deno.readFileSync(filePath);
  const png = PNG.sync.read(Buffer.from(fileData));
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength)
  };
}

/**
 * Compares two decoded PNGs at the pixel level using a per-channel threshold.
 * A pixel is considered different if any channel (R, G, B, A) differs by more than the threshold.
 * Returns the number of differing pixels, or -1 if the images have different dimensions.
 */
function countDifferingPixels(a: DecodedPng, b: DecodedPng, threshold: number): number {
  if (a.width !== b.width || a.height !== b.height) return -1;
  let diffCount = 0;
  // Each pixel is 4 bytes (R, G, B, A). A pixel is changed if any channel exceeds the threshold.
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > threshold ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > threshold ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > threshold ||
      Math.abs(a.data[i + 3] - b.data[i + 3]) > threshold
    ) {
      diffCount++;
    }
  }
  return diffCount;
}

function main(): void {
  // Parse positional arguments and named flags.
  const positional: string[] = [];
  let threshold: number = DEFAULT_THRESHOLD;
  let prUrl: string | undefined;
  let prNumber: number | undefined;
  let prTitle: string | undefined;

  for (let i = 0; i < Deno.args.length; i++) {
    if (Deno.args[i] === '--threshold' && i + 1 < Deno.args.length) {
      const parsed = parseInt(Deno.args[++i], 10);
      if (isNaN(parsed) || parsed < 0) {
        console.error('Error: --threshold must be a non-negative integer');
        Deno.exit(1);
      }
      threshold = parsed;
    } else if (Deno.args[i] === '--pr-url' && i + 1 < Deno.args.length) {
      const raw = Deno.args[++i];
      // Treat an empty or whitespace-only string as absent (e.g. when run outside of a PR context).
      prUrl = raw.trim().length > 0 ? raw.trim() : undefined;
    } else if (Deno.args[i] === '--pr-number' && i + 1 < Deno.args.length) {
      const parsed = parseInt(Deno.args[++i], 10);
      prNumber = isNaN(parsed) ? undefined : parsed;
    } else if (Deno.args[i] === '--pr-title' && i + 1 < Deno.args.length) {
      const raw = Deno.args[++i];
      prTitle = raw.trim().length > 0 ? raw.trim() : undefined;
    } else {
      positional.push(Deno.args[i]);
    }
  }

  const [baseDir, branchDir, deployDir] = positional;

  if (baseDir == null || branchDir == null || deployDir == null) {
    console.error(
      `Usage: ${import.meta.filename} <base-dir> <branch-dir> <deploy-dir> [--threshold N] [--pr-url URL] [--pr-number N] [--pr-title STR]`
    );
    Deno.exit(1);
  }

  // Read metadata from both screenshot sets. We union the skip lists so that a story skipped
  // on either side (e.g. due to a disableSnapshot check race on one runner) is excluded from
  // the diff report. Per-story maxDiffPixels come from branch metadata; base fills in gaps.
  const baseMetadata = readMetadata(baseDir);
  const branchMetadata = readMetadata(branchDir);
  const skippedStories = new Set([...baseMetadata.skipped, ...branchMetadata.skipped]);
  // Branch takes precedence for per-story thresholds (reflects the current state of the code).
  const storyMaxDiffPixels: Record<string, number> = {
    ...baseMetadata.maxDiffPixels,
    ...branchMetadata.maxDiffPixels
  };

  const baseFiles = new Set(
    [...Deno.readDirSync(baseDir)].filter(entry => entry.isFile && entry.name.endsWith('.png')).map(entry => entry.name)
  );
  const branchFiles = new Set(
    [...Deno.readDirSync(branchDir)]
      .filter(entry => entry.isFile && entry.name.endsWith('.png'))
      .map(entry => entry.name)
  );
  const allFiles: string[] = [...new Set([...baseFiles, ...branchFiles])].sort();

  // Track which stories were removed, added, or changed so we can report and include them in the deploy.
  const removedStories: string[] = [];
  const addedStories: string[] = [];
  // Each entry is [filename, differingPixelCount] where -1 means dimensions differ.
  const changedStories: [string, number][] = [];

  for (const filename of allFiles) {
    const inBase = baseFiles.has(filename);
    const inBranch = branchFiles.has(filename);
    const storyId = filename.slice(0, -4); // strip .png suffix

    // Exclude stories that were intentionally skipped (chromatic.disableSnapshot) on either side.
    // Taking the union of both skip lists handles cases where the disableSnapshot check succeeded
    // on one runner but failed on the other, which would otherwise produce a spurious add/remove.
    if (skippedStories.has(storyId)) continue;

    if (inBase && inBranch) {
      const basePng = readPng(join(baseDir, filename));
      const branchPng = readPng(join(branchDir, filename));
      const diffPixels = countDifferingPixels(basePng, branchPng, threshold);
      // Per-story maxDiffPixels: minor rendering noise (e.g. sub-pixel layout shifts) can cause
      // a small number of pixels to differ on every run even when there are no real changes.
      // Stories can set parameters.screenshot.maxDiffPixels to tolerate up to N differing pixels.
      // The diff viewer always shows the true differences when a story is in the report.
      const maxDiff = storyMaxDiffPixels[storyId] ?? 0;
      // diffPixels === -1 means the images have different dimensions; treat as always changed
      // regardless of maxDiff (a dimension change is never "noise").
      if (diffPixels === -1 || diffPixels > maxDiff) {
        changedStories.push([filename, diffPixels]);
      }
    } else if (inBase) {
      removedStories.push(filename);
    } else {
      addedStories.push(filename);
    }
  }

  // Log the results.
  if (removedStories.length > 0) {
    console.log(`\nStories removed or renamed (${removedStories.length}):`);
    for (const filename of removedStories) {
      console.log(`  - ${filename.slice(0, -4)}`); // strip .png suffix for readability
    }
  }

  if (addedStories.length > 0) {
    console.log(`\nStories added or renamed (${addedStories.length}):`);
    for (const filename of addedStories) {
      console.log(`  + ${filename.slice(0, -4)}`);
    }
  }

  if (changedStories.length > 0) {
    console.log(`\nStories with visual differences (${changedStories.length}):`);
    for (const [filename, pixels] of changedStories) {
      const storyId = filename.slice(0, -4);
      if (pixels === -1) {
        console.log(`  ~ ${storyId} (dimensions differ)`);
      } else {
        console.log(`  ~ ${storyId} (${pixels} pixel${pixels === 1 ? '' : 's'} differ)`);
      }
    }
  }

  const inBothCount = allFiles.length - removedStories.length - addedStories.length;
  const identicalCount = inBothCount - changedStories.length;

  console.log('\nSummary:');
  console.log(`  Base screenshots:   ${baseFiles.size}`);
  console.log(`  Branch screenshots: ${branchFiles.size}`);
  console.log(`  Skipped (disableSnapshot): ${skippedStories.size}`);
  console.log(`  Identical:          ${identicalCount}`);
  console.log(`  Different:          ${changedStories.length}`);
  console.log(`  Only in base:       ${removedStories.length}`);
  console.log(`  Only in branch:     ${addedStories.length}`);

  const totalChanged = changedStories.length + removedStories.length + addedStories.length;

  // Always create the deploy directory so that a stale Netlify deploy from a previous PR push
  // (which may have shown differences) is replaced with the current state. The diff UI renders
  // a "no visual differences found" message when all arrays are empty.
  Deno.mkdirSync(deployDir, { recursive: true });

  // Only create image subdirectories when there are images to copy into them.
  if (changedStories.length > 0 || removedStories.length > 0) {
    Deno.mkdirSync(join(deployDir, 'base'), { recursive: true });
  }
  if (changedStories.length > 0 || addedStories.length > 0) {
    Deno.mkdirSync(join(deployDir, 'branch'), { recursive: true });
  }

  for (const [filename] of changedStories) {
    Deno.copyFileSync(join(baseDir, filename), join(deployDir, 'base', filename));
    Deno.copyFileSync(join(branchDir, filename), join(deployDir, 'branch', filename));
  }
  for (const filename of removedStories) {
    Deno.copyFileSync(join(baseDir, filename), join(deployDir, 'base', filename));
  }
  for (const filename of addedStories) {
    Deno.copyFileSync(join(branchDir, filename), join(deployDir, 'branch', filename));
  }

  // Write screenshots.json so that index.html knows which stories to display.
  const screenshotsJson = {
    prUrl: prUrl ?? null,
    prNumber: prNumber ?? null,
    prTitle: prTitle ?? null,
    threshold,
    changed: changedStories.map(([filename, diffPixels]) => ({ filename, diffPixels })),
    removed: removedStories,
    added: addedStories,
    summary: {
      identical: identicalCount,
      changed: changedStories.length,
      removed: removedStories.length,
      added: addedStories.length
    }
  };
  Deno.writeTextFileSync(join(deployDir, 'screenshots.json'), JSON.stringify(screenshotsJson, null, 2));

  // Copy the self-contained diff UI (lives next to this script in the repo).
  const scriptDir = import.meta.dirname;
  if (scriptDir == null)
    throw new Error('import.meta.dirname is unavailable; cannot locate screenshot-diff-index.html');
  Deno.copyFileSync(join(scriptDir, 'screenshot-diff-index.html'), join(deployDir, 'index.html'));

  if (totalChanged === 0) {
    console.log('\nDeploy directory created. No visual differences found.');
  } else {
    console.log(`\nDeploy directory created: ${deployDir}`);
    console.log(`  ${changedStories.length} changed stories (both base and branch screenshots included)`);
    console.log(`  ${removedStories.length + addedStories.length} stories present in only one commit`);
  }
}

main();
