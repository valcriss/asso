import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'asso.auth.session';

function seedSession(page: import('@playwright/test').Page) {
  return page.addInitScript(({ storageKey }) => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const session = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt,
      user: {
        id: 'user-1',
        email: 'admin@example.com',
        roles: ['ADMIN'],
      },
      organization: { id: 'org-1', name: 'Association Demo' },
    };
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey: STORAGE_KEY });
}

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

test('dashboard has no detectable a11y violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('settings page meets accessibility expectations', async ({ page }) => {
  await page.goto('/parametres');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
