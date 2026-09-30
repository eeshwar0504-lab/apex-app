import { test, expect, Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { resetApp, completeOnboarding } from '../../e2e/helpers';

/*
 * Representative real-browser corpus. The Node simulator carries the large
 * workload; these tests prove the same state shapes behave correctly in the
 * actual UI: onboarding -> real set logging -> completion -> persistence,
 * unit switching, and an 8-week engine-simulated history rendered by the app.
 */
const require = createRequire(import.meta.url);
const { makeScenario } = require('../simulator/scenario-generator.cjs');
const { runSimulation } = require('../simulator/simulator.cjs');
const { loadEngine } = require('../load-engine.cjs');

const STATE_KEY = 'apex-state-v4';
const tab = (page: Page, label: string) => page.locator('.bottom').getByRole('button', { name: label, exact: true }).click();

async function noOverflow(page: Page) {
  const o = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, v: document.documentElement.clientWidth }));
  expect(o.w).toBeLessThanOrEqual(o.v + 1);
}

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  return errors;
}

/* Shift every ISO date in a simulated state so the last simulated day is "today". */
function shiftedState(seed: number, weeks: number, archetype = 'consistent_beginner') {
  const sim = runSimulation(makeScenario({ archetype, seed, weeks }));
  const days = weeks * 7;
  const offset = Math.round((Date.now() - Date.UTC(2026, 0, 5)) / 86400000) - days;
  const shift = (s: string) => { const d = new Date(Date.parse(s.slice(0, 10) + 'T00:00:00Z') + offset * 86400000); return d.toISOString().slice(0, 10) + s.slice(10); };
  const walk = (v: any): any => {
    if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? shift(v) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [/^\d{4}-\d{2}-\d{2}$/.test(k) ? shift(k) : k, walk(x)]));
    return v;
  };
  const state = walk({ ...sim.state, exercises: [] });
  state.activeRoute = 'home';
  // the app always keeps an upcoming planned session: add today's real one
  const E = loadEngine();
  const today = new Date().toISOString().slice(0, 10);
  const planned = E.training.createWorkout('UPPER A', today, state.plan.exerciseSets.upper.slice(0, 7), E.exercisesMod.EXERCISES, state.plan.id, 'scheduled', 1);
  planned.originalPlanVersion = 1; planned.currentPlanVersion = 1;
  state.workouts.push(planned);
  return { state, sim };
}

async function seed(page: Page, state: unknown) {
  await page.addInitScript(([key, value]) => {
    try { if (!sessionStorage.getItem('__lg_seeded')) { localStorage.setItem(key as string, value as string); sessionStorage.setItem('__lg_seeded', '1'); } } catch { /* storage unavailable */ }
  }, [STATE_KEY, JSON.stringify(state)]);
}

async function driveWorkout(page: Page, maxSteps = 300) {
  const res = { setsSaved: 0 };
  await page.locator('.main').getByRole('button', { name: /Start Workout|Resume Workout/ }).first().click();
  for (let i = 0; i < 12; i++) {
    const c = page.getByRole('button', { name: 'Confirm available' }).first();
    if (!(await c.isVisible().catch(() => false))) break;
    await c.click();
  }
  const go = page.getByRole('button', { name: /Session ready · Start training/i });
  if (await go.isVisible().catch(() => false)) await go.click();
  for (let i = 0; i < maxSteps; i++) {
    if (await page.locator('[data-apex-route^="session:"]').isVisible().catch(() => false)) break;
    let clicked = false;
    for (const re of [/FINISH SESSION/i, /REVIEW SESSION/i, /Log set/i, /Save Set/i, /START SET/i, /ABOUT RIGHT/i, /SKIP REST/i, /^CONTINUE/]) {
      const b = page.getByRole('button', { name: re }).first();
      if (await b.isVisible().catch(() => false)) { if (/Save Set/i.test(String(re))) res.setsSaved++; await b.click(); clicked = true; break; }
    }
    if (!clicked) await page.waitForTimeout(60);
  }
  return res;
}

test('onboarding -> first workout logged in the real UI -> history/progress -> persists after reload', async ({ page }) => {
  const errors = watchConsole(page);
  await resetApp(page);
  await completeOnboarding(page);
  await expect(page.locator('.a3-home .a3-hero, .apex-command-hero').first()).toBeVisible({ timeout: 15000 });
  await tab(page, 'Train');
  const { setsSaved } = await driveWorkout(page);
  expect(setsSaved).toBeGreaterThan(5);
  await expect(page.locator('[data-apex-route^="session:"]')).toBeVisible();
  await expect(page.getByText('Workout Complete')).toBeVisible();
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), STATE_KEY);
  const completed = saved.workouts.filter((w: any) => w.status === 'completed');
  expect(completed.length).toBe(1);
  const sets = completed[0].exercises.flatMap((e: any) => e.sets).filter((s: any) => s.completed);
  expect(sets.length).toBeGreaterThan(5);
  for (const s of sets) { expect(Number.isFinite(s.reps)).toBe(true); expect(s.reps).toBeGreaterThanOrEqual(0); if (s.weight !== undefined) expect(s.weight).toBeGreaterThanOrEqual(0); }
  await noOverflow(page);
  await page.reload();
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), STATE_KEY);
  expect(after.workouts.filter((w: any) => w.status === 'completed').length).toBe(1);
  await tab(page, 'Progress');
  await expect(page.getByRole('tab', { name: 'Strength' })).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('incomplete workout survives reload and can be resumed', async ({ page }) => {
  await resetApp(page);
  await completeOnboarding(page);
  await tab(page, 'Train');
  await page.locator('.main').getByRole('button', { name: /Start Workout/ }).first().click();
  for (let i = 0; i < 12; i++) { const c = page.getByRole('button', { name: 'Confirm available' }).first(); if (!(await c.isVisible().catch(() => false))) break; await c.click(); }
  await page.getByRole('button', { name: /Session ready · Start training/i }).click();
  await page.getByRole('button', { name: /START SET/i }).first().click();
  await page.reload();
  await expect(page.locator('[data-apex-route="workout"]')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: /Log set|START SET/i }).first()).toBeVisible({ timeout: 15000 });
  const st = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), STATE_KEY);
  expect(st.workouts.filter((w: any) => w.status === 'in_progress').length).toBe(1);
});

test('unit switching: canonical kg untouched, labels follow the unit, Log Set shows the right unit', async ({ page }) => {
  const { state } = shiftedState(7, 4);
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  const canonical = async () => page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); return JSON.stringify(s.workouts.map((w: any) => w.exercises.map((e: any) => e.sets.map((x: any) => x.weight)))); }, STATE_KEY);
  const before = await canonical();
  await tab(page, 'You');
  await page.locator('#settings-units').getByRole('button', { name: /Imperial/ }).click();
  await expect(page.locator('#settings-units').getByRole('button', { name: /Imperial/ })).toHaveAttribute('aria-pressed', 'true');
  expect(await canonical()).toBe(before);
  await tab(page, 'Train');
  await page.locator('.main').getByRole('button', { name: /Start Workout|Resume Workout/ }).first().click();
  for (let i = 0; i < 12; i++) { const c = page.getByRole('button', { name: 'Confirm available' }).first(); if (!(await c.isVisible().catch(() => false))) break; await c.click(); }
  await page.getByRole('button', { name: /Session ready · Start training/i }).click();
  await page.getByRole('button', { name: /START SET/i }).first().click();
  await page.getByRole('button', { name: /START SET/i }).first().click();
  await page.getByRole('button', { name: 'Log set' }).click();
  await expect(page.getByText('Weight (lb)')).toBeVisible();
  await page.getByRole('button', { name: 'Back to set' }).click();
  await page.getByRole('button', { name: 'Exit workout' }).click();
  await tab(page, 'You');
  await page.locator('#settings-units').getByRole('button', { name: /Metric/ }).click();
  expect(await canonical()).toBe(before);
  await tab(page, 'Train'); // the in-progress workout resumes exactly where it was left
  await page.getByRole('button', { name: 'Log set' }).click();
  await expect(page.getByText('Weight (kg)')).toBeVisible();
});

test('8-week simulated history renders across Home, Progress, History, Nutrition, Coach and You without errors', async ({ page }) => {
  const errors = watchConsole(page);
  const { state, sim } = shiftedState(11, 8);
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.a3-home .a3-hero, .apex-command-hero').first()).toBeVisible();
  await noOverflow(page);

  await tab(page, 'Progress');
  await expect(page.locator('.apex-body-shortcut')).toContainText(/kg/);
  await expect(page.locator('.apex-body-shortcut svg.a3-spark')).toBeVisible();
  await page.getByRole('tab', { name: 'Strength' }).click();
  await expect(page.locator('.a3-analytics')).toBeVisible();
  await page.getByRole('tab', { name: 'PRs' }).click();
  await expect(page.locator('.a3-home.a3-progress .a3-row').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Overview' }).click();
  await noOverflow(page);
  const sessions = await page.locator('.a3-progress .a3-stat').first().innerText();
  expect(sessions).toContain(String(sim.stats.workouts));

  await page.getByRole('tab', { name: 'PRs' }).click();
  await page.getByRole('button', { name: /^History/ }).first().click();
  await expect(page.locator('.a3-cal, .a3-calendar, [class*="a3-cal"]').first()).toBeVisible();
  await noOverflow(page);

  await tab(page, 'You');
  await page.locator('.main').getByRole('button', { name: /^Nutrition/ }).first().click();
  await expect(page.getByRole('tab', { name: 'Week' })).toBeVisible();
  await page.getByRole('tab', { name: 'Week' }).click();
  await expect(page.getByText('Protein this week')).toBeVisible();
  await noOverflow(page);

  await tab(page, 'You');
  await page.locator('.main').getByRole('button', { name: /^Coach/ }).first().click();
  await expect(page.getByRole('heading', { name: 'APEX Coach' })).toBeVisible();
  await noOverflow(page);
  await page.reload();
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), STATE_KEY);
  expect(stored.workouts.filter((w: any) => w.status === 'completed').length).toBe(sim.stats.workouts);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('nutrition: logged meal persists after reload; settings/theme/units navigation stays usable', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(21, 3);
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await tab(page, 'You');
  await page.locator('.main').getByRole('button', { name: /^Nutrition/ }).first().click();
  await page.getByLabel('Protein (g)').first().fill('40');
  await page.getByRole('button', { name: 'Add meal' }).click();
  await page.reload();
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  const day = await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); const t = new Date().toISOString().slice(0, 10); return s.nutrition?.log?.[t]; }, STATE_KEY);
  expect(day?.proteinG).toBeGreaterThanOrEqual(40);
  await tab(page, 'You');
  for (const t of ['Crimson', 'Aurora', 'Apex']) { await page.locator('#settings-appearance').getByRole('radio', { name: new RegExp(t) }).click(); }
  await expect(page.locator('.app')).toHaveAttribute('data-theme', 'apex');
  await noOverflow(page);
  expect(errors, errors.join('\n')).toEqual([]);
});

/* ------------------------------------------------------------------ review-fix pass: real-browser coverage ------------------------------------------------------------------ */

const REJECTED_KEY = 'apex-state-v4-rejected';
const readState = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), STATE_KEY);

async function startTodaysWorkout(page: Page) {
  await page.locator('.main').getByRole('button', { name: /Start Workout|Resume Workout/ }).first().click();
  for (let i = 0; i < 12; i++) { const c = page.getByRole('button', { name: 'Confirm available' }).first(); if (!(await c.isVisible().catch(() => false))) break; await c.click(); }
  const go = page.getByRole('button', { name: /Session ready · Start training/i });
  if (await go.isVisible().catch(() => false)) await go.click();
}

test('zero-set workout: skipping every set ends as "No sets logged", is abandoned (not completed) and survives reload', async ({ page }) => {
  const errors = watchConsole(page);
  await resetApp(page);
  await completeOnboarding(page);
  await tab(page, 'Train');
  await startTodaysWorkout(page);
  for (let i = 0; i < 200; i++) {
    if (await page.getByRole('button', { name: /END WITHOUT RECORDING/i }).isVisible().catch(() => false)) break;
    let clicked = false;
    if (!(await page.getByRole('button', { name: /Skip this set/i }).first().isVisible().catch(() => false))) {
      const opts = page.locator('summary', { hasText: 'Set options' }).first();
      if (await opts.isVisible().catch(() => false)) await opts.click();
    }
    for (const re of [/Skip this set/i, /^CONTINUE/, /REVIEW SESSION/i, /START SET/i]) {
      const b = page.getByRole('button', { name: re }).first();
      if (await b.isVisible().catch(() => false)) { await b.click(); clicked = true; break; }
    }
    if (!clicked) await page.waitForTimeout(60);
  }
  await expect(page.getByText('NO SETS LOGGED')).toBeVisible();
  await expect(page.getByText('Nothing was recorded in this session.')).toBeVisible();
  await expect(page.getByRole('button', { name: /FINISH SESSION/i })).toHaveCount(0);
  await page.getByRole('button', { name: /END WITHOUT RECORDING/i }).click();
  await expect(page.locator('.bottom')).toBeVisible();
  const st = await readState(page);
  expect(st.workouts.filter((w: any) => w.status === 'completed').length).toBe(0);
  expect(st.workouts.filter((w: any) => w.status === 'skipped').length).toBe(1);
  expect((st.eventLog || []).some((e: any) => e.type === 'workout_completed')).toBe(false);
  expect((st.eventLog || []).some((e: any) => e.type === 'workout_abandoned')).toBe(true);
  expect(st.achievements.length).toBe(0);
  expect(st.activeWorkoutId).toBeUndefined();
  await page.reload();
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  const after = await readState(page);
  expect(after.workouts.filter((w: any) => w.status === 'completed').length).toBe(0);
  expect(after.workouts.filter((w: any) => w.status === 'skipped').length).toBe(1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('recovery check-in: stored through the validated boundary, given to the Coach as evidence, never changes the plan', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(11, 4);
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  const before = await readState(page);
  const plannedBefore = JSON.stringify(before.workouts.filter((w: any) => w.status === 'planned'));
  const todayIso = new Date().toISOString().slice(0, 10);
  const earlier = (before.recoveryLog || []).filter((c: any) => c.date !== todayIso);
  await page.getByRole('button', { name: /Ask Coach/i }).first().click();
  await expect(page.getByRole('heading', { name: 'APEX Coach' })).toBeVisible();
  const card = page.getByRole('region', { name: 'Recovery check-in' });
  await expect(card).toBeVisible();
  const hours = card.getByLabel('Sleep hours');
  await hours.fill('99');
  await expect(hours).toHaveValue('24'); // clamped at the input boundary
  await hours.fill('4.5');
  await card.getByRole('button', { name: 'Soreness 4', exact: true }).click();
  await card.getByRole('button', { name: 'Fatigue 5', exact: true }).click();
  await card.getByRole('button', { name: 'Sleep quality 2', exact: true }).click();
  await card.getByRole('button', { name: 'Save check-in' }).click();
  await expect(card.getByRole('button', { name: 'Check-in saved' })).toBeDisabled();
  const st = await readState(page);
  const today = todayIso;
  const entry = { date: today, sleepHours: 4.5, sleepQuality: 2, soreness: 4, fatigue: 5 };
  expect(st.recoveryLog.filter((c: any) => c.date === today)).toEqual([entry]);
  expect(st.recoveryLog.filter((c: any) => c.date !== today)).toEqual(earlier); // every earlier check-in untouched
  expect(JSON.stringify(st.workouts.filter((w: any) => w.status === 'planned'))).toBe(plannedBefore);
  await expect(page.getByText(/evidence only and does not change your prescription/).first()).toBeVisible();
  await expect(page.getByText('Train lighter or shorter today (your choice)')).toBeVisible();
  await page.reload();
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  const reloaded = (await readState(page)).recoveryLog;
  expect(reloaded.filter((c: any) => c.date === today)).toEqual([entry]);
  expect(reloaded.filter((c: any) => c.date !== today)).toEqual(earlier);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('plateau evidence: the Coach explains it with options and does not touch the plan', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(13, 3);
  const today = Date.now();
  const iso = (d: number) => new Date(today - d * 86400000).toISOString().slice(0, 10);
  const flat = [9, 6, 3, 1].map((d, i) => ({
    id: 'plateau-' + i, planId: state.plan.id, name: 'UPPER A', scheduledDate: iso(d), status: 'completed', source: 'scheduled', version: 1, completedAt: iso(d) + 'T18:00:00.000Z', updatedAt: iso(d) + 'T18:00:00.000Z',
    exercises: [{ exerciseId: 'machine_chest_press', order: 0, prescribedSets: 3, repRange: [8, 12], restSec: 90, status: 'completed', sets: [0, 1, 2].map((n) => ({ id: 'pl' + i + n, type: 'working', weight: 30, reps: 9, rir: 2, completed: true })) }],
  }));
  state.workouts = [...state.workouts.filter((w: any) => !w.exercises.some((e: any) => e.exerciseId === 'machine_chest_press') || w.status !== 'completed'), ...flat];
  const before = JSON.stringify(state.workouts.filter((w: any) => w.status === 'planned'));
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /Ask Coach/i }).first().click();
  await expect(page.getByRole('heading', { name: 'APEX Coach' })).toBeVisible();
  const options = page.getByRole('region', { name: 'Coach options' });
  await expect(options).toBeVisible();
  await expect(options.getByText(/Review a possible plateau/)).toBeVisible();
  await expect(options.getByText(/Machine Chest Press|machine chest press/i).first()).toBeVisible();
  await expect(options.getByText(/APEX has not changed your plan/)).toBeVisible();
  await expect(options.getByText(/not a diagnosis/)).toBeVisible();
  expect(JSON.stringify((await readState(page)).workouts.filter((w: any) => w.status === 'planned'))).toBe(before);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('return to training: a 30-day gap is explained in the app and the load is lower than the last worked load', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(17, 3);
  const today = Date.now();
  const iso = (d: number) => new Date(today - d * 86400000).toISOString().slice(0, 10);
  // last exposure to the first planned exercise was 30 days ago at 60 kg, top of range (would normally progress)
  const planned = state.workouts.find((w: any) => w.status === 'planned');
  const firstId = planned.exercises[0].exerciseId;
  state.workouts = state.workouts.filter((w: any) => w.status !== 'completed');
  state.workouts.push({ id: 'old-0', planId: state.plan.id, name: 'UPPER A', scheduledDate: iso(30), status: 'completed', source: 'scheduled', version: 1, completedAt: iso(30) + 'T18:00:00.000Z', updatedAt: iso(30) + 'T18:00:00.000Z',
    exercises: [{ exerciseId: firstId, order: 0, prescribedSets: 3, repRange: [8, 12], restSec: 90, status: 'completed', sets: [0, 1, 2].map((n) => ({ id: 'old' + n, type: 'working', weight: 60, reps: 12, rir: 2, completed: true })) }] });
  state.achievements = [];
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await tab(page, 'Train');
  await startTodaysWorkout(page);
  // exercise-ready screen: the recommendation and its reason
  let body = await page.locator('body').innerText();
  expect(body).toMatch(/Return to training after 30 days/);
  expect(body).toMatch(/55 kg stack/);
  // set-ready screen: the set itself must carry the same load (not a stale pre-filled one)
  await page.getByRole('button', { name: /START SET/i }).first().click();
  body = await page.locator('body').innerText();
  expect(body).toMatch(/55 kg stack/);
  expect(body).not.toMatch(/10 kg stack/);
  const active = await readState(page);
  const w = active.workouts.find((x: any) => x.status === 'in_progress');
  expect(w.exercises[0].sets.every((x: any) => x.weight === 55)).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('corrupt saved data: blocking recovery screen, recover what can be read, restart persistence, explicit fresh start', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(19, 4);
  const valid = state.workouts.filter((w: any) => w.status === 'completed').length;
  const broken = JSON.parse(JSON.stringify(state));
  broken.workouts.push({ ...broken.workouts.find((w: any) => w.status === 'completed'), scheduledDate: '2026-01-01' }); // duplicate id
  await seed(page, broken);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /We couldn.t read your saved data/ })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.bottom')).toHaveCount(0);
  await expect(page.getByText(/Nothing was deleted/)).toBeVisible();
  expect(await page.evaluate((k) => !!localStorage.getItem(k), REJECTED_KEY)).toBe(true);
  await page.reload();                                                   // restart without choosing: still asking, nothing lost
  await expect(page.getByRole('heading', { name: /We couldn.t read your saved data/ })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Recover what can be read' }).click();
  await expect(page.getByRole('heading', { name: 'Your data was recovered.' })).toBeVisible();
  await expect(page.getByText(/could not be read|restored/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Continue to APEX' }).click();
  await expect(page.locator('.bottom')).toBeVisible();
  const st = await readState(page);
  expect(st.workouts.filter((w: any) => w.status === 'completed').length).toBe(valid + 1);
  expect(new Set(st.workouts.map((w: any) => w.id)).size).toBe(st.workouts.length);
  expect(st.onboardingComplete).toBe(true);
  await page.reload();
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });         // no gate after a decision
  await expect(page.getByRole('heading', { name: /We couldn.t read your saved data/ })).toHaveCount(0);

  // explicit fresh start path, from a new corrupt payload
  await page.evaluate(([k, raw]) => { localStorage.setItem(k as string, raw as string); sessionStorage.setItem('__lg_seeded', '1'); }, [STATE_KEY, JSON.stringify(broken)]);
  await page.reload();
  await expect(page.getByRole('heading', { name: /We couldn.t read your saved data/ })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Start fresh instead' }).click();
  await page.getByRole('button', { name: 'Yes, start fresh' }).click();
  await expect(page.getByRole('heading', { name: /We couldn.t read your saved data/ })).toHaveCount(0);
  await expect(page.locator('.bottom')).toHaveCount(0);                              // onboarding, not the app
  const fresh = await readState(page);
  expect(fresh.workouts.length).toBe(0);
  expect(await page.evaluate((k) => !!localStorage.getItem(k), REJECTED_KEY)).toBe(true); // the damaged copy is kept
  await page.reload();
  await expect(page.getByRole('heading', { name: /We couldn.t read your saved data/ })).toHaveCount(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('malformed saved data is preserved untouched and is never offered as recoverable', async ({ page }) => {
  await page.addInitScript(([k]) => { try { if (!sessionStorage.getItem('__lg_seeded')) { localStorage.setItem(k as string, '{"workouts":[{"id":"w1","exer'); sessionStorage.setItem('__lg_seeded', '1'); } } catch { /* storage unavailable */ } }, [STATE_KEY]);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /We couldn.t read your saved data/ })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Recover what can be read' })).toHaveCount(0);
  await expect(page.getByText(/cannot be repaired automatically/)).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), REJECTED_KEY)).toBe('{"workouts":[{"id":"w1","exer');
});
