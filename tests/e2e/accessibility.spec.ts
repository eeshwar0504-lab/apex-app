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

  test('text-size setting changes rendered text and remains contained', async ({ page }) => {
    const eyebrow=page.locator('.a3-greet .a3-eyebrow');
    const systemSize=await eyebrow.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));

    await page.getByRole('button',{name:'You',exact:true}).click();
    const scale=page.getByLabel('Text size');
    await scale.selectOption('large');
    await expect(page.locator('.app')).toHaveClass(/font-large/);

    await page.getByRole('button',{name:'APEX Home',exact:true}).click();
    await expect(page.locator('[data-apex-route="home"]')).toBeVisible();
    const largeSize=await eyebrow.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    expect(largeSize).toBeGreaterThan(systemSize);

    await page.getByRole('button',{name:'You',exact:true}).click();
    await scale.selectOption('larger');
    await expect(page.locator('.app')).toHaveClass(/font-larger/);

    await page.setViewportSize({width:360,height:800});
    await page.getByRole('button',{name:'APEX Home',exact:true}).click();
    await expect(page.locator('[data-apex-route="home"]')).toBeVisible();
    const largerSize=await eyebrow.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    expect(largerSize).toBeGreaterThan(largeSize);
    await assertNoHorizontalOverflow(page);
  });
});