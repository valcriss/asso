import { expect, test } from '@playwright/test';

const loginResponse = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 3600,
  user: {
    id: 'user-1',
    email: 'admin@example.org',
    roles: ['ADMIN'],
  },
  organization: {
    id: 'org-1',
    name: 'Association Demo',
  },
};

test('allows an administrator to log in and reach the dashboard', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    const request = route.request();
    const body = await request.postDataJSON();

    expect(body).toMatchObject({
      email: 'admin@example.org',
      password: 'StrongPass123!',
    });

    await route.fulfill({
      status: 200,
      json: loginResponse,
    });
  });

  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill('admin@example.org');
  await page.getByLabel('Mot de passe').fill('StrongPass123!');

  const navigationPromise = page.waitForURL('**/');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await navigationPromise;

  await expect(page).toHaveURL('**/');
  await expect(page.getByRole('heading', { name: /bienvenue/i })).toBeVisible();

  const storedSession = await page.evaluate(() => window.localStorage.getItem('asso.auth.session'));
  expect(storedSession).not.toBeNull();

  const parsed = JSON.parse(storedSession ?? '{}');
  expect(parsed).toMatchObject({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: { email: 'admin@example.org' },
    organization: { id: 'org-1' },
  });
});
