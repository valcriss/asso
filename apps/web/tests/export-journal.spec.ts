import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'asso.auth.session';

const dashboardResponse = {
  data: {
    fiscalYears: [
      {
        id: 'fy-2025',
        label: 'Exercice 2025',
        status: 'OPEN',
      },
    ],
    currentFiscalYear: {
      id: 'fy-2025',
      label: 'Exercice 2025',
      status: 'OPEN',
    },
  },
};

const reportResponse = {
  data: {
    fiscalYear: { id: 'fy-2025', label: 'Exercice 2025' },
    totals: { debit: 600, credit: 600 },
    entries: [
      {
        entryId: 'entry-1',
        date: '2025-01-10',
        reference: '2025-BAN-000010',
        memo: 'Adhésions janvier',
        journal: { id: 'journal-1', code: 'BAN', name: 'Banque' },
        totals: { debit: 600, credit: 600 },
        lines: [
          {
            lineId: 'line-1',
            accountCode: '512000',
            accountName: 'Banque',
            debit: 600,
            credit: 0,
          },
          {
            lineId: 'line-2',
            accountCode: '706000',
            accountName: 'Cotisations',
            debit: 0,
            credit: 600,
          },
        ],
      },
    ],
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const session = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt,
      user: { id: 'user-1', email: 'admin@example.org', roles: ['ADMIN'] },
      organization: { id: 'org-1', name: 'Association Demo' },
    };
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey: STORAGE_KEY });
});

test('downloads the journal report as CSV', async ({ page }) => {
  await page.route('**/api/v1/orgs/org-1/accounting/dashboard', async (route) => {
    await route.fulfill({ json: dashboardResponse });
  });

  await page.route('**/api/v1/orgs/org-1/reports/journal?fiscalYearId=fy-2025', async (route) => {
    await route.fulfill({ json: reportResponse });
  });

  await page.route('**/api/v1/orgs/org-1/reports/journal?fiscalYearId=fy-2025&format=csv', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/csv' },
      body: 'reference;date;libelle\n2025-BAN-000010;2025-01-10;Adhésions',
    });
  });

  await page.goto('/comptabilite/journal');
  await expect(page.getByRole('heading', { name: 'Journal comptable' })).toBeVisible();
  await expect(page.getByText('1 écritures trouvées')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exporter CSV/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('journal-fy-2025.csv');
});
