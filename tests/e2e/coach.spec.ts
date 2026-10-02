import { test, expect } from '@playwright/test';

import {
  resetApp,
  completeOnboarding,
} from './helpers';

test.describe('APEX Coach', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await completeOnboarding(page);
  });

  test('coach opens from Home and returns a grounded decision', async ({
    page,
  }) => {
    await page
      .getByRole('button', { name: /Ask Coach/i })
      .first()
      .click();

    const coachRoute = page.locator('[data-apex-route="coach"]');

    await expect(coachRoute).toBeVisible();

    await expect(
      page.getByRole('heading', { name: 'APEX Coach' })
    ).toBeVisible();

    const input = page.getByRole('textbox', {
      name: 'Ask APEX Coach',
    });

    await expect(input).toBeVisible();

    await input.fill('What should I do next?');
    await input.press('Enter');

    const userMessage = page
      .locator('.apex-message.user')
      .last();

    const apexMessage = page
      .locator('.apex-message.apex')
      .last();

    await expect(userMessage).toBeVisible();
    await expect(userMessage).toContainText('What should I do next?');

    await expect(apexMessage).toBeVisible();

    // APEX's current Coach response exposes the actionable
    // recommendation as "Next:" rather than "Decision:".
    await expect(apexMessage).toContainText(/Next:/i);

    await expect(apexMessage).toContainText(/Confidence:/i);
  });

  test('coach button works with mouse click as well as Enter', async ({
    page,
  }) => {
    await page
      .getByRole('button', { name: /Ask Coach/i })
      .first()
      .click();

    const input = page.getByRole('textbox', {
      name: 'Ask APEX Coach',
    });

    await expect(input).toBeVisible();

    await input.fill('Why this exercise?');

    const askButton = page.getByRole('button', {
      name: 'Ask APEX Coach',
    });

    await expect(askButton).toBeVisible();
    await expect(askButton).toBeEnabled();

    await askButton.click();

    const userMessage = page
      .locator('.apex-message.user')
      .last();

    const apexMessage = page
      .locator('.apex-message.apex')
      .last();

    await expect(userMessage).toBeVisible();
    await expect(userMessage).toContainText('Why this exercise?');

    await expect(apexMessage).toBeVisible();
    await expect(apexMessage).toContainText(/Confidence:/i);
  });
  test('Coach 2.0: the briefing, the weekly card and a contextual question', async ({ page }) => {
    // a brand-new Home is just the next step; the briefing lives on the Coach screen
    await expect(page.locator('[data-coach-next]')).toHaveCount(0);

    await page.getByRole('button', { name: /Ask Coach/i }).first().click();
    const briefing = page.getByRole('region', { name: 'Coach briefing' });
    await expect(briefing).toBeVisible();
    await expect(briefing.locator('[data-coach-next-step]')).not.toBeEmpty();
    await expect(briefing).toHaveAttribute('data-coach-status', /insufficient_data|on_track|attention|recovery/);

    const input = page.getByRole('textbox', { name: 'Ask APEX Coach' });
    await input.fill('How did I do this week?');
    await input.press('Enter');
    const reply = page.locator('.apex-message.apex').last();
    await expect(reply).toContainText(/no completed sessions to review|Week of /);
    await expect(reply).toContainText(/Confidence:/i);

    await input.fill('When should I deload?');
    await input.press('Enter');
    await expect(page.locator('.apex-message.apex').last()).toContainText(/not a medical assessment/);

    // with no completed workout Progress explains itself instead of showing empty analytics (the weekly card is covered by weekly-analytics.test.cjs)
    await page.getByRole('button', { name: 'Progress', exact: true }).first().click();
    await expect(page.getByText('Your progress starts with your first workout')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Weekly analytics' })).toHaveCount(0);
  });
});
