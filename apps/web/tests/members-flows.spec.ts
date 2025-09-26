import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'asso.auth.session';

function seedSession(page) {
  return page.addInitScript(({ storageKey }) => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const session = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt,
      user: {
        id: 'user-2',
        email: 'tresorier@example.org',
        displayName: 'Trésorier Demo',
        roles: ['TREASURER', 'VIEWER'],
      },
      organization: { id: 'org-1', name: 'Association Demo' },
    };
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey: STORAGE_KEY });
}

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

test('affiche une alerte de relance prioritaire', async ({ page }) => {
  await page.goto('/membres/statuts-cotisations');

  const banner = page.getByTestId('reminder-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('relance(s) urgentes');
});

test('propose le téléchargement du reçu dans le portail adhérent', async ({ page }) => {
  await page.goto('/portail/membre');

  const receiptLink = page.getByTestId('download-receipt').first();
  await expect(receiptLink).toBeVisible();
  await expect(receiptLink).toHaveAttribute('download', /recu_cotisation_/);
  await expect(receiptLink).toHaveAttribute('href', /\/documents\/recus\//);
});
