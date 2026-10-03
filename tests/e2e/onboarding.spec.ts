import { test, expect } from '@playwright/test';
import { resetApp, completeOnboarding } from './helpers';

const STATE_KEY = 'apex-state-v4';

test.describe('APEX onboarding contract', () => {
  test('blocks progression until required choices are explicitly selected', async ({ page }) => {
    await resetApp(page);

    const continueButton = page.getByRole('button', { name: /^Continue/ });

    // Step 1: Intro
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    // Step 2: Goal
    await expect(continueButton).toBeDisabled();

    const buildMuscle = page.getByRole('button', { name: /Build muscle/i });

    await expect(buildMuscle).not.toHaveClass(/selected/);
    await buildMuscle.click();

    await expect(buildMuscle).toHaveClass(/selected/);
    await expect(continueButton).toBeEnabled();

    await continueButton.click();

    // Step 3: Experience
    await expect(continueButton).toBeDisabled();

    const beginner = page.getByRole('button', { name: 'Beginner' });

    await beginner.click();

    await expect(beginner).toHaveClass(/selected/);
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

    // Step 5: Equipment, explained in plain words
    await expect(continueButton).toBeDisabled();
    await expect(page.getByText('A pulley with a handle and weight stack')).toBeVisible();

    const machine = page.getByRole('button', {
      name: /^Machine/i,
    });

    await machine.click();

    await expect(continueButton).toBeEnabled();
  });

  test('calibrates in order, reads the profile back and assembles the plan from the answers', async ({ page }) => {
    await resetApp(page);
    const next = page.getByRole('button', { name: /^Continue/ });
    await next.click();
    await page.getByRole('button', { name: /Get Stronger/i }).click();
    await next.click();
    await page.getByRole('button', { name: 'Intermediate' }).click();
    await next.click();
    await page.getByRole('button', { name: /3 days \/ week/i }).click();
    await page.getByRole('button', { name: /45 minutes/i }).click();
    await next.click();
    await page.getByRole('button', { name: /^Machine/i }).click();
    await page.getByRole('button', { name: /^Dumbbell/i }).click();
    await next.click();

    // Preferences, then how much to show
    await expect(page.getByText('A few preferences.')).toBeVisible();
    await page.getByRole('button', { name: /Imperial/i }).click();
    await next.click();
    await expect(page.getByText('This changes what you see, not what you train.')).toBeVisible();
    await expect(page.getByRole('radio', { name: /Guided/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('radio', { name: /Standard/ }).click();
    await expect(page.getByLabel('Preview of the set screen')).toContainText('Last time');
    await next.click();

    // The profile reads back exactly what was chosen
    const profile = page.locator('.apex-profile-read');
    await expect(profile).toContainText('Get Stronger');
    await expect(profile).toContainText('Intermediate');
    await expect(profile).toContainText('3 days a week · 45 min');
    await expect(profile).toContainText('Machines, Dumbbells');
    await expect(profile).toContainText('Imperial');
    await expect(profile).toContainText('Standard');

    await page.getByRole('button', { name: /Build my APEX plan/i }).click();
    await expect(page.locator('[data-apex-route="home"]')).toBeVisible({ timeout: 20_000 });

    // the answers were saved: goal, units and the chosen experience (Standard), and the plan was built by the engine
    const st = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), STATE_KEY);
    expect(st.profile.primaryGoal).toBe('strength');
    expect(st.preferences.units).toBe('imperial');
    expect(st.preferences.uiExperience).toBe('standard');
    expect(st.workouts.length).toBeGreaterThan(0);
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

    // Guided is the default experience
    const st = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), STATE_KEY);
    expect(st.preferences.uiExperience).toBe('guided');
  });
});
