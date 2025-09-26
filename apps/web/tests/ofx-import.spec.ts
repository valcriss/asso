import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'asso.auth.session';

const ofxContent = `
<OFX>
  <BANKTRANLIST>
    <STMTTRN>
      <TRNTYPE>CREDIT
      <DTPOSTED>20250305
      <TRNAMT>250.00
      <FITID>20250305001
      <NAME>COTISATIONS MEMBRES MARS
      <MEMO>Cotisations mars</MEMO>
    </STMTTRN>
    <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20250308
      <TRNAMT>-145.50
      <FITID>20250308001
      <NAME>FACTURE IMPRIMEUR AVRIL
      <MEMO>Facture imprimeur</MEMO>
    </STMTTRN>
    <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20250316
      <TRNAMT>-32.80
      <FITID>20250316001
      <NAME>FRAIS BANCAIRES MARS
      <MEMO>Frais de tenue de compte</MEMO>
    </STMTTRN>
  </BANKTRANLIST>
</OFX>
`;

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

test('import OFX et lettrage manuel', async ({ page }) => {
  await page.goto('/comptabilite/import-ofx');

  await page.setInputFiles('input[type="file"]', {
    name: 'transactions.ofx',
    mimeType: 'application/x-ofx',
    buffer: Buffer.from(ofxContent),
  });

  await expect(page.getByTestId('ofx-progress')).toBeVisible();
  await expect(page.getByText('Transactions importées')).toBeVisible();
  const examinerButtons = page.getByRole('button', { name: 'Examiner' });
  await expect(examinerButtons).toHaveCount(3);

  await examinerButtons.nth(0).click();
  await page.getByRole('button', { name: 'Valider le lettrage' }).click();
  await expect(page.getByText('Correspondance validée.')).toBeVisible();

  await examinerButtons.nth(1).click();
  await page.getByRole('button', { name: 'Valider le lettrage' }).click();
  await expect(page.getByText('Correspondance validée.')).toBeVisible();

  await examinerButtons.nth(2).click();
  await page.getByLabel('Référence comptable').fill('2025-BANQ-000200');
  await page.getByLabel('Compte contrepartie').fill('627000 — Frais bancaires');
  await page.getByRole('button', { name: /Créer l'écriture lettrée/i }).click();

  const manualHistoryEntry = page.getByText(/Lettrage manuel avec création 2025-BANQ-000200/).first();
  await expect(manualHistoryEntry).toBeVisible();
  await expect(page.getByText(/Lettrage manuel avec création 2025-BANQ-000200/)).toHaveCount(2);

  const remainingCard = page.getByRole('heading', { name: 'Transactions restantes' }).locator('xpath=ancestor::article');
  await expect(
    remainingCard.getByText('Toutes les transactions importées ont été lettrées.')
  ).toBeVisible();

  await expect(page.getByText(/Lettrage confirmé avec/)).toHaveCount(2);
});
