import { OUTPUT_DIR, runSheet, ScreenshotContext } from './e2e-globals';

interface ScreenshotEvent {
  fileName: string;
  context: ScreenshotContext;
}

export class E2ETestRunLogger {
  private timeStarted = new Date();
  private screenshotEvents: ScreenshotEvent[] = [];

  async saveToFile(): Promise<void> {
    console.log('Saving run log to file...');
    const data = {
      timeStarted: this.timeStarted,
      timeEnded: new Date(),
      runSheet,
      screenshotEvents: this.screenshotEvents
    };
    await Deno.writeTextFile(`${OUTPUT_DIR}/run_log.json`, JSON.stringify(data, null, 2));
  }

  logScreenshot(fileName: string, context: ScreenshotContext): void {
    this.screenshotEvents.push({ fileName, context });
  }
}
