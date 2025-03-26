import { Locator, Page } from "npm:playwright";
import { runSheet } from "./e2e-globals.ts";

export class UserEmulator {
  constructor(private readonly page: Page) {}

  async click(locator: Locator): Promise<void> {
    await this.beforeAction(locator);
    await locator.click();
    await this.afterAction();
  }

  async check(locator: Locator): Promise<void> {
    await this.beforeAction(locator);
    await locator.check();
    await this.afterAction();
  }

  async type(text: string): Promise<void> {
    // wait for the focused element to be an input
    const document = {} as any;
    await this.page.waitForFunction(() => ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName));
    await this.page.keyboard.type(text, { delay: this.typingDelay });
    await this.afterAction();
  }

  async clearField(locator: Locator): Promise<void> {
    const characterCount = await locator.evaluate(el => el.value.length);
    for (let i = 0; i <= characterCount; i++) {
      await this.page.waitForTimeout(this.typingDelay / 2);
      await this.page.keyboard.press("Backspace");
    }
  }

  get typingDelay(): number {
    return runSheet.skipUserDelays ? 0 : 70;
  }

  get clickDelay(): number {
    return runSheet.skipUserDelays ? 0 : runSheet.clickDelay;
  }

  /** Delays the specified time unless the run sheet specifies that all user delays are skipped.  */
  async wait(time: number): Promise<void> {
    if (!runSheet.skipUserDelays) await this.page.waitForTimeout(time);
  }

  private async beforeAction(locator: Locator): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    const rect = await locator.boundingBox();
    if (rect == null) throw new Error("Bounding client rect not found");
    await this.page.waitForTimeout(this.clickDelay / 2);
    await this.page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await this.page.waitForTimeout(this.clickDelay);
  }

  private async afterAction(): Promise<void> {
    await this.page.waitForTimeout(this.clickDelay / 2);
  }
}
