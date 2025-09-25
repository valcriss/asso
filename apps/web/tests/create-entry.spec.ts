import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'asso.auth.session';

const dashboardPayload = {
  data: {
    fiscalYears: [
      {
        id: 'fy-1',
        label: 'Exercice 2025',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        status: 'OPEN',
        lockedAt: null,
      },
    ],
    currentFiscalYear: {
      id: 'fy-1',
      label: 'Exercice 2025',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      status: 'OPEN',
      lockedAt: null,
    },
    journals: [
      {
        id: 'journal-1',
        code: 'BAN',
        name: 'Banque',
        nextReference: '2025-BAN-000010',
        lastReference: '2025-BAN-000009',
        lastEntryDate: '2025-05-12',
      },
    ],
  },
};

const accountsPayload = {
  data: [
    { id: 'acc-1', code: '512000', name: 'Banque' },
    { id: 'acc-2', code: '606000', name: 'Fournitures' },
  ],
};

const journalsPayload = {
  data: [{ id: 'journal-1', code: 'BAN', name: 'Banque' }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const session = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt,
      user: { id: 'user-1', email: 'admin@example.com', roles: ['ADMIN'] },
      organization: { id: 'org-1', name: 'Association Demo' },
    };
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey: STORAGE_KEY });
});

test('allows creating an entry with two balanced lines', async ({ page }) => {
  await page.route('**/api/v1/orgs/org-1/accounting/dashboard', async (route) => {
    await route.fulfill({ json: dashboardPayload });
  });
  await page.route('**/api/v1/orgs/org-1/accounts', async (route) => {
    await route.fulfill({ json: accountsPayload });
  });
  await page.route('**/api/v1/orgs/org-1/journals', async (route) => {
    await route.fulfill({ json: journalsPayload });
  });
  let createRequestBody: unknown;
  await page.route('**/api/v1/orgs/org-1/entries', async (route) => {
    createRequestBody = await route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: { data: { reference: '2025-BAN-000010' } },
    });
  });

  await page.goto('/comptabilite/ecritures/nouvelle');

  const accountInputs = page.locator('input[placeholder="512000 — Banque"]');
  await expect(accountInputs).toHaveCount(2);
  await accountInputs.nth(0).fill('512000');
  await page.getByText('512000 — Banque').click();
  await accountInputs.nth(1).fill('606000');
  await page.getByText('606000 — Fournitures').click();

  const numberInputs = page.locator('input[type="number"]');
  await numberInputs.nth(0).fill('300');
  await numberInputs.nth(3).fill('300');

  await page.getByRole('button', { name: /Enregistrer l'écriture/i }).click();

  await expect(page.getByText(/L'écriture a été créée/)).toBeVisible();

  expect(createRequestBody).toMatchObject({
    fiscalYearId: 'fy-1',
    journalId: 'journal-1',
    lines: [
      { accountId: 'acc-1', debit: '300.00', credit: '0.00' },
      { accountId: 'acc-2', debit: '0.00', credit: '300.00' },
    ],
  });
});
