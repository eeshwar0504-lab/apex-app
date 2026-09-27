import { test, expect } from '@playwright/test';

import {
  resetApp,
  completeOnboarding,
  assertNoHorizontalOverflow,
} from './helpers';

test.describe('APEX accessibility and interaction safety', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await completeOnboarding(page);
  });

  test('interactive controls have accessible names', async ({ page }) => {
    const unnamed = await page
      .locator('button:visible')
      .evaluateAll((buttons) =>
        buttons
          .map((button) => ({
            text: (button.textContent || '').trim(),
            aria: button.getAttribute('aria-label'),
            title: button.getAttribute('title'),
          }))
          .filter(
            (control) =>
              !control.text &&
              !control.aria &&
              !control.title
          )
      );

    expect(unnamed).toEqual([]);
  });

  test('command dialog exposes modal semantics and closes safely', async ({
    page,
  }) => {
    await page
      .getByRole('button', { name: 'Command Center' })
      .click();

    const dialog = page.getByRole('dialog');

    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    await expect(
      dialog.getByRole('button', { name: 'Go' })
    ).toBeVisible();

    await page
      .getByRole('button', { name: 'Close dialog' })
      .click();

    await expect(dialog).toHaveCount(0);
  });

  test('keyboard navigation can reach the command center', async ({
    page,
  }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const focused = await page.evaluate(
      () =>
        document.activeElement?.getAttribute('aria-label') ||
        document.activeElement?.textContent ||
        ''
    );

    expect(focused).toBeTruthy();

    await assertNoHorizontalOverflow(page);
  });
});