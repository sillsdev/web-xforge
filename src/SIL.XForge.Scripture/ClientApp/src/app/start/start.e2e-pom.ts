import { BaseAppPage } from '../../../e2e/src/pages/base-app.e2e-pom';

export class StartPage extends BaseAppPage {
  paragraphDescription = this.page.locator('p.mdc-typography--body1');
}
