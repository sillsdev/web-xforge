import { preset, ScreenshotContext } from './e2e-globals.ts';

interface ScreenshotEvent {
  fileName: string;
  context: ScreenshotContext;
}

export class E2ETestRunLogger {
  private timeStarted = new Date();
  private screenshotEvents: ScreenshotEvent[] = [];

  async saveToFile(): Promise<void> {
    const data = {
      timeStarted: this.timeStarted,
      timeEnded: new Date(),
      preset,
      screenshotEvents: this.screenshotEvents
    };

    const filePath = `${preset.outputDir}/run_log.json`;
    console.log(`Saving run log to ${filePath}...`);
    await Deno.writeTextFile(filePath, JSON.stringify(data, null, 2));
  }

  logScreenshot(fileName: string, context: ScreenshotContext): void {
    this.screenshotEvents.push({ fileName, context });
  }
}
