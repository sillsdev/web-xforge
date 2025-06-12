/// <reference lib="dom" />
import { Locator, Page } from "npm:playwright";
import { preset } from "./e2e-globals.ts";

export class UserEmulator {
  constructor(private readonly page: Page) {}

  async info(message: string, time = 3_000): Promise<void> {
    await this.page.evaluate(message => {
      const div = document.createElement("div");
      div.id = "info-message";
      div.textContent = message;
      div.style.position = "absolute";
      div.style.top = "0";
      div.style.left = "0";
      div.style.right = "0";
      div.style.bottom = "0";
      div.style.zIndex = "1000000";
      div.style.background = "black";
      div.style.color = "white";
      div.style.fontFamily = "Roboto";
      div.style.fontSize = "3em";
      div.style.display = "flex";
      div.style.alignItems = "center";
      div.style.justifyContent = "center";

      document.body.appendChild(div);
    }, message);
    await this.page.waitForTimeout(preset.defaultUserDelay === 0 ? 0 : time);
    await this.page.evaluate(() => document.getElementById("info-message")?.remove());
  }

  async click(locator: Locator): Promise<void> {
    await this.beforeAction(locator);
    await locator.click();
    await this.afterAction();
  }

  async hover(locator: Locator, offset = { x: 0.5, y: 0.5 }): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    const rect = await locator.boundingBox();
    if (rect == null) throw new Error("Bounding client rect not found");
    await this.page.mouse.move(rect.x + rect.width * offset.x, rect.y + rect.height * offset.y);
    await this.afterAction();
  }

  async check(locator: Locator): Promise<void> {
    await this.beforeAction(locator);
    await locator.check();
    await this.afterAction();
  }

  async type(text: string): Promise<void> {
    // wait for the focused element to be an input, textarea, or contenteditable
    await this.page.waitForFunction(() => {
      const el = document.activeElement as HTMLElement | null;
      return el != null && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true);
    });
    await this.page.keyboard.type(text, { delay: this.typingDelay });
    await this.afterAction();
  }

  async clearField(locator: Locator): Promise<void> {
    const characterCount = await locator.evaluate((el: HTMLInputElement) => el.value.length);
    for (let i = 0; i <= characterCount; i++) {
      await this.page.waitForTimeout(this.typingDelay / 2);
      await this.page.keyboard.press("Backspace");
    }
  }

  get typingDelay(): number {
    return preset.defaultUserDelay === 0 ? 0 : 70;
  }

  get clickDelay(): number {
    return preset.defaultUserDelay;
  }

  /** Delays the specified time unless the test preset specifies that the default delay is 0.  */
  async wait(time: number): Promise<void> {
    if (preset.defaultUserDelay !== 0) await this.page.waitForTimeout(time);
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
