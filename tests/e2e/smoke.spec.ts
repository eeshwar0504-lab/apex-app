import { test, expect } from '@playwright/test';

test.describe('APEX application smoke test', () => {
  test('launches successfully', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/APEX|apex/i);
  });

  test('renders the APEX interface', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('APEX', { exact: true }).first()).toBeVisible();
  });
});