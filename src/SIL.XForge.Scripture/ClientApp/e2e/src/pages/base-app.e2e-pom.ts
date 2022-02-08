import { BasePage } from './base.e2e-pom';

export class BaseAppPage extends BasePage {
  header = {
    titleBar: this.page.locator('mdc-top-app-bar-title.mdc-top-app-bar__title')
  };
}
