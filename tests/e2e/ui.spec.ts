import { test, expect } from '@playwright/test';
import {
  resetApp,
  completeOnboarding,
  assertNoHorizontalOverflow,
  assertVisibleButtonsAreNotClipped,
} from './helpers';

test.describe('APEX UI/UX and responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await completeOnboarding(page);
  });

  test('home has no viewport overflow and visible controls stay usable', async ({ page }) => {
    await assertNoHorizontalOverflow(page);
    await assertVisibleButtonsAreNotClipped(page);

    await expect(
      page.locator('.apex-live-status i')
    ).toBeVisible();

    await expect(
      page.locator('.apex-hero-core')
    ).toBeVisible();
  });

  test('core navigation works without dead buttons', async ({ page }) => {
    const trainButton = page.getByRole('button', {
      name: 'Train',
      exact: true,
    });

    const progressButton = page.getByRole('button', {
      name: 'Progress',
      exact: true,
    });

    const youButton = page.getByRole('button', {
      name: 'You',
      exact: true,
    });

    const homeButton = page.getByRole('button', {
      name: 'APEX Home',
      exact: true,
    });

    await trainButton.click();

    await expect(
      page.locator('[data-apex-route="train"]')
    ).toBeVisible();

    await progressButton.click();

    await expect(
      page.locator('[data-apex-route="progress"]')
    ).toBeVisible();

    await youButton.click();

    await expect(
      page.locator('[data-apex-route="you"]')
    ).toBeVisible();

    await homeButton.click();

    await expect(
      page.locator('[data-apex-route="home"]')
    ).toBeVisible();
  });

  test('command center routes natural-language shortcuts correctly', async ({ page }) => {
    const commandCenter = page.getByRole('button', {
      name: 'Command Center',
      exact: true,
    });

    await commandCenter.click();

    await expect(
      page.getByRole('dialog')
    ).toBeVisible();

    await page.getByRole('button', {
      name: /Show my progress/i,
    }).click();

    await expect(
      page.locator('[data-apex-route="progress"]')
    ).toBeVisible();

    await commandCenter.click();

    await page.getByRole('button', {
      name: /Explain RIR/i,
    }).click();

    await expect(
      page.locator('[data-apex-route="learn"]')
    ).toBeVisible();
  });

  test('animations are present in normal mode and collapse under reduced motion', async ({ page }) => {
    const animatedIndicator = page.locator(
      '.apex-live-status i'
    );

    /*
     * Normal mode is tested on the Home route because the live-status
     * indicator belongs to the Home UI.
     */
    await expect(
      page.locator('[data-apex-route="home"]')
    ).toBeVisible();

    await expect(animatedIndicator).toBeVisible();

    const normalAnimation = await animatedIndicator.evaluate(
      (el) => ({
        name: getComputedStyle(el).animationName,
        duration: getComputedStyle(el).animationDuration,
      })
    );

    expect(normalAnimation.name).not.toBe('none');

    /*
     * Reduce motion is an actual APEX accessibility setting on the
     * You screen. Use the real control instead of manipulating
     * repository/localStorage internals.
     */
    await page.getByRole('button', {
      name: 'You',
      exact: true,
    }).click();

    await expect(
      page.locator('[data-apex-route="you"]')
    ).toBeVisible();

    const reduceMotion = page.getByRole('checkbox', {
      name: 'Reduce motion',
      exact: true,
    });

    await expect(reduceMotion).toBeVisible();
    await expect(reduceMotion).not.toBeChecked();

    await reduceMotion.check();

    await expect(reduceMotion).toBeChecked();

    /*
     * The accessibility layer should immediately expose the
     * reduced-motion state on the application root.
     */
    await expect(
      page.locator('.app')
    ).toHaveClass(/(?:^|\s)reduce-motion(?:\s|$)/);

    /*
     * Return to Home because the animated live-status indicator
     * exists there, not on the You/settings screen.
     */
    await page.getByRole('button', {
      name: 'APEX Home',
      exact: true,
    }).click();

    await expect(
      page.locator('[data-apex-route="home"]')
    ).toBeVisible();

    await expect(animatedIndicator).toBeVisible();

    const reducedAnimation = await animatedIndicator.evaluate(
      (el) => {
        const style = getComputedStyle(el);

        const durationSeconds =
          parseFloat(style.animationDuration) || 0;

        return {
          name: style.animationName,
          duration: style.animationDuration,
          durationSeconds,
        };
      }
    );

    /*
     * Reduced motion must completely disable the animation.
     *
     * Browsers may serialize an extremely small CSS duration in
     * different forms, for example:
     *
     *   0s
     *   0.01s
     *   1e-05s
     *
     * What matters is that the effective duration is essentially zero.
     */
    expect(reducedAnimation.name).toBe('none');

    expect(
      reducedAnimation.durationSeconds
    ).toBeLessThanOrEqual(0.01);
  });

  test('mobile and tablet layouts remain inside the viewport', async ({ page }) => {
    await assertNoHorizontalOverflow(page);

    await page.getByRole('button', {
      name: 'Train',
      exact: true,
    }).click();

    await expect(
      page.locator('[data-apex-route="train"]')
    ).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await assertVisibleButtonsAreNotClipped(page);
  });
});

test('all first-class application routes render instead of dead-ending', async ({ page }) => {
  await resetApp(page);
  await completeOnboarding(page);

  const routes = [
    { query: 'Show my progress', route: 'progress' },
    { query: 'Open history', route: 'history' },
    { query: 'Open goals', route: 'goals' },
    { query: 'Open measurements', route: 'measurements' },
    { query: 'Open my plan', route: 'plan' },
    { query: 'Open templates', route: 'templates' },
    { query: 'Explain RIR', route: 'learn' },
    { query: 'Find chest press exercises', route: 'library' },
    { query: 'Open coach', route: 'coach' },
  ];

  for (const item of routes) {
    const commandCenter = page.getByRole('button', {
      name: 'Command Center',
      exact: true,
    });

    await commandCenter.click();

    const dialog = page.getByRole('dialog');

    await expect(dialog).toBeVisible();

    const input = dialog.locator('input').first();

    await input.fill(item.query);
    await input.press('Enter');

    await expect(
      page.locator(`[data-apex-route="${item.route}"]`)
    ).toBeVisible();
  }
});