import { test, expect, type Page } from '@playwright/test';
import { resetApp, completeOnboarding } from './helpers';

const STATE_KEY = 'apex-state-v4';
const readState = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), STATE_KEY);

/* Wording that must never reach a first-time user in the default workout screens. */
const INTERNAL = /horizontal_push|vertical_pull|horizontal_pull|vertical_push|knee_flexion|calibration|baseline|load semantics|evidence quality|\bRIR\b|reps in reserve|\bv1\b|LOAD GUIDANCE|CONFIDENCE/i;

async function openBrief(page: Page) {
  await page.locator('.main').getByRole('button', { name: /Begin session/ }).first().click();
  await expect(page.locator('[data-apex-route^="brief:"]')).toBeVisible({ timeout: 10_000 });
}

async function startTraining(page: Page) {
  await page.getByRole('button', { name: /^Start training/i }).click();
  await expect(page.locator('[data-apex-route="workout"]')).toBeVisible({ timeout: 10_000 });
}

const counter = (page: Page) => page.locator('.set-counter-motion').first();

/* Drive the guided flow in the default (beginner) view until the first WORKING set is the active set. */
async function reachWorkingSet(page: Page) {
  for (let i = 0; i < 60; i++) {
    const log = page.getByRole('button', { name: 'Log set' });
    if (await log.isVisible().catch(() => false)) {
      const label = (await counter(page).textContent().catch(() => '')) || '';
      if (/^SET \d/.test(label.trim())) return;
      await log.click();
      continue;
    }
    const skipRest = page.getByRole('button', { name: 'SKIP REST', exact: true });
    if (await skipRest.isVisible().catch(() => false)) { await skipRest.click(); continue; }
    const start = page.getByRole('button', { name: /START SET/i }).first();
    if (await start.isVisible().catch(() => false)) { await start.click(); continue; }
    await page.waitForTimeout(60);
  }
  throw new Error('never reached a working set');
}

async function openMore(page: Page) {
  await page.getByRole('button', { name: 'More', exact: true }).click();
}

async function setView(page: Page, name: 'Guided' | 'Standard' | 'Advanced') {
  await openMore(page);
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true }).click();
}
const enableAdvanced = (page: Page) => setView(page, 'Advanced');

test.describe('beginner-first workout', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await completeOnboarding(page);
  });

  test('zero-data Home, Train and Progress show one next step and no empty analytics', async ({ page }) => {
    const main = page.locator('.main');
    await expect(main.getByRole('button', { name: /Begin session/ }).first()).toBeVisible();
    await expect(page.getByText('Your first session draws the first line')).toBeVisible();
    for (const hidden of ['Streak', 'Coach insight', 'Consistency', 'Signals', 'Recent training']) await expect(main.getByText(hidden, { exact: false })).toHaveCount(0);

    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await expect(page.locator('[data-apex-route="train"]')).toBeVisible();
    const train = await page.locator('[data-apex-route="train"]').innerText();
    expect(train).not.toMatch(/\bRIR\b|\bv1\b|scheduled|0%|0\/\d+ sets|Queue/);
    await expect(page.getByRole('button', { name: /Begin session/ }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await expect(page.getByText('Your first session draws the first line.')).toBeVisible();
    for (const hidden of ['Interpretation', 'Workload', 'Momentum', 'Consistency']) await expect(page.locator('.a3-progress').getByText(hidden, { exact: false })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Strength' })).toHaveCount(0);
  });

  test('pre-workout: start is available at once, equipment uses the profile, reasoning is collapsed', async ({ page }) => {
    await openBrief(page);
    await expect(page.getByRole('button', { name: /^Start training/i })).toBeEnabled();
    // every equipment exercise has explicit controls; the saved profile preselects Available
    const rows = page.locator('.equipment-check-block');
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(page.getByText('Equipment available?').first()).toBeVisible();
    await expect(rows.first().getByRole('button', { name: 'Available', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(rows.first().getByRole('button', { name: 'Not available' })).toBeVisible();

    // the weight reasoning and the readiness check-in are secondary (collapsed)
    await expect(page.getByRole('button', { name: 'Why this weight?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Why this weight?' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: /Optional: how ready do you feel/ })).toHaveAttribute('aria-expanded', 'false');
    const body = await page.locator('.a3-brief').innerText();
    expect(body).not.toMatch(INTERNAL);
    expect(body).not.toMatch(/AVAILABILITY|training floor/i);
  });

  test('exercise ready: name, how to do it, today\'s target, one START SET; no RIR and no raw labels', async ({ page }) => {
    await openBrief(page);
    await startTraining(page);

    const focus = page.locator('.a3-focus');
    await expect(focus.locator('h2').first()).toBeVisible();
    await expect(focus.getByText('How to do it')).toBeVisible();
    await expect(focus.getByText("TODAY'S TARGET")).toBeVisible();
    const text = await focus.innerText();
    // order: exercise name, then the guide, then the target
    expect(text.indexOf('How to do it')).toBeGreaterThan(-1);
    expect(text.indexOf("TODAY'S TARGET")).toBeGreaterThan(text.indexOf('How to do it'));
    // existing exercise knowledge is on screen: set up, steps, mistakes, safety
    for (const h of ['Set up', 'Do the movement', 'Common mistakes', 'Stay safe']) await expect(focus.getByText(h, { exact: true })).toBeVisible();
    expect(text).not.toMatch(INTERNAL);
    await expect(page.getByRole('tab')).toHaveCount(0); // History / Options are advanced
    await expect(page.getByRole('button', { name: /START SET/i })).toHaveCount(1);
  });

  test('one START SET begins the set; LOG SET is visible text; there is no RIR and no icon-only action', async ({ page }) => {
    await openBrief(page);
    await startTraining(page);
    await page.getByRole('button', { name: /START SET/i }).click();

    const log = page.getByRole('button', { name: 'Log set' });
    await expect(log).toBeVisible();
    await expect(log).toContainText('LOG SET');
    await expect(page.getByRole('button', { name: /START SET/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Decrease reps' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Increase reps' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Decrease RIR' })).toHaveCount(0);
    const box = await log.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await page.locator('.a3-focus').innerText()).not.toMatch(INTERNAL);
  });

  test('a logged working set records no RIR; feedback is optional and Not sure keeps rest and progress going', async ({ page }) => {
    await openBrief(page);
    await startTraining(page);
    await reachWorkingSet(page);
    await page.getByRole('button', { name: 'Log set' }).click();

    await expect(page.getByText('How did that feel?')).toBeVisible();
    await expect(page.getByText('(optional)')).toBeVisible();
    await expect(page.getByRole('button', { name: /^TOO HEAVY/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^ABOUT RIGHT/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^TOO EASY/ })).toBeVisible();
    await page.getByRole('button', { name: /Not sure · skip/ }).click();
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: '+30 SEC' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'SKIP REST' })).toBeVisible();
    expect(await page.locator('.a3-focus').innerText()).not.toMatch(/timestamp|elapsed timestamp/i);

    const st = await readState(page);
    const w = st.workouts.find((x: any) => x.status === 'in_progress');
    const logged = w.exercises[0].sets.filter((x: any) => x.completed && x.type !== 'warmup');
    expect(logged.length).toBe(1);
    expect(logged[0].rir).toBeUndefined();
    expect(Object.keys(w.guidedSession.setFeedback || {})).not.toContain(logged[0].id);

    // and the workout continues to the next set
    await page.getByRole('button', { name: 'SKIP REST' }).click();
    await expect(page.getByRole('button', { name: /START SET/i })).toBeVisible();
    await expect(page.getByText(/^SET 2 \/ \d/).first()).toBeVisible();
  });

  test('chosen feedback is still saved', async ({ page }) => {
    await openBrief(page);
    await startTraining(page);
    await reachWorkingSet(page);
    await page.getByRole('button', { name: 'Log set' }).click();
    await page.getByRole('button', { name: /^ABOUT RIGHT/ }).click();
    const st = await readState(page);
    const w = st.workouts.find((x: any) => x.status === 'in_progress');
    const logged = w.exercises[0].sets.find((x: any) => x.completed && x.type !== 'warmup');
    expect(w.guidedSession.setFeedback[logged.id]).toBeTruthy();
    expect(logged.rir).toBeUndefined();
  });

  test('advanced controls: RIR, set type, add/remove set, notes and overview are all still reachable', async ({ page }) => {
    await openBrief(page);
    await startTraining(page);
    await openMore(page);
    await expect(page.getByRole('button', { name: 'Whole workout' })).toHaveCount(0);
    await expect(page.getByLabel('Workout notes')).toHaveCount(0);
    await page.getByRole('button', { name: 'Less', exact: true }).click();

    await enableAdvanced(page);
    await expect(page.getByRole('tab', { name: 'History' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Options' })).toBeVisible();
    await expect(page.getByLabel('Workout notes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Whole workout' })).toBeVisible();

    await page.getByRole('tab', { name: 'Options' }).click();
    await expect(page.getByRole('button', { name: 'Replace exercise…' })).toBeVisible();

    await page.getByRole('tab', { name: 'How to' }).click();
    await page.getByRole('button', { name: /START SET/i }).click();
    await expect(page.getByRole('button', { name: 'Decrease RIR' })).toBeVisible();
    await page.locator('summary', { hasText: 'More options' }).first().click();
    await expect(page.getByLabel('Set type')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add set' })).toBeVisible();
    await expect(page.getByRole('button', { name: '− Remove' })).toBeVisible();

    // an RIR the athlete enters is saved as entered
    await page.getByRole('button', { name: 'Increase RIR' }).click();
    await page.getByRole('button', { name: 'Log set' }).click();
    const st = await readState(page);
    const w = st.workouts.find((x: any) => x.status === 'in_progress');
    const done = w.exercises[0].sets.find((x: any) => x.completed);
    expect(typeof done.rir).toBe('number');

    // the preference persists across a reload, on this device only
    await page.reload();
    await expect(page.locator('[data-apex-route="workout"]')).toBeVisible({ timeout: 20_000 });
    await openMore(page);
    await expect(page.getByRole('button', { name: 'Whole workout' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Advanced', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('confirmation: removing and skipping a set ask first; cancelling changes nothing', async ({ page }) => {
    await openBrief(page);
    await startTraining(page);
    await enableAdvanced(page);
    await page.getByRole('tab', { name: 'How to' }).click();
    await page.getByRole('button', { name: /START SET/i }).click();
    const count = async () => (await readState(page)).workouts.find((x: any) => x.status === 'in_progress').exercises[0].sets.length;
    const before = await count();

    await page.locator('summary', { hasText: 'More options' }).first().click();
    await page.getByRole('button', { name: '− Remove' }).click();
    await expect(page.getByRole('dialog', { name: 'Remove this set?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(await count()).toBe(before);

    await page.getByRole('button', { name: '− Remove' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove set' }).click();
    await expect.poll(count).toBe(before - 1);

    await page.getByRole('button', { name: 'Skip this set' }).click();
    await expect(page.getByRole('dialog', { name: 'Skip this set?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    const skipped = async () => (await readState(page)).workouts.find((x: any) => x.status === 'in_progress').exercises.flatMap((e: any) => e.sets).filter((s: any) => s.disposition === 'skipped').length;
    expect(await skipped()).toBe(0);
    await page.getByRole('button', { name: 'Skip this set' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Skip set' }).click();
    await expect.poll(skipped).toBe(1);
  });

  test('confirmation: Skip workout and Extra session ask first on Train', async ({ page }) => {
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    const statuses = async () => (await readState(page)).workouts.map((w: any) => w.status + ':' + w.source);
    const before = await statuses();

    // destructive controls appear only in edit mode
    await expect(page.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Skip', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: 'Skip this workout?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(await statuses()).toEqual(before);
    await page.getByRole('button', { name: 'Skip', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Skip workout' }).click();
    await expect.poll(async () => (await statuses()).filter((s) => s.startsWith('skipped')).length).toBe(1);

    await page.getByRole('button', { name: /^Extra session/ }).click();
    await expect(page.getByRole('dialog', { name: 'Start an extra session?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect((await statuses()).filter((s) => s.endsWith(':extra')).length).toBe(0);
    await expect(page.locator('[data-apex-route="train"]')).toBeVisible();
  });

  test('the Journal pill opens the Journal and the workout is still there afterwards', async ({ page }) => {
    await openBrief(page);
    await startTraining(page);
    await openMore(page);
    await page.getByRole('button', { name: 'Journal', exact: true }).click();
    await expect(page.locator('[data-apex-route="journal"]')).toBeVisible();
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await expect(page.locator('[data-apex-route="workout"]')).toBeVisible();
  });

  test('a whole first workout can be finished without RIR, feedback or a rating', async ({ page }) => {
    test.setTimeout(300_000);
    await openBrief(page);
    await startTraining(page);
    const seen: string[] = [];

    for (let step = 0; step < 400; step++) {
      if (await page.locator('[data-apex-route^="session:"]').isVisible().catch(() => false)) break;
      seen.push(await page.locator('.a3-focus').innerText().catch(() => ''));

      const log = page.getByRole('button', { name: 'Log set' });
      if (await log.isVisible().catch(() => false)) { await log.click(); continue; }
      const notSure = page.getByRole('button', { name: /Not sure · skip/ });
      if (await notSure.isVisible().catch(() => false)) { await notSure.click(); continue; }
      const skipRest = page.getByRole('button', { name: 'SKIP REST', exact: true });
      if (await skipRest.isVisible().catch(() => false)) { await skipRest.click(); continue; }
      const start = page.getByRole('button', { name: /START SET/i }).first();
      if (await start.isVisible().catch(() => false)) { await start.click(); continue; }
      const next = page.getByRole('button', { name: /^(CONTINUE|REVIEW SESSION|FINISH SESSION)/ }).first();
      if (await next.isVisible().catch(() => false)) { await next.click(); continue; }
      await page.waitForTimeout(50);
    }

    // none of the default screens along the way showed internal wording
    for (const s of seen) expect(s).not.toMatch(INTERNAL);

    await expect(page.locator('[data-apex-route^="session:"]')).toBeVisible();
    await expect(page.getByText('How did the session feel?')).toBeVisible();
    const done = page.getByRole('button', { name: 'Done', exact: true });
    await expect(done).toBeEnabled();
    await done.click();
    // the finished session travels into the training week
    await expect(page.locator('[data-apex-route="train"]')).toBeVisible();

    const st = await readState(page);
    expect(st.workouts.filter((w: any) => w.status === 'completed').length).toBe(1);
    expect((st.eventLog || []).some((e: any) => e.type === 'session_feedback')).toBe(false);
    const sets = st.workouts.find((w: any) => w.status === 'completed').exercises.flatMap((e: any) => e.sets).filter((s: any) => s.completed);
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.every((s: any) => s.rir === undefined)).toBe(true);
    // analytics appear once there is a completed session
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByText('Your first session draws the first line')).toHaveCount(0);
    await expect(page.locator('.apex-weekcard')).toBeVisible();
  });
});
