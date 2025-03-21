import { test } from '@playwright/test';
import { logInAsPTUser } from './pt_login.mjs';
import secrets from './secrets.json';

test('test', async ({ page }) => {
  const user = secrets.users[0];
  logInAsPTUser(page, user);
});
