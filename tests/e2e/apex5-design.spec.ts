import { test, expect, type Page } from '@playwright/test';
import { resetApp, completeOnboarding } from './helpers';

/*
 * APEX 5.0 design: the objects, the disclosure levels and the cause-and-effect behaviour, driven through the real UI.
 */
const STATE_KEY = 'apex-state-v4';
const readState = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), STATE_KEY);

/* Gives the app real, ordered history for today's exercises (three older sessions that were lighter), then reloads. */
async function seedHistory(page: Page) {
  await page.evaluate((k) => {
    const state = JSON.parse(localStorage.getItem(k) as string);
    const planned = state.workouts.find((w: any) => w.status === 'planned');
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    for (const n of [3, 2, 1]) {
      const date = day(-7 * n);
      state.workouts.push({
        id: `seed-${n}`, planId: planned.planId, name: planned.name, scheduledDate: date, status: 'completed', source: 'scheduled', version: 1,
        startedAt: `${date}T10:00:00.000Z`, completedAt: `${date}T10:50:00.000Z`, updatedAt: `${date}T10:50:00.000Z`,
        exercises: planned.exercises.map((e: any, i: number) => ({
          exerciseId: e.exerciseId, order: i, prescribedSets: 3, repRange: e.repRange, restSec: e.restSec, status: 'completed',
          sets: [0, 1, 2].map((s) => ({ id: `seed-${n}-${i}-${s}`, type: 'working', weight: Math.max(5, (e.sets[0].weight ?? 20) - n * 2.5), reps: 10, completed: true })),
        })),
      });
    }
    const first = planned.exercises[0];
    state.achievements = [{ id: 'ach-seed', workoutId: 'seed-1', exerciseId: first.exerciseId, kind: 'load', label: 'Heaviest load', value: (first.sets[0].weight ?? 20) - 2.5, unit: 'kg', timestamp: `${day(-7)}T10:50:00.000Z` }];
    localStorage.setItem(k, JSON.stringify(state));
  }, STATE_KEY);
  await page.reload();
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 20_000 });
}

async function setView(page: Page, name: 'Guided' | 'Standard' | 'Advanced') {
  const more = page.getByRole('button', { name: 'More', exact: true });
  if (await more.isVisible().catch(() => false)) await more.click();
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact: true }).click();
}

async function beginSession(page: Page) {
  await page.locator('.main').getByRole('button', { name: /Begin session|Resume session/ }).first().click();
  await page.getByRole('button', { name: /^Start training/i }).click();
  await expect(page.locator('[data-apex-route="workout"]')).toBeVisible({ timeout: 10_000 });
}

test.describe('APEX 5.0 design', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await completeOnboarding(page);
  });

  test('Ghost Set: last time sits behind the target in Standard and Advanced, and is absent in Guided', async ({ page }) => {
    await seedHistory(page);
    await beginSession(page);
    await expect(page.getByLabel('Previous performance')).toHaveCount(0); // Guided
    await setView(page, 'Standard');
    await expect(page.getByLabel('Previous performance').first()).toContainText('LAST TIME');
    await expect(page.getByLabel('Previous performance').first()).toContainText('NOW');
    await setView(page, 'Guided');
    await expect(page.getByLabel('Previous performance')).toHaveCount(0);
  });

  test('UI Experience reflows the same screen and never changes what is prescribed', async ({ page }) => {
    await seedHistory(page);
    await beginSession(page);
    const prescription = async () => JSON.stringify((await readState(page)).workouts.find((w: any) => w.status === 'in_progress').exercises.map((e: any) => [e.exerciseId, e.repRange, e.prescribedSets, e.sets.map((s: any) => [s.type, s.weight, s.reps])]));
    const before = await prescription();
    await setView(page, 'Advanced');
    await setView(page, 'Standard');
    await setView(page, 'Guided');
    expect(await prescription()).toBe(before);
    const st = await readState(page);
    expect(st.preferences.uiExperience).toBe('guided');
  });

  test('Session Thread: the workout contracts into a dock while you look elsewhere, and returns', async ({ page }) => {
    await beginSession(page);
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    const dock = page.getByRole('button', { name: /^Resume .*sets done/ });
    await expect(dock).toBeVisible();
    await expect(dock).toContainText('SESSION IN PROGRESS');
    await dock.click();
    await expect(page.locator('[data-apex-route="workout"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Resume .*sets done/ })).toHaveCount(0);
  });

  test('cause → effect: logging a set shows what it changed, once, down the line', async ({ page }) => {
    await beginSession(page);
    for (let i = 0; i < 40; i++) {
      if (await page.getByRole('button', { name: 'Log set' }).isVisible().catch(() => false)) {
        const label = (await page.locator('.set-counter-motion').first().textContent()) || '';
        if (/^SET \d/.test(label.trim())) break;
        await page.getByRole('button', { name: 'Log set' }).click();
        continue;
      }
      const skip = page.getByRole('button', { name: 'SKIP REST', exact: true });
      if (await skip.isVisible().catch(() => false)) { await skip.click(); continue; }
      const start = page.getByRole('button', { name: /START SET/i }).first();
      if (await start.isVisible().catch(() => false)) { await start.click(); continue; }
      await page.waitForTimeout(60);
    }
    await page.getByRole('button', { name: 'Log set' }).click();
    const cause = page.getByLabel('What this set changed');
    await expect(cause).toBeVisible();
    await expect(cause).toContainText('SET');
    await expect(cause).toContainText('EXERCISE');
    await expect(cause).toContainText('SESSION');
  });

  test('rest: the APEX Line is the timer, with +15, +30, skip and the next set', async ({ page }) => {
    await beginSession(page);
    await page.getByRole('button', { name: /START SET/i }).click();
    await page.getByRole('button', { name: 'Log set' }).click(); // a warm-up or first set: rest follows (or feedback first)
    const notSure = page.getByRole('button', { name: /Not sure · skip/ });
    if (await notSure.isVisible().catch(() => false)) await notSure.click();
    const timer = page.getByRole('timer');
    await expect(timer).toBeVisible();
    await expect(timer.locator('.apex-line')).toHaveCount(1);
    for (const b of ['+15 SEC', '+30 SEC', 'SKIP REST']) await expect(page.getByRole('button', { name: b })).toBeVisible();
    await expect(page.getByText(/^NEXT/).first()).toBeVisible();
    const before = await page.evaluate(() => (document.querySelector('.apex-line-timer > i') as HTMLElement).style.transform);
    await page.getByRole('button', { name: '+30 SEC' }).click();
    const after = await page.evaluate(() => (document.querySelector('.apex-line-timer > i') as HTMLElement).style.transform);
    expect(after).not.toBe('');
    expect(before).not.toBe('');
  });

  test('Training Map: the week is a line of nodes with text names; rest is space; editing is deliberate', async ({ page }) => {
    await seedHistory(page);
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    const week = page.getByRole('group', { name: /^Training week from/ });
    await expect(week).toBeVisible();
    const nodes = week.getByRole('button');
    await expect(nodes).toHaveCount(7);
    expect(await nodes.first().getAttribute('aria-label')).toMatch(/Monday \d{4}-\d{2}-\d{2}: /);
    await expect(page.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Skip', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Done editing' }).click();
    // scale: week → block → history
    await page.getByRole('tab', { name: 'Block' }).click();
    await expect(page.locator('.apex-block-row')).toHaveCount(5);
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByRole('button', { name: 'Open full history' })).toBeVisible();
    await page.getByRole('tab', { name: 'Session' }).click();
    await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible();
  });

  test('Observatory: a strength point opens the exact sets, the session and a Coach question', async ({ page }) => {
    await seedHistory(page);
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await expect(page.getByLabel('What changed')).toContainText('WHAT CHANGED');
    for (const t of ['Overview', 'Strength', 'Volume', 'Consistency', 'Recovery', 'Body']) await expect(page.getByRole('tab', { name: t })).toBeVisible();
    await page.getByRole('tab', { name: 'Strength' }).click();
    const points = page.locator('.apex-traj-point');
    expect(await points.count()).toBeGreaterThan(1);
    await points.first().click();
    const evidence = page.getByLabel('Evidence', { exact: true });
    await expect(evidence).toBeVisible();
    await expect(evidence.getByRole('table')).toBeVisible();
    await expect(evidence.getByRole('row')).not.toHaveCount(1);
    await expect(page.getByText('Diamonds mark personal records.')).toBeVisible();
    await evidence.getByRole('button', { name: 'Open session' }).click();
    await expect(page.locator('[data-apex-route^="session:"]')).toBeVisible();
  });

  test('Observatory: volume layers, the rhythm map and the recovery state each have a text alternative', async ({ page }) => {
    await seedHistory(page);
    await setViewFromYou(page, 'Standard');
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await page.getByRole('tab', { name: 'Volume' }).click();
    await expect(page.getByRole('list', { name: 'Weekly volume by muscle' })).toBeVisible();
    await page.getByRole('tab', { name: 'Consistency' }).click();
    await expect(page.getByRole('table', { name: /Training rhythm/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Recovery' }).click();
    await expect(page.locator('.apex-recovery-list li').first()).toBeVisible();
  });

  test('Coach is an observation system: observation, WHY, WHAT CHANGED, what APEX recommends; structured Ask Coach', async ({ page }) => {
    await seedHistory(page);
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await page.getByRole('button', { name: 'Coach', exact: true }).click();
    await expect(page.getByText('APEX OBSERVATION')).toBeVisible();
    await expect(page.locator('.apex-observation')).not.toBeEmpty();
    await expect(page.getByRole('button', { name: 'WHY', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'WHY', exact: true }).click();
    await expect(page.getByRole('button', { name: 'WHAT CHANGED' })).toBeVisible();
    await expect(page.getByText('WHAT APEX RECOMMENDS')).toBeVisible();
    const input = page.getByRole('textbox', { name: 'Ask APEX Coach' });
    await input.fill('What should I do in my next session?');
    await input.press('Enter');
    const reply = page.locator('.apex-message.apex').last();
    for (const part of ['ANSWER', 'INTERPRETATION']) await expect(reply).toContainText(part);
    await expect(reply).toContainText(/Confidence:/);
  });

  test('contextual Coach opens over the set that raised the question, and returns to the same place', async ({ page }) => {
    await seedHistory(page);
    await beginSession(page);
    await setView(page, 'Standard');
    await page.getByRole('button', { name: 'Why this weight?' }).click();
    const counterBefore = await page.locator('.a3-focus-head h2').textContent();
    await page.getByRole('button', { name: /Ask Coach why/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Coach' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Why was this target selected');
    await expect(sheet).toContainText('ANSWER');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('.a3-focus-head h2')).toHaveText(counterBefore || '');
  });

  test('Exercise Dossier opens over the workout and closing restores the same exercise', async ({ page }) => {
    await beginSession(page);
    const name = (await page.locator('.a3-focus-head h2').textContent()) || '';
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const dossier = page.getByRole('dialog', { name });
    await expect(dossier).toBeVisible();
    for (const h of ['HOW TO', 'SETUP', 'TECHNIQUE', 'MUSCLES', 'EQUIPMENT']) await expect(dossier.getByText(h, { exact: true })).toBeVisible();
    for (const h of ['YOUR HISTORY', 'PROGRESSION', 'ALTERNATIVES']) await expect(dossier.getByText(h, { exact: true }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dossier).toHaveCount(0);
    await expect(page.locator('[data-apex-route="workout"]')).toBeVisible();
    await expect(page.locator('.a3-focus-head h2')).toHaveText(name);
  });

  test('completion artifact: the finished session shows time, sets, volume, and travels into the training week', async ({ page }) => {
    test.setTimeout(300_000);
    await seedHistory(page);
    await beginSession(page);
    for (let step = 0; step < 400; step++) {
      if (await page.locator('[data-apex-route^="session:"]').isVisible().catch(() => false)) break;
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
    await expect(page.getByText('SESSION COMPLETE', { exact: true }).first()).toBeVisible();
    await expect(page.locator('[data-session-artifact]')).toBeVisible();
    await expect(page.locator('.session-review-metrics')).toContainText('Time');
    await expect(page.locator('.session-review-metrics')).toContainText('Volume');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.locator('[data-apex-route="train"]')).toBeVisible();
    await expect(page.locator('.apex-node.is-fresh')).toHaveCount(1);
  });

  test('Home grows with the athlete: week line, observation and no streak or zero tiles', async ({ page }) => {
    await expect(page.getByLabel('This week')).toHaveCount(0); // zero data: a composed empty state
    await seedHistory(page);
    await expect(page.getByLabel('This week')).toBeVisible();
    await expect(page.getByLabel('Coach observation')).toBeVisible();
    await expect(page.locator('.home-screen')).not.toContainText(/streak/i);
    await expect(page.locator('.home-screen')).toHaveAttribute('data-home-state', /normal|progressing|returning|fatigued|deload|recovery/);
  });

  test('themes: four atmospheres, the old ones migrate, high contrast is a theme and a switch', async ({ page }) => {
    await page.getByRole('button', { name: 'You', exact: true }).click();
    const group = page.getByRole('radiogroup', { name: 'Theme' });
    await expect(group.getByRole('radio')).toHaveCount(4);
    for (const [name, id] of [['Graphite', 'graphite'], ['Bone / Paper Night', 'bone'], ['High Contrast', 'contrast'], ['Obsidian', 'obsidian']] as const) {
      await group.getByRole('radio', { name: new RegExp(name) }).click();
      await expect(page.locator('.app')).toHaveAttribute('data-theme', id);
    }
    await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) as string); s.preferences.theme = 'classic'; localStorage.setItem(k, JSON.stringify(s)); }, STATE_KEY);
    await page.reload();
    await expect(page.locator('.app')).toHaveAttribute('data-theme', 'bone');
  });

  test('haptics: the vocabulary is gentler when asked, and absent when off', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as typeof window & { __v: Array<number | number[]> };
      w.__v = [];
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p: number | number[]) => { w.__v.push(p); return true; } });
    });
    await page.getByRole('button', { name: 'You', exact: true }).click();
    const gentle = page.getByRole('checkbox', { name: 'Gentle haptics' });
    await expect(gentle).toBeEnabled();
    await gentle.check();
    await expect(gentle).toBeChecked();
    await page.getByRole('checkbox', { name: 'Haptics', exact: true }).uncheck();
    await expect(gentle).toBeDisabled();
    expect((await readState(page)).preferences.hapticsGentle).toBe(true);
  });

  test('Settings are organised by consequence, with the workout experience prominent and previewed', async ({ page }) => {
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    const titles = await page.locator('section.a3-block').filter({ has: page.getByRole('heading', { name: 'Settings' }) }).locator('.a3-list strong').allTextContents();
    expect(titles.slice(0, 8)).toEqual(['Training', 'Experience', 'Appearance', 'Notifications', 'Haptics', 'Accessibility', 'Data', 'Privacy']);
    const group = page.getByRole('radiogroup', { name: 'Workout experience' });
    await expect(group).toContainText('Essentials, explained as needed.');
    await expect(group).toContainText('More context and control.');
    await expect(page.getByText('This changes what you see, not what you train.').first()).toBeVisible();
    await group.getByRole('radio', { name: /Advanced/ }).click();
    await expect(page.getByLabel('Preview of the set screen')).toHaveAttribute('data-level', 'advanced');
    await expect(page.getByLabel('Preview of the set screen')).toContainText('Set type');
  });

  test('Goals are trajectories: current state, target, trend and the next signal', async ({ page }) => {
    await seedHistory(page);
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await page.locator('.main').getByRole('button', { name: 'Goals' }).first().click();
    await page.getByRole('button', { name: /Add goal/ }).click();
    await page.getByLabel('Goal title').fill('Ten sessions');
    await page.getByLabel('Goal type').selectOption('general');
    await page.getByLabel('Target label').fill('Sessions');
    await page.getByLabel('Target value').fill('10');
    await page.getByLabel('Goal unit').selectOption('sessions');
    await page.getByRole('button', { name: 'Create goal', exact: true }).click();
    const card = page.locator('.apex-goal').filter({ hasText: 'Ten sessions' });
    for (const t of ['CURRENT STATE', 'TARGET', 'TREND', 'NEXT MEANINGFUL SIGNAL']) await expect(card).toContainText(t);
    await expect(card.locator('.apex-line')).toHaveCount(1);
  });

  test('Journal is frictionless: the note comes first, one sentence is enough, and it resurfaces beside the exercise', async ({ page }) => {
    await seedHistory(page);
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await page.locator('.main').getByRole('button', { name: 'Journal' }).first().click();
    const note = page.getByLabel('Journal note');
    await expect(note).toHaveAttribute('placeholder', 'One sentence is enough.');
    const first = await page.locator('form, section.plan-editor').first().locator('label').first().innerText();
    expect(first).toMatch(/Note/);
    await page.getByLabel('Journal scope').selectOption('exercise');
    const ex = page.getByLabel('Journal exercise');
    const firstExercise = (await readState(page)).workouts.find((w: any) => w.status === 'planned').exercises[0].exerciseId;
    await ex.selectOption(firstExercise);
    await note.fill('Left shoulder felt tight on pressing.');
    await page.getByRole('button', { name: 'Save note' }).click();
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await page.getByRole('tab', { name: 'Strength' }).click();
    await expect(page.getByLabel('Your notes')).toContainText('Left shoulder felt tight on pressing.');
  });

  test('Nutrition stays supporting: Guided is calories, protein and water; Standard adds the detail', async ({ page }) => {
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await page.locator('.main').getByRole('button', { name: 'Nutrition' }).first().click();
    await expect(page.getByLabel(/Carbs/)).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Week' })).toHaveCount(0);
    await expect(page.getByText('Your targets')).toHaveCount(0);
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await page.getByRole('radiogroup', { name: 'Workout experience' }).getByRole('radio', { name: /Standard/ }).click();
    await page.locator('.main').getByRole('button', { name: 'Nutrition' }).first().click();
    await expect(page.getByLabel(/Carbs/).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Week' })).toBeVisible();
    await expect(page.getByText('Your targets')).toBeVisible();
  });

  test('empty states are complete sentences with one useful action', async ({ page }) => {
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await expect(page.getByText('Your first session draws the first line.')).toBeVisible();
    await expect(page.getByText('Complete a few sessions and APEX will begin finding patterns.')).toBeVisible();
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByText('Your training history begins here.')).toBeVisible();
  });

  test('touch targets: primary workout controls are 56dp or more, the rest 48dp or more', async ({ page }) => {
    await beginSession(page);
    await page.getByRole('button', { name: /START SET/i }).click();
    const big = async (name: string | RegExp) => (await page.getByRole('button', { name }).first().boundingBox())!.height;
    expect(await big('Log set')).toBeGreaterThanOrEqual(56);
    expect(await big('Increase reps')).toBeGreaterThanOrEqual(56);
    for (const n of ['Home', 'Train', 'Progress', 'You']) expect(await big(new RegExp(`^${n}$`))).toBeGreaterThanOrEqual(48);
  });

  test('anti-patterns: no confetti, no streak guilt, no social, and a visible text label on every primary action', async ({ page }) => {
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const bad of ['confetti', 'streak', 'followers', 'congratulations', '🎉']) expect(text).not.toContain(bad);
    expect(await page.locator('.a3-pr-rays, .a3-ridge').count()).toBe(0);
    const unlabeled = await page.evaluate(() => Array.from(document.querySelectorAll('.main .a3-cta')).filter((b) => !(b.textContent || '').trim()).length);
    expect(unlabeled).toBe(0);
  });

  test('reduced motion: nothing travels and the view-transition path is skipped', async ({ page }) => {
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Reduce motion' }).check();
    await expect(page.locator('.app')).toHaveClass(/reduce-motion/);
    await expect(page.locator('.app')).not.toHaveAttribute('data-vt', '1');
    const ms = await page.evaluate(() => getComputedStyle(document.querySelector('.app') as Element).getPropertyValue('--motion-smooth').trim());
    expect(parseFloat(ms)).toBeLessThan(1);
  });
});

async function setViewFromYou(page: Page, name: 'Guided' | 'Standard' | 'Advanced') {
  await page.getByRole('button', { name: 'You', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Workout experience' }).getByRole('radio', { name: new RegExp(name) }).click();
}
