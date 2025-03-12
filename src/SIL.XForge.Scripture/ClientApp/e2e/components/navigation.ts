import { Locator, Page } from 'npm:playwright';

const locatorStrings = {
  translate_overview: `a[href$="/translate"]`,
  edit_review: `a[href*="/translate/"]`,
  generate_draft: `a[href$="/draft-generation"]`,
  manage_questions: `a[href$="/checking"]`,
  questions_answers: `a[href*="/checking/"]`,
  sync: `a[href$="/sync"]`,
  users: `a[href$="/users"]`,
  settings: `a[href$="/settings"]`
};

export function navLocator(page: Page, menuItem: keyof typeof locatorStrings): Locator {
  return page.locator('app-navigation').locator(locatorStrings[menuItem]);
}
