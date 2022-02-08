import { Page } from '@playwright/test';

export class BasePage {
  constructor(public readonly page: Page) {}
}
