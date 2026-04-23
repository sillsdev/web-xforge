#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-run --allow-env --allow-sys

/**
 * Takes screenshots of all Storybook stories from a pre-built Storybook directory.
 *
 * Serves the static Storybook build using a local HTTP server, then uses Playwright to visit each
 * story's iframe URL and capture a screenshot. This script is intended to be run twice on different
 * commits (the PR branch and the target branch) so the resulting screenshots can be compared.
 *
 * Usage: deno run --allow-read --allow-write --allow-net --allow-run --allow-env --allow-sys
 *          scripts/take-storybook-screenshots.mts <storybook-dir> <output-dir>
 *
 *   storybook-dir  Path to the built Storybook directory (e.g. storybook-static)
 *   output-dir     Directory in which to save screenshots (created if it does not exist)
 *
 * Each screenshot is saved as <story-id>.png (e.g. "avatar--default.png").
 * Exits with code 1 if any story fails after two attempts.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'npm:playwright@1.56.1';
import { join, resolve } from 'node:path';

/**
 * The browser window object extended with Storybook's internal preview global and the story
 * parameter cache written by this script during the waitForPlayFunction poll loop.
 */
interface StorybookWindow extends Window {
  __STORYBOOK_PREVIEW__?: {
    currentRender?: {
      phase?: string;
      story?: { parameters?: Record<string, unknown> };
    };
  };
  __SCREENSHOT_STORY_PARAMS__?: Record<string, unknown>;
}

const SERVER_PORT = 6006;
const STORY_LOAD_TIMEOUT_MS = 30_000;
// Wait after disabling animations to allow any in-flight animation frames to settle.
const ANIMATION_SETTLE_MS = 1000;
// Final wait before taking the screenshot, after all stability checks. This gives the browser
// additional time to paint any last-frame UI updates (e.g. Angular change detection triggered
// by play-function side-effects) that land after all other checks have passed.
const PRE_SCREENSHOT_WAIT_MS = 100;
// Number of stories to process in parallel. Each worker gets its own browser page so waits overlap.
const CONCURRENCY = 4;

// CSS injected into every story page to force all CSS animations and transitions to complete
// immediately, producing deterministic screenshots regardless of animation state.
const DISABLE_ANIMATIONS_CSS = `
  *, *::before, *::after {
    animation: none !important;
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition: none !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;

/** A story entry from Storybook's index.json. */
interface StoryEntry {
  id: string;
  type: string;
}

/** Result returned by screenshotStory for each story attempt. */
interface ScreenshotResult {
  storyId: string;
  success: boolean;
  skipped?: boolean;
  maxDiffPixels: number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Waits for the Storybook story's play function (if any) to complete.
 *
 * Polls window.__STORYBOOK_PREVIEW__.currentRender.phase until it is no longer
 * one of the known in-progress values. Using waitForFunction (polling) rather
 * than an event listener avoids the race condition where STORY_RENDERED fires
 * before the listener is registered.
 *
 * Resolves immediately when Storybook is absent. Waits until a render has started
 * (phase is non-null) and then until it exits all known busy phases.
 */
async function waitForPlayFunction(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const preview = (window as StorybookWindow).__STORYBOOK_PREVIEW__;
      if (preview == null) return true;
      const phase = preview?.currentRender?.phase;
      // If no render has started yet, keep waiting. Returning true here (proceed
      // immediately) would cause story parameters to never be cached, because
      // currentRender.story is only populated once rendering begins.
      if (phase == null) return false;
      // Cache story parameters in a window global the moment they are available.
      // currentRender.story (and its parameters) can be cleared once the play function
      // completes, so we must capture them while they are still present. The cached
      // value is read after this waitForFunction resolves.
      const params = preview?.currentRender?.story?.parameters;
      if (params != null) {
        (window as StorybookWindow).__SCREENSHOT_STORY_PARAMS__ = params;
      }
      // Wait while the story is known to be actively preparing, rendering, or
      // executing its play function. Any other phase (completed, played, errored,
      // aborted, …) is treated as terminal and we proceed.
      const busyPhases = ['preparing', 'preparing_args', 'preparing_story', 'loading', 'rendering', 'playing'];
      return !busyPhases.includes(phase);
    },
    { timeout: STORY_LOAD_TIMEOUT_MS }
  );
}

/**
 * Starts a local HTTP server serving the given directory using Python's built-in http.server module.
 * Returns the child process so it can be killed when no longer needed.
 */
function startHttpServer(directory: string): Deno.ChildProcess {
  return new Deno.Command('python3', {
    args: ['-m', 'http.server', String(SERVER_PORT), '--directory', directory],
    stdin: 'null',
    stdout: 'inherit',
    stderr: 'inherit'
  }).spawn();
}

/**
 * Polls the local HTTP server until it is accepting connections, then resolves.
 * Throws if the server does not respond within the allotted attempts.
 */
async function waitForServer(port: number, maxAttempts = 30, intervalMs = 500): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      // Any HTTP response (including 404) means the server is up.
      if (response.status != null) return;
    } catch {
      // Server not ready yet; wait before retrying.
    }
    await sleep(intervalMs);
  }
  throw new Error(`HTTP server on port ${port} did not start within ${maxAttempts * intervalMs} ms`);
}

/**
 * Takes a screenshot of a single story, retrying once on failure.
 * Returns { storyId, success, skipped, maxDiffPixels } where:
 *   skipped      is true when the story opts out via chromatic: { disableSnapshot: true }
 *   maxDiffPixels is the per-story pixel-count threshold from parameters.screenshot.maxDiffPixels,
 *                or null if not set
 */
async function screenshotStory(
  story: StoryEntry,
  context: BrowserContext,
  absOutputDir: string
): Promise<ScreenshotResult> {
  const { id: storyId } = story;
  const url = `http://localhost:${SERVER_PORT}/iframe.html?id=${storyId}&viewMode=story`;
  const screenshotPath = join(absOutputDir, `${storyId}.png`);

  let success = false;
  let maxDiffPixels: number | null = null;
  for (let attempt = 1; attempt <= 2 && !success; attempt++) {
    let page: Page | undefined;
    try {
      page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: STORY_LOAD_TIMEOUT_MS });

      // Wait for the story's play function (if any) to finish. Storybook 8 fires
      // STORY_RENDERED after both the component render and the play function complete.
      // waitForPlayFunction also caches story parameters into window.__SCREENSHOT_STORY_PARAMS__
      // while currentRender.story is still accessible (it may be cleared afterwards).
      await waitForPlayFunction(page);

      // Read story parameters from the window global cached during the poll loop, falling
      // back to currentRender in case the cache was not populated (e.g. very fast renders).
      const storyParams = await page.evaluate(() => {
        const preview = (window as StorybookWindow).__STORYBOOK_PREVIEW__;
        return (
          (window as StorybookWindow).__SCREENSHOT_STORY_PARAMS__ ?? preview?.currentRender?.story?.parameters ?? null
        );
      });

      // Check whether this story has opted out of snapshots (chromatic: { disableSnapshot: true }).
      if (storyParams?.chromatic?.disableSnapshot === true) {
        return { storyId, success: true, skipped: true, maxDiffPixels: null };
      }

      // Read the per-story pixel-count threshold for the diff comparison step.
      // Set via parameters.screenshot.maxDiffPixels in the story file.
      if (maxDiffPixels === null && typeof storyParams?.screenshot?.maxDiffPixels === 'number') {
        maxDiffPixels = storyParams.screenshot.maxDiffPixels;
      }

      // The play function promise resolves (and the Storybook phase becomes 'played') before
      // Angular's zone-scheduled change detection has had a chance to flush the resulting DOM
      // updates. Wait two animation frames: the first allows Angular's final change-detection
      // cycle to run; the second ensures those mutations are committed to the rendered frame.
      await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

      // Inject CSS that sets all animation and transition durations to zero so no new animations
      // can start or continue after this point.
      await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS });

      // Wait one animation frame for the style to take effect, then finish any Web Animations API
      // animations (e.g. Angular Material) that are already in-flight.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      await page.evaluate(() =>
        document.getAnimations().forEach(a => {
          try {
            a.finish();
          } catch (e) {}
        })
      );

      // Wait for Angular change-detection cycles triggered by the finish() calls to settle.
      await page.waitForTimeout(ANIMATION_SETTLE_MS);

      // Second pass: finish any animations that were started during the settle period
      // (e.g. by Angular responding to the first round of finish() calls).
      await page.evaluate(() =>
        document.getAnimations().forEach(a => {
          try {
            a.finish();
          } catch (e) {}
        })
      );

      // Final wait before capturing: gives the browser time to paint any remaining UI updates.
      await page.waitForTimeout(PRE_SCREENSHOT_WAIT_MS);

      await page.screenshot({ path: screenshotPath, fullPage: true });
      success = true;
    } catch (err) {
      if (attempt === 2) {
        console.error(`  ✗ ${storyId}: ${(err as Error).message}`);
      }
    } finally {
      await page?.close();
    }
  }
  return { storyId, success, maxDiffPixels };
}

async function main(): Promise<void> {
  const [storybookDir, outputDir] = Deno.args;

  if (storybookDir == null || outputDir == null) {
    console.error(
      'Usage: deno run --allow-read --allow-write --allow-net --allow-run --allow-env --allow-sys scripts/take-storybook-screenshots.mts <storybook-dir> <output-dir>'
    );
    Deno.exit(1);
  }

  const absStorybookDir = resolve(storybookDir);
  const absOutputDir = resolve(outputDir);

  Deno.mkdirSync(absOutputDir, { recursive: true });

  // Read the story index generated by the Storybook build.
  // Storybook 8+ produces index.json; each entry with type "story" is a story to screenshot.
  const indexPath = join(absStorybookDir, 'index.json');
  let indexData: { entries: Record<string, StoryEntry> };
  try {
    indexData = JSON.parse(Deno.readTextFileSync(indexPath));
  } catch (err) {
    console.error(`Failed to read ${indexPath}: ${(err as Error).message}`);
    Deno.exit(1);
  }

  const stories: StoryEntry[] = Object.values(indexData!.entries).filter((e: StoryEntry) => e.type === 'story');
  console.log(`Found ${stories.length} stories`);

  const server: Deno.ChildProcess = startHttpServer(absStorybookDir);

  // Wait until the HTTP server is actually accepting connections rather than using a fixed sleep.
  await waitForServer(SERVER_PORT);

  let browser: Browser | undefined;
  let exitCode = 0;

  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    // reducedMotion: 'reduce' causes the browser to honour prefers-reduced-motion media queries,
    // which Angular Material and other libraries use to skip or shorten animations.
    const context: BrowserContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      reducedMotion: 'reduce'
    });

    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    const failedStories: string[] = [];
    const skippedStories: string[] = [];
    // Maps story ID → maxDiffPixels for use by the compare script.
    const storyMaxDiffPixels: Record<string, number> = {};

    // Process stories in parallel using a shared work queue. Each worker picks the next story
    // from the queue until it is empty, so slow stories do not block faster ones.
    const queue: StoryEntry[] = [...stories];
    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const story = queue.shift()!;
        const {
          storyId,
          success,
          skipped: wasSkipped,
          maxDiffPixels
        } = await screenshotStory(story, context, absOutputDir);
        if (wasSkipped) {
          console.log(`  - ${storyId} (skipped: chromatic.disableSnapshot)`);
          skippedStories.push(storyId);
          skipped++;
        } else if (success) {
          console.log(`  ✓ ${storyId}`);
          succeeded++;
        } else {
          failedStories.push(storyId);
          failed++;
        }
        if (maxDiffPixels != null) {
          storyMaxDiffPixels[storyId] = maxDiffPixels;
        }
      }
    }

    // Launch CONCURRENCY workers; they all draw from the same queue so the total work is evenly spread.
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    // Write metadata alongside the screenshots so the compare script can:
    //   • exclude stories skipped via chromatic.disableSnapshot from the diff report, and
    //   • apply per-story pixel-count thresholds (parameters.screenshot.maxDiffPixels).
    const metadata = { skipped: skippedStories, maxDiffPixels: storyMaxDiffPixels };
    Deno.writeTextFileSync(join(absOutputDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    console.log(`\nCompleted: ${succeeded} succeeded, ${skipped} skipped, ${failed} failed`);
    if (failedStories.length > 0) {
      console.log('Failed stories:');
      for (const id of failedStories) {
        console.log(`  - ${id}`);
      }
      exitCode = 1;
    }
  } finally {
    await browser?.close();
    server.kill();
  }

  Deno.exit(exitCode);
}

main().catch(err => {
  console.error(err);
  Deno.exit(1);
});
