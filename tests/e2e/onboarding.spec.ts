import { test, expect } from '@playwright/test';
import { resetApp, completeOnboarding } from './helpers';

test.describe('APEX onboarding contract', () => {
  test('blocks progression until required choices are explicitly selected', async ({ page }) => {
    await resetApp(page);

    const continueButton = page.getByRole('button', { name: /^Continue/ });

    // Step 1: Intro
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    // Step 2: Training experience
    await expect(continueButton).toBeDisabled();

    const beginner = page.getByRole('button', { name: 'Beginner' });

    await expect(beginner).not.toHaveClass(/selected/);

    await beginner.click();

    await expect(beginner).toHaveClass(/selected/);
    await expect(continueButton).toBeEnabled();

    await continueButton.click();

    // Step 3: Training goal
    await expect(continueButton).toBeDisabled();

    const buildMuscle = page.getByRole('button', { name: /Build muscle/i });

    await buildMuscle.click();

    await expect(buildMuscle).toHaveClass(/selected/);
    await expect(continueButton).toBeEnabled();

    await continueButton.click();

    // Step 4: Schedule
    await expect(continueButton).toBeDisabled();

    const trainingDays = page.getByRole('button', {
      name: /4 days \/ week/i,
    });

    const sessionLength = page.getByRole('button', {
      name: /60 minutes/i,
    });

    await trainingDays.click();
    await expect(continueButton).toBeDisabled();

    await sessionLength.click();

    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    // Step 5: Equipment
    const build = page.getByRole('button', {
      name: /Build my APEX plan/i,
    });

    await expect(build).toBeDisabled();

    const machine = page.getByRole('button', {
      name: /^Machine/i,
    });

    await machine.click();

    await expect(build).toBeEnabled();
  });

  test('builds a real plan and lands in command center', async ({ page }) => {
    await resetApp(page);

    await completeOnboarding(page);

    await expect(
      page.locator('.a3-home .a3-hero')
    ).toBeVisible();

    await expect(
      page.locator('[data-apex-route="home"]')
    ).toBeVisible();

    await expect(
      page.getByRole('button', { name: /Ask Coach/i })
    ).toBeVisible();
  });
});