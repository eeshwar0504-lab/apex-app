import { test, expect } from '@playwright/test';

import { resetApp, completeOnboarding } from './helpers';

const token = (page: import('@playwright/test').Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.querySelector('.app')!).getPropertyValue(n).trim(), name);

test.describe('APEX motion and interaction system', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await completeOnboarding(page);
  });

  test('a sheet closes through its exit state, once, and focus returns to what opened it', async ({ page }) => {
    const opener = page.getByRole('button', { name: 'Command Center', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape'); // a second press during the exit must not break anything
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('motion tokens resolve, and the APEX reduced-motion preference collapses them', async ({ page }) => {
    expect(await token(page, '--motion-exit')).toMatch(/^(160ms|0?.16s)$/);
    expect(await token(page, '--press-scale')).toBe('.97');

    await page.evaluate(() => document.querySelector('.app')!.classList.add('reduce-motion'));
    expect(await token(page, '--motion-exit')).toMatch(/^0?\.01ms$/);
    expect(await token(page, '--press-scale')).toBe('1');
    expect(await token(page, '--rise-distance')).toBe('0px');

    // with motion collapsed a sheet still opens and closes, immediately
    await page.getByRole('button', { name: 'Command Center', exact: true }).click();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the OS reduced-motion setting collapses the tokens too', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await token(page, '--motion-base')).toMatch(/^0?\.01ms$/);
    expect(await token(page, '--stagger-step')).toBe('0ms');
  });

  test('screens arrive forward by default and the bottom navigation keeps a 44px touch target', async ({ page }) => {
    await expect(page.locator('.page-transition').first()).toHaveAttribute('data-nav-dir', 'forward');
    const items = page.locator('.nav-item');
    const n = await items.count();
    expect(n).toBeGreaterThan(3);
    for (let i = 0; i < n; i++) {
      const box = await items.nth(i).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
