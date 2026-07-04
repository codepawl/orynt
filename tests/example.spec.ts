import { test, expect } from '@playwright/test';

test('renders the CodePawl landing page', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/CodePawl/);
  await expect(page.getByRole('heading', { level: 1, name: 'Give AI agents a working brain.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download CodePawl' })).toHaveAttribute('href', '/access');
});

test('navigates to local pricing route', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Pricing' }).click();

  await expect(page).toHaveURL('/pricing');
  await expect(page.getByRole('heading', { name: 'Simple, predictable pricing.' })).toBeVisible();
});
