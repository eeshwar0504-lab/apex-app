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
      page.getByText('CORE ONLINE', { exact: true })
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
});