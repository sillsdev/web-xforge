import { BasePage } from './base.e2e-pom';

export class Auth0Page extends BasePage {
  tabs = {
    login: {
      emailInput: this.page.locator("input[name='email']"),
      passwordInput: this.page.locator("input[name='password']")
    }
  };
}
