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
  const now = new Date();
  const offset = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(2026, 0, 5)) / 86400000) - days; // calendar days are local
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
  const today = localDay(0).iso;
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
  await page.locator('.main').getByRole('button', { name: /Begin session|Resume session/ }).first().click();
  for (let i = 0; i < 12; i++) {
    const c = page.getByRole('button', { name: 'Confirm available' }).first();
    if (!(await c.isVisible().catch(() => false))) break;
    await c.click();
  }
  const go = page.getByRole('button', { name: /^Start training/i });
  await go.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  if (await go.isVisible().catch(() => false)) await go.click();
  for (let i = 0; i < maxSteps; i++) {
    if (await page.locator('[data-apex-route^="session:"]').isVisible().catch(() => false)) break;
    let clicked = false;
    for (const re of [/FINISH SESSION/i, /REVIEW SESSION/i, /Log set/i, /Save Set/i, /START SET/i, /ABOUT RIGHT/i, /SKIP REST/i, /^CONTINUE/]) {
      const b = page.getByRole('button', { name: re }).first();
      if (await b.isVisible().catch(() => false)) { if (/Log set/i.test(String(re))) res.setsSaved++; await b.click(); clicked = true; break; }
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
  await page.locator('.main').getByRole('button', { name: /Begin session/ }).first().click();
  for (let i = 0; i < 12; i++) { const c = page.getByRole('button', { name: 'Confirm available' }).first(); if (!(await c.isVisible().catch(() => false))) break; await c.click(); }
  await page.getByRole('button', { name: /^Start training/i }).click();
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
  await page.locator('.main').getByRole('button', { name: /Begin session|Resume session/ }).first().click();
  for (let i = 0; i < 12; i++) { const c = page.getByRole('button', { name: 'Confirm available' }).first(); if (!(await c.isVisible().catch(() => false))) break; await c.click(); }
  await page.getByRole('button', { name: /^Start training/i }).click();
  await page.getByRole('button', { name: /START SET/i }).first().click();
  await expect(page.getByText('Weight (lb)')).toBeVisible();
  await page.getByRole('button', { name: 'Exit workout' }).click();
  // starting the workout legitimately carries the recommendation into the planned sets (first hydration);
  // from here on only the unit may change, never a stored kg value
  const afterStart = await canonical();
  await tab(page, 'You');
  await page.locator('#settings-units').getByRole('button', { name: /Metric/ }).click();
  expect(await canonical()).toBe(afterStart);
  await tab(page, 'Train'); // the in-progress workout resumes exactly where it was left
  await expect(page.getByText('Weight (kg)')).toBeVisible();
});

test('8-week simulated history renders across Home, Progress, History, Nutrition, Coach and You without errors', async ({ page }) => {
  const errors = watchConsole(page);
  const { state, sim } = shiftedState(11, 8);
  state.preferences.uiExperience = 'standard'; // the week view and the detail panels belong to Standard and up
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
  // personal records are events on the strength line, listed below it
  await expect(page.getByRole('heading', { name: 'Personal records' })).toBeVisible();
  await expect(page.locator('.a3-home.a3-progress .a3-row').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Overview' }).click();
  await noOverflow(page);
  // the overview names how many sessions the record holds
  await expect(page.locator('.a3-progress .a3-pagetitle .a3-eyebrow')).toContainText(`${sim.stats.workouts} session`);

  await page.getByRole('tab', { name: 'Strength' }).click();
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
  const day = await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); const n = new Date(); const t = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; return s.nutrition?.log?.[t]; }, STATE_KEY);
  expect(day?.proteinG).toBeGreaterThanOrEqual(40);
  await tab(page, 'You');
  for (const t of ['Graphite', 'Bone', 'Obsidian']) { await page.locator('#settings-appearance').getByRole('radio', { name: new RegExp(t) }).click(); }
  await expect(page.locator('.app')).toHaveAttribute('data-theme', 'obsidian');
  await noOverflow(page);
  expect(errors, errors.join('\n')).toEqual([]);
});

/* ------------------------------------------------------------------ review-fix pass: real-browser coverage ------------------------------------------------------------------ */

const REJECTED_KEY = 'apex-state-v4-rejected';
const readState = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), STATE_KEY);

async function startTodaysWorkout(page: Page) {
  await page.locator('.main').getByRole('button', { name: /Begin session|Resume session/ }).first().click();
  for (let i = 0; i < 12; i++) { const c = page.getByRole('button', { name: 'Confirm available' }).first(); if (!(await c.isVisible().catch(() => false))) break; await c.click(); }
  const go = page.getByRole('button', { name: /^Start training/i });
  await go.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
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
    const confirmSkip = page.getByRole('dialog').getByRole('button', { name: 'Skip set', exact: true });
    if (await confirmSkip.isVisible().catch(() => false)) { await confirmSkip.click(); continue; }
    if (!(await page.getByRole('button', { name: /Skip this set/i }).first().isVisible().catch(() => false))) {
      const opts = page.locator('summary', { hasText: 'More options' }).first();
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
  state.preferences.uiExperience = 'advanced'; // the Coach's evidence list is part of the Advanced view
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  const before = await readState(page);
  const plannedBefore = JSON.stringify(before.workouts.filter((w: any) => w.status === 'planned'));
  const todayIso = localDay(0).iso;
  const earlier = (before.recoveryLog || []).filter((c: any) => c.date !== todayIso);
  await page.getByRole('button', { name: /Open Coach|Ask Coach/i }).first().click();
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
  await page.getByRole('button', { name: 'WHY', exact: true }).click();
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

  const iso = (d: number) => localDay(d).iso; // calendar days are local
  const flat = [9, 6, 3, 1].map((d, i) => ({
    id: 'plateau-' + i, planId: state.plan.id, name: 'UPPER A', scheduledDate: iso(d), status: 'completed', source: 'scheduled', version: 1, completedAt: iso(d) + 'T18:00:00.000Z', updatedAt: iso(d) + 'T18:00:00.000Z',
    exercises: [{ exerciseId: 'machine_chest_press', order: 0, prescribedSets: 3, repRange: [8, 12], restSec: 90, status: 'completed', sets: [0, 1, 2].map((n) => ({ id: 'pl' + i + n, type: 'working', weight: 30, reps: 9, rir: 2, completed: true })) }],
  }));
  state.workouts = [...state.workouts.filter((w: any) => !w.exercises.some((e: any) => e.exerciseId === 'machine_chest_press') || w.status !== 'completed'), ...flat];
  const before = JSON.stringify(state.workouts.filter((w: any) => w.status === 'planned'));
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /Open Coach|Ask Coach/i }).first().click();
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

  const iso = (d: number) => localDay(d).iso; // calendar days are local
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
  // exercise-ready screen: the recommendation, and its reason behind "Why this weight?"
  await page.getByRole('button', { name: 'Why this weight?' }).click();
  let body = await page.locator('body').innerText();
  expect(body).toMatch(/Return to training after 30 days/);
  expect(body).toMatch(/55 kg stack/);
  // set-ready screen: the set itself must carry the same load (not a stale pre-filled one)
  await reachFirstWorkingSet(page);
  body = await page.locator('body').innerText();
  expect(body).toMatch(/55 kg stack/);
  expect(body).not.toMatch(/10 kg stack/);
  const active = await readState(page);
  const w = active.workouts.find((x: any) => x.status === 'in_progress');
  const working = w.exercises[0].sets.filter((x: any) => x.type !== 'warmup'); // warm-ups carry their own lighter loads
  expect(working.length).toBeGreaterThan(0);
  expect(working.every((x: any) => x.weight === 55)).toBe(true);
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

/* ------------------------------------------------------------------ Phase 1 correctness: real-browser checks ------------------------------------------------------------------ */

/** Local calendar day N days ago, and a local-noon timestamp inside it (independent of the machine's zone). */
const localDay = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return { iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, noon: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString() }; };

test('Phase 1 correctness: the progression decision reaches the set screen and follows the athlete own load list', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(23, 3);
  const planned = state.workouts.find((w: any) => w.status === 'planned');
  const firstId = planned.exercises[0].exerciseId;
  expect(firstId).toBe('machine_chest_press');
  // the planned workout still carries the load it was created with (a 10 kg calibration)
  expect(planned.exercises[0].sets.every((x: any) => x.weight === 10)).toBe(true);
  const last = localDay(3);
  state.workouts = state.workouts.filter((w: any) => w.status !== 'completed');
  state.workouts.push({ id: 'hist-0', planId: state.plan.id, name: 'UPPER A', scheduledDate: last.iso, status: 'completed', source: 'scheduled', version: 1, completedAt: last.noon, updatedAt: last.noon,
    exercises: [{ exerciseId: firstId, order: 0, prescribedSets: 3, repRange: [8, 12], restSec: 90, status: 'completed', sets: [0, 1, 2].map((n) => ({ id: 'h' + n, type: 'working', weight: 25, reps: 12, rir: 2, completed: true })) }] });
  state.achievements = [];
  state.profile.primaryGoal = 'general'; state.profile.goals = ['general']; // the catalogue range is the baseline this scenario reasons about
  state.profile.loadIncrementsKg = { machine: [10, 15, 25, 30] }; // asymmetric: 25 -> 27.5 used to tie and snap back to 25
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await tab(page, 'Train');
  await startTodaysWorkout(page);
  let body = await page.locator('body').innerText();
  expect(body).toMatch(/30 kg stack/);
  expect(body).not.toMatch(/10 kg stack/);
  await reachFirstWorkingSet(page);
  body = await page.locator('body').innerText();
  expect(body).toMatch(/30 kg stack/);
  const active = await readState(page);
  const w = active.workouts.find((x: any) => x.status === 'in_progress');
  const working = w.exercises[0].sets.filter((x: any) => x.type !== 'warmup');
  expect(working.length).toBeGreaterThan(0);
  expect(working.every((x: any) => x.weight === 30)).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

/* Heavy lifts start with warm-up sets (Phase 13). Log them, and the rests between, until the first working set is on screen. */
async function reachFirstWorkingSet(page: Page) {
  for (let step = 0; step < 40; step++) {
    if (await page.getByText(/^SET 1 \/ \d/).first().isVisible().catch(() => false)) return;
    const skipRest = page.getByRole('button', { name: 'SKIP REST', exact: true });
    if (await skipRest.isVisible().catch(() => false)) { await skipRest.click(); continue; }
    const startSet = page.getByRole('button', { name: /START SET/i }).first();
    if (await startSet.isVisible().catch(() => false)) { await startSet.click(); continue; }
    const logSet = page.getByRole('button', { name: 'Log set' });
    if (await logSet.isVisible().catch(() => false)) { await logSet.click(); continue; }
    const save = page.getByRole('button', { name: 'Save Set' }).first();
    if (await save.isVisible().catch(() => false)) { await save.click(); continue; }
    await page.waitForTimeout(150);
  }
}

for (const [goal, range, load, action] of [['strength', '5–9 reps', '27.5 kg stack', 'increase'], ['general', '8–12 reps', '25 kg stack', 'hold'], ['fitness', '10–14 reps', '22.5 kg stack', 'reduce']] as const) {
  test(`goal programming (${goal}): the same 9-rep history prescribes ${action} against the ${range} target, on screen and in the saved workout`, async ({ page }) => {
    const errors = watchConsole(page);
    const { state } = shiftedState(23, 3);
    const planned = state.workouts.find((w: any) => w.status === 'planned');
    const firstId = planned.exercises[0].exerciseId;
    expect(firstId).toBe('machine_chest_press');
    const last = localDay(3);
    state.workouts = state.workouts.filter((w: any) => w.status !== 'completed');
    state.workouts.push({ id: 'hist-0', planId: state.plan.id, name: 'UPPER A', scheduledDate: last.iso, status: 'completed', source: 'scheduled', version: 1, completedAt: last.noon, updatedAt: last.noon,
      exercises: [{ exerciseId: firstId, order: 0, prescribedSets: 3, repRange: [8, 12], restSec: 90, status: 'completed', sets: [0, 1, 2].map((n) => ({ id: 'h' + n, type: 'working', weight: 25, reps: 9, rir: 2, completed: true })) }] });
    state.achievements = [];
    state.profile.primaryGoal = goal; state.profile.goals = [goal];
    delete state.profile.loadIncrementsKg;
    const historyBefore = JSON.stringify(state.workouts.filter((w: any) => w.status === 'completed'));
    await seed(page, state);
    await page.goto('/');
    await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
    await tab(page, 'Train');
    await startTodaysWorkout(page);
    const body = await page.locator('body').innerText();
    expect(body).toContain(range);
    expect(body).toContain(load);
    await page.getByRole('button', { name: /START SET/i }).first().click();
    const active = await readState(page);
    const w = active.workouts.find((x: any) => x.status === 'in_progress');
    expect(w.exercises[0].repRange).toEqual(range.startsWith('5') ? [5, 9] : range.startsWith('10') ? [10, 14] : [8, 12]);
    expect(JSON.stringify(active.workouts.filter((x: any) => x.status === 'completed'))).toBe(historyBefore); // history is never rewritten
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test.describe('IST midnight boundary', () => {
  test.use({ timezoneId: 'Asia/Kolkata' });

  test('at 00:30 IST the calendar day is the LOCAL day in the week strip and in nutrition logging', async ({ page }) => {
    const errors = watchConsole(page);
    // 2026-03-14T19:00:00Z is 00:30 on 15 March in India (the UTC date is still the 14th)
    await page.clock.setFixedTime(new Date('2026-03-14T19:00:00Z'));
    await resetApp(page);
    await completeOnboarding(page);
    await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
    // a new user's Home has no week strip, so the local day is read from the History calendar's marked day
    await page.getByRole('button', { name: 'Command Center', exact: true }).click();
    const cmd = page.getByRole('dialog').locator('input').first();
    await cmd.fill('Open history');
    await cmd.press('Enter');
    await expect(page.locator('.a3-cal-day.is-today')).toHaveCount(1);
    const today = await page.evaluate(() => Array.from(document.querySelectorAll('.a3-cal-day.is-today')).map((e) => e.getAttribute('aria-label') || e.textContent));
    expect(today.length).toBe(1);
    expect(String(today[0])).toContain('2026-03-15');
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await page.locator('.main').getByRole('button', { name: /Nutrition/ }).first().click();
    await page.getByRole('button', { name: '+ 250 ml' }).click();
    const st = await readState(page);
    expect(Object.keys(st.nutrition.log)).toEqual(['2026-03-15']);
    expect(st.workouts.every((w: any) => w.scheduledDate >= '2026-03-15')).toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------------------------------------------
 * Phase 4: profile editing, goal editing, journal, library actions and confirmation flows, in the real UI.
 * ------------------------------------------------------------------------------------------------------------- */
const openFromYou = async (page: Page, title: RegExp | string) => {
  await tab(page, 'You');
  await page.locator('.main').getByRole('button', { name: title }).first().click();
};

test('Phase 4 profile editing: validation blocks a bad edit, a good edit persists, imperial values convert', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(31, 3);
  state.profile.primaryGoal = 'general'; state.profile.goals = ['general']; state.profile.body = { weightKg: 80, heightCm: 180 };
  state.preferences.units = 'metric';
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  const workoutsBefore = JSON.stringify((await readState(page)).workouts);
  await tab(page, 'You');
  await page.getByRole('button', { name: /^Edit profile/ }).click();
  const editor = page.getByLabel('Profile editor');
  await expect(editor).toBeVisible();
  await editor.getByLabel('Days / week').fill('7');
  await editor.getByRole('button', { name: 'Save profile' }).click();
  await expect(editor.getByRole('alert').filter({ hasText: /Train 2 to 6 days/ })).toBeVisible();
  expect((await readState(page)).profile.trainingDays).toBe(state.profile.trainingDays); // nothing was saved
  await editor.getByLabel('Name').fill('Grace');
  await editor.getByLabel('Days / week').fill('5');
  await editor.getByLabel('Primary goal').selectOption('strength');
  await editor.getByLabel(/Body weight/).fill('82.5');
  await editor.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Profile saved/ })).toBeVisible();
  let st = await readState(page);
  expect(st.profile).toMatchObject({ name: 'Grace', trainingDays: 5, primaryGoal: 'strength' });
  expect(st.profile.goals[0]).toBe('strength');
  expect(st.profile.body.weightKg).toBe(82.5);
  expect(st.profile.body.heightCm).toBe(180); // untouched
  expect(JSON.stringify(st.workouts)).toBe(workoutsBefore); // history and the plan's workouts are never rewritten by a profile edit
  // imperial: the editor shows lb and the stored value stays canonical kg
  await page.locator('#settings-units').getByRole('button', { name: /Imperial/ }).click();
  await page.getByRole('button', { name: /^Edit profile/ }).click();
  await expect(page.getByLabel('Profile editor').getByLabel(/Body weight \(lb\)/)).toHaveValue('181.9');
  await page.getByLabel('Profile editor').getByLabel(/Body weight \(lb\)/).fill('176.4');
  await page.getByLabel('Profile editor').getByRole('button', { name: 'Save profile' }).click();
  st = await readState(page);
  expect(Math.abs(st.profile.body.weightKg - 80)).toBeLessThanOrEqual(0.1);
  await page.reload();
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  st = await readState(page);
  expect(st.profile.name).toBe('Grace');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Phase 4 goal editing: create, validate, edit, pause, delete with confirmation', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(32, 3);
  state.goals = [];
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await openFromYou(page, /^Goals/);
  await page.getByRole('button', { name: /Add goal/ }).click();
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /title/i })).toBeVisible();
  await page.getByLabel('Goal title').fill('Bench 80');
  await page.getByLabel('Target label').fill('Bench press');
  await page.getByLabel('Target value').fill('-4');
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /above zero/ })).toBeVisible();
  expect((await readState(page)).goals).toEqual([]);
  await page.getByLabel('Target value').fill('80');
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Goal created.' })).toBeVisible();
  let st = await readState(page);
  expect(st.goals.length).toBe(1);
  expect(st.goals[0]).toMatchObject({ title: 'Bench 80', status: 'active', priority: 1, target: { label: 'Bench press', value: 80, unit: 'kg' } });
  const id = st.goals[0].id;
  await page.getByRole('button', { name: 'Edit goal Bench 80' }).click();
  await page.getByLabel('Goal title').fill('Bench 85');
  await page.getByRole('button', { name: 'Save goal' }).click();
  st = await readState(page);
  expect(st.goals[0]).toMatchObject({ id, title: 'Bench 85', priority: 1 });
  await page.getByRole('button', { name: 'Pause goal Bench 85' }).click();
  expect((await readState(page)).goals[0].status).toBe('paused');
  await page.getByRole('button', { name: 'Resume goal Bench 85' }).click();
  expect((await readState(page)).goals[0].status).toBe('active');
  // delete asks first; Cancel keeps the goal, confirming removes it
  await page.getByRole('button', { name: 'Delete goal Bench 85' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this goal?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect((await readState(page)).goals.length).toBe(1);
  await page.getByRole('button', { name: 'Delete goal Bench 85' }).click();
  await page.getByRole('dialog', { name: 'Delete this goal?' }).getByRole('button', { name: 'Delete goal' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Goal deleted.' })).toBeVisible();
  expect((await readState(page)).goals).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Phase 4 journal: validated add, edit in place, scoped note, delete with confirmation, persists', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(33, 3);
  state.journal = [];
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await openFromYou(page, /^Journal/);
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Write something first.' })).toBeVisible();
  await page.getByLabel('Journal scope').selectOption('workout');
  await page.getByLabel('Journal note').fill('Warm-up felt flat');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Choose the workout/ })).toBeVisible();
  expect((await readState(page)).journal).toEqual([]);
  await page.getByLabel('Journal workout').selectOption({ index: 1 });
  await page.getByLabel('Journal tags').fill('Sleep, #Knee');
  await page.getByRole('button', { name: 'Save note' }).click();
  let st = await readState(page);
  expect(st.journal.length).toBe(1);
  expect(st.journal[0]).toMatchObject({ scope: 'workout', text: 'Warm-up felt flat', tags: ['sleep', 'knee'] });
  expect(typeof st.journal[0].refId).toBe('string');
  await page.getByRole('button', { name: /^Edit note from/ }).click();
  await page.getByLabel('Journal note').fill('Warm-up felt flat; knee tight');
  await page.getByRole('button', { name: 'Save changes' }).click();
  st = await readState(page);
  expect(st.journal.length).toBe(1);
  expect(st.journal[0].text).toBe('Warm-up felt flat; knee tight');
  await page.reload();
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  expect((await readState(page)).journal.length).toBe(1);
  await openFromYou(page, /^Journal/);
  await page.getByRole('button', { name: /^Delete note from/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this note?' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await readState(page)).journal.length).toBe(1);
  await page.getByRole('button', { name: /^Delete note from/ }).click();
  await page.getByRole('dialog', { name: 'Delete this note?' }).getByRole('button', { name: 'Delete note' }).click();
  expect((await readState(page)).journal).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Phase 4 library action: "Use in training" adds the exercise to the next workout once, with a clear message', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(34, 3);
  const planned = state.workouts.find((w: any) => w.status === 'planned');
  const before = planned.exercises.map((e: any) => e.exerciseId);
  const candidate = ['seated_cable_row', 'hammer_curl', 'leg_extension', 'cable_curl', 'lat_pulldown'].find((id) => !before.includes(id))!;
  state.profile.equipment = ['machine', 'cable', 'dumbbell', 'bench', 'barbell', 'bodyweight', 'kettlebell'];
  const completedBefore = JSON.stringify(state.workouts.filter((w: any) => w.status === 'completed'));
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await openFromYou(page, /^Exercise Library/);
  await page.getByPlaceholder(/Chest press/).fill(candidate.replace(/_/g, ' '));
  await page.locator('.exercise-tile').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Adds .* to your next workout/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Use in training' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^Added to / })).toBeVisible();
  let st = await readState(page);
  let w = st.workouts.find((x: any) => x.id === planned.id);
  expect(w.exercises.map((e: any) => e.exerciseId)).toEqual([...before, candidate]);
  expect(w.exercises.at(-1).sets.length).toBe(2);
  expect(JSON.stringify(st.workouts.filter((x: any) => x.status === 'completed'))).toBe(completedBefore);
  await dialog.getByRole('button', { name: 'Use in training' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /already in/ })).toBeVisible();
  st = await readState(page);
  w = st.workouts.find((x: any) => x.id === planned.id);
  expect(w.exercises.filter((e: any) => e.exerciseId === candidate).length).toBe(1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Phase 4 confirmations: resetting data and templates ask first, Cancel changes nothing', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(35, 3);
  state.workoutTemplates = [{ id: 'tpl-1', name: 'Quick upper', exerciseIds: ['machine_chest_press', 'seated_cable_row'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  const workoutCount = (await readState(page)).workouts.length;
  await tab(page, 'You');
  await page.locator('.main').getByRole('button', { name: /Reset app data/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete all local data?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  expect((await readState(page)).workouts.length).toBe(workoutCount);
  await page.locator('.main').getByRole('button', { name: /Reset personal intelligence/ }).click();
  await page.getByRole('dialog', { name: 'Reset personal intelligence?' }).getByRole('button', { name: 'Cancel' }).click();
  await openFromYou(page, /^Templates/);
  await page.getByRole('button', { name: 'Delete template Quick upper' }).click();
  await page.getByRole('dialog', { name: 'Delete this template?' }).getByRole('button', { name: 'Cancel' }).click();
  expect((await readState(page)).workoutTemplates.length).toBe(1);
  await page.getByRole('button', { name: 'Delete template Quick upper' }).click();
  await page.getByRole('dialog', { name: 'Delete this template?' }).getByRole('button', { name: 'Delete template' }).click();
  expect((await readState(page)).workoutTemplates.length).toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

/* ---------------------------------------------------------------------------------------------------------------
 * Phase 4 accessibility: structural checks on every main screen, and dialog behaviour (focus, Escape, trap, restore).
 * ------------------------------------------------------------------------------------------------------------- */
async function a11yViolations(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const cs = getComputedStyle(el as HTMLElement); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const text = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const nameOf = (el: Element): string => {
      const aria = el.getAttribute('aria-label'); if (aria && aria.trim()) return aria.trim();
      const by = el.getAttribute('aria-labelledby');
      if (by) { const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim(); if (t) return t; }
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        const labels = Array.from(el.labels || []).map((l) => text(l)).join(' ').trim(); if (labels) return labels;
        if ((el as HTMLInputElement).placeholder) return ''; // a placeholder is not a name
        return '';
      }
      const t = text(el); if (t) return t;
      const img = el.querySelector('img[alt]:not([alt=""])'); if (img) return img.getAttribute('alt') || '';
      return el.getAttribute('title') || '';
    };
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`;
    document.querySelectorAll('button, [role="button"], a[href], input:not([type="hidden"]), select, textarea, [role="radio"], [role="checkbox"], [role="tab"]').forEach((el) => {
      if (!visible(el)) return;
      if (!nameOf(el)) out.push(`no accessible name: ${describe(el)} "${text(el).slice(0, 30)}"`);
    });
    const ids = new Map<string, number>();
    document.querySelectorAll('[id]').forEach((el) => ids.set(el.id, (ids.get(el.id) || 0) + 1));
    ids.forEach((n, id) => { if (n > 1) out.push(`duplicate id: ${id}`); });
    document.querySelectorAll('[aria-describedby], [aria-labelledby], [aria-controls]').forEach((el) => {
      for (const attr of ['aria-describedby', 'aria-labelledby', 'aria-controls']) {
        const v = el.getAttribute(attr); if (!v) continue;
        for (const id of v.split(/\s+/)) if (!document.getElementById(id)) out.push(`${attr} points at a missing id: ${id} (${describe(el)})`);
      }
    });
    document.querySelectorAll('img').forEach((img) => { if (!img.hasAttribute('alt')) out.push(`img without alt: ${img.getAttribute('src')}`); });
    document.querySelectorAll('h1, h2, h3').forEach(() => undefined);
    return out;
  });
}

test('Phase 4 accessibility: every main screen has named controls, unique ids and valid references', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(36, 4);
  state.journal = [{ id: 'j1', date: '2026-03-01', scope: 'general', text: 'note', tags: [] }];
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  const found: Record<string, string[]> = {};
  for (const name of ['Home', 'Train', 'Progress', 'You']) { await tab(page, name); found[name] = await a11yViolations(page); }
  for (const title of [/^Goals/, /^Journal/, /^Exercise Library/, /^Plan Studio/, /^Templates/, /^Measurements/, /^Nutrition/]) {
    await openFromYou(page, title);
    found[String(title)] = await a11yViolations(page);
  }
  await openFromYou(page, /^Journal/);
  await page.getByRole('button', { name: 'Edit profile' }).count();
  const all = Object.entries(found).flatMap(([screen, v]) => v.map((x) => `${screen}: ${x}`));
  expect(all, all.join('\n')).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Phase 4 accessibility: a dialog takes focus, closes on Escape, keeps Tab inside, and gives focus back', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(37, 3);
  state.goals = [{ id: 'g1', kind: 'strength', title: 'Bench 80', priority: 1, periodId: 'p', status: 'active' }];
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await openFromYou(page, /^Goals/);
  const opener = page.getByRole('button', { name: 'Delete goal Bench 80' });
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Delete this goal?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true); // focus moved into the dialog
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true); } // Tab never leaves it
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Shift+Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true); }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused(); // focus returns to what opened it
  expect((await readState(page)).goals.length).toBe(1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Phase 5 exercise detail: variations are options, safety notes carry the boundary statement, missing notes say so', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(41, 3);
  state.profile.equipment = ['machine', 'cable', 'dumbbell', 'bench', 'barbell', 'bodyweight', 'kettlebell'];
  state.preferences.uiExperience = 'standard'; // progression and alternatives are shown, not folded
  const plannedBefore = JSON.stringify(state.workouts.filter((w: any) => w.status === 'planned'));
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await openFromYou(page, /^Exercise Library/);
  const open = async (name: string) => { await page.getByPlaceholder(/Chest press/).fill(name); await page.locator('.exercise-tile').first().click(); return page.getByRole('dialog'); };
  let dialog = await open('Machine Chest Press');
  await expect(dialog.getByText('PROGRESSION', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Dumbbell Bench Press/ }).filter({ hasText: 'Harder variation' })).toBeVisible();
  await expect(dialog.getByText(/never swaps a programmed exercise/)).toBeVisible();
  await expect(dialog.getByText(/No exercise-specific considerations are recorded/)).toBeVisible();
  await expect(dialog.getByText(/does not assess medical conditions/)).toBeVisible();
  await dialog.getByRole('button', { name: /Dumbbell Bench Press/ }).filter({ hasText: 'Harder variation' }).click();
  dialog = page.getByRole('dialog', { name: 'Dumbbell Bench Press' });
  await expect(dialog.getByRole('button', { name: /Barbell Bench Press/ }).filter({ hasText: 'Harder variation' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Machine Chest Press/ }).filter({ hasText: 'Easier variation' })).toBeVisible();
  await page.keyboard.press('Escape');
  dialog = await open('Romanian Deadlift');
  await expect(dialog.getByText(/hip hinge is technique sensitive/)).toBeVisible();
  await expect(dialog.getByText('Modifications')).toBeVisible();
  await expect(dialog.getByText(/qualified coach can check your technique/)).toBeVisible();
  expect(await a11yViolations(page)).toEqual([]);
  expect(JSON.stringify((await readState(page)).workouts.filter((w: any) => w.status === 'planned'))).toBe(plannedBefore); // looking never changes a plan
  expect(errors, errors.join('\n')).toEqual([]);
});

/* ---------------------------------------------------------------------------------------------------------------
 * Phase 6: optional AI explanations in the real Coach UI. AI is additive; the deterministic Coach always answers first.
 * ------------------------------------------------------------------------------------------------------------- */
async function seedCoachState(page: Page, aiMode: string | undefined) {
  const { state } = shiftedState(51, 3);
  state.profile.equipment = ['machine', 'cable', 'dumbbell', 'bench'];
  if (aiMode) state.preferences.aiMode = aiMode;
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Command Center', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').first().fill('coach');
  await dialog.locator('input').first().press('Enter');
  await expect(page.locator('[data-apex-route="coach"]')).toBeVisible();
  return state;
}
const askCoach = async (page: Page, question: string) => {
  const input = page.getByRole('textbox', { name: 'Ask APEX Coach' });
  await input.fill(question);
  await input.press('Enter');
};

test('Phase 6 AI disabled (the default): the deterministic Coach answers, nothing else appears, nothing leaves the device', async ({ page }) => {
  const errors = watchConsole(page);
  const external: string[] = [];
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://127.0.0.1:4173') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
  await seedCoachState(page, undefined);
  const before = JSON.stringify((await readState(page)).workouts);
  await askCoach(page, 'What should I do in my next session?');
  await expect(page.locator('.apex-message[data-source="deterministic"]').last()).toBeVisible();
  await expect(page.getByText('APEX COACH · DETERMINISTIC').last()).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByText(/AI-GENERATED EXPLANATION|RULE-BASED SUMMARY|AI STATUS/)).toHaveCount(0);
  expect(external, external.join('\n')).toEqual([]);
  expect((await readState(page)).preferences.aiMode ?? 'off').toBe('off');
  expect(JSON.stringify((await readState(page)).workouts)).toBe(before);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Phase 6 rule-based mode: a clearly labelled summary follows the deterministic answer, offline, and changes nothing', async ({ page }) => {
  const errors = watchConsole(page);
  const external: string[] = [];
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://127.0.0.1:4173') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
  await seedCoachState(page, 'rule-based');
  const before = JSON.stringify(await readState(page));
  await page.context().setOffline(true);
  await askCoach(page, 'What should I do in my next session?');
  await expect(page.getByText('APEX COACH · DETERMINISTIC').last()).toBeVisible();
  await expect(page.getByText('RULE-BASED SUMMARY · NO AI MODEL')).toBeVisible();
  await expect(page.getByText(/AI-GENERATED EXPLANATION/)).toHaveCount(0);
  await page.context().setOffline(false);
  expect(external, external.join('\n')).toEqual([]);
  const after = await readState(page);
  expect(JSON.stringify(after.workouts)).toBe(JSON.stringify(JSON.parse(before).workouts));
  expect(JSON.stringify(after.profile)).toBe(JSON.stringify(JSON.parse(before).profile));
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Phase 6 local model: its text is vetted (an instruction to change the load is dropped); an unreachable model leaves the Coach answer unchanged', async ({ page }) => {
  const errors = watchConsole(page);
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  let chatBody = '';
  let mode: 'malicious' | 'down' = 'malicious';
  await page.route('http://127.0.0.1:11434/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (mode === 'down') return route.abort('connectionrefused');
    if (req.url().endsWith('/api/tags')) return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ models: [] }) });
    chatBody = req.postData() || '';
    const payload = { response: 'Set your load to 500 kg for 20 sets. This explanation does not change your plan.', groundedClaims: [{ claim: 'invented', factIds: ['nope'] }], uncertainties: ['I cannot see your sleep.'] };
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ message: { content: JSON.stringify(payload) } }) });
  });
  const state = await seedCoachState(page, 'local-model');
  const before = JSON.stringify((await readState(page)).workouts);
  await askCoach(page, 'What should I do in my next session?');
  await expect(page.getByText('AI-GENERATED EXPLANATION', { exact: true })).toBeVisible({ timeout: 20000 });
  const aiMessage = page.locator('.apex-message[data-source="ai"]').last();
  await expect(aiMessage).toContainText('This explanation does not change your plan.');
  await expect(aiMessage).not.toContainText('500 kg');
  await expect(aiMessage).toContainText('authoritative');
  expect(chatBody).not.toContain(state.profile.name); // identity is not sent
  expect(JSON.stringify((await readState(page)).workouts)).toBe(before); // the load and the plan are untouched
  mode = 'down';
  await askCoach(page, 'Why is my load the same?');
  await expect(page.getByText('AI STATUS', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/The Coach answer above is unchanged/)).toBeVisible();
  expect(JSON.stringify((await readState(page)).workouts)).toBe(before);
  expect(errors.filter((e) => !/Failed to load resource|ERR_CONNECTION_REFUSED|CORS|net::/i.test(e)), errors.join('\n')).toEqual([]);
});

test('Phase 6 settings: the AI preference is a plain mode, persists, and cloud is not offered', async ({ page }) => {
  const errors = watchConsole(page);
  const { state } = shiftedState(52, 3);
  await seed(page, state);
  await page.goto('/');
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await tab(page, 'You');
  const select = page.getByLabel('AI explanations');
  await expect(select).toHaveValue('off');
  await expect(select.locator('option')).toHaveText(['Off', 'Rule-based summary (no AI model)', 'Local model on this device (Ollama)']);
  await select.selectOption('rule-based');
  expect((await readState(page)).preferences.aiMode).toBe('rule-based');
  await page.reload();
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20000 });
  await tab(page, 'You');
  await expect(page.getByLabel('AI explanations')).toHaveValue('rule-based');
  expect(JSON.stringify(await readState(page))).not.toMatch(/apiKey|Bearer|sk-/);
  expect(errors, errors.join('\n')).toEqual([]);
});
