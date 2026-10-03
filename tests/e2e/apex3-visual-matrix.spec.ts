import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import { resetApp, completeOnboarding } from './helpers';

/*
 * APEX 3.0 visual-QA matrix.
 * Every reachable screen x 360/390/412px x System/Large/Larger text.
 * Failures are collected per screen with expect.soft so one run reports all of them.
 */

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
];
const TEXT_SIZES = [
  { label: 'system', option: 'System' },
  { label: 'large', option: 'Large' },
  { label: 'larger', option: 'Larger' },
] as const;

const SHOT_DIR = 'qa-results/apex3-visual';

type Screen = { name: string; go: (page: Page) => Promise<boolean> };

const tab = (page: Page, label: string) =>
  page.locator('.bottom').getByRole('button', { name: label, exact: true }).click();

async function viaYou(page: Page, row: RegExp) {
  await tab(page, 'You');
  const target = page.locator('.main').getByRole('button', { name: row }).first();
  if (!(await target.isVisible().catch(() => false))) return false;
  await target.click();
  return true;
}

const SCREENS: Screen[] = [
  { name: 'home', go: async (p) => { await tab(p, 'Home'); return true; } },
  { name: 'train', go: async (p) => { await tab(p, 'Train'); return true; } },
  { name: 'progress', go: async (p) => { await tab(p, 'Progress'); return true; } },
  { name: 'you', go: async (p) => { await tab(p, 'You'); return true; } },
  {
    name: 'history',
    go: async (p) => {
      await tab(p, 'Progress');
      const b = p.locator('.main').getByRole('button', { name: /^History/ }).first();
      if (!(await b.isVisible().catch(() => false))) return false;
      await b.click();
      return true;
    },
  },
  { name: 'goals', go: (p) => viaYou(p, /^Goals/) },
  { name: 'measurements', go: (p) => viaYou(p, /^Body measurements/) },
  { name: 'plan', go: (p) => viaYou(p, /^Plan Studio/) },
  { name: 'library', go: (p) => viaYou(p, /^Exercise Library/) },
  { name: 'templates', go: (p) => viaYou(p, /^Templates/) },
  { name: 'coach', go: (p) => viaYou(p, /^Coach/) },
  { name: 'learn', go: (p) => viaYou(p, /^Learn/) },
  {
    name: 'brief',
    go: async (p) => {
      await tab(p, 'Train');
      const start = p.locator('.main').getByRole('button', { name: /Begin session|Resume session/ }).first();
      if (!(await start.isVisible().catch(() => false))) return false;
      await start.click();
      return p.locator('[data-apex-route^="brief:"]').waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
    },
  },
];

/* Workout phases are reached by driving the real UI forward, capturing every distinct phase. */
const WORKOUT_ADVANCE = [/Review equipment/i, /^Continue/i, /START SET/i, /Log set/i, /Save Set/i, /ABOUT RIGHT/i, /SKIP REST/i, /^CONTINUE/, /REVIEW SESSION/i, /FINISH SESSION/i];

async function startWorkoutFromBrief(page: Page) {
  await page.getByRole('button', { name: /^Start training/i }).waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  for (let i = 0; i < 12; i++) {
    const confirm = page.getByRole('button', { name: 'Confirm available' }).first();
    if (!(await confirm.isVisible().catch(() => false))) break;
    await confirm.click();
  }
  const go = page.getByRole('button', { name: /^Start training/i });
  if (!(await go.isEnabled().catch(() => false))) return false;
  await go.click();
  return page.locator('[data-apex-route="workout"]').waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
}

/* ---------------------------------------------------------------- checks */

async function auditLayout(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const issues: string[] = [];
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const doc = document.documentElement;
    const label = (el: Element) => {
      const c = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}"${t}"`;
    };
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    /* 1. horizontal overflow + right gap */
    const sw = Math.max(document.body.scrollWidth, doc.scrollWidth);
    if (sw > vw + 1) issues.push(`horizontal overflow: scrollWidth ${sw} > viewport ${vw}`);
    const app = document.querySelector('.app')?.getBoundingClientRect();
    if (app && (Math.abs(app.right - vw) > 1 || app.left < -1)) issues.push(`.app not flush: left ${app.left} right ${app.right} vw ${vw}`);
    for (const sel of ['.topbar', '.bottom']) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (r && (Math.abs(r.width - vw) > 1 || r.left < -1)) issues.push(`${sel} right gap: left ${r.left} width ${r.width} vw ${vw}`);
    }
    const main = document.querySelector('.main')?.getBoundingClientRect();
    if (main) {
      const gapL = main.left;
      const gapR = vw - main.right;
      if (Math.abs(gapL - gapR) > 2) issues.push(`.main off-centre: left gap ${gapL.toFixed(1)} right gap ${gapR.toFixed(1)}`);
    }

    /* 2. controls outside viewport */
    document.querySelectorAll('button, a[href], input, select, textarea, [role=button]').forEach((el) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1) issues.push(`control outside viewport: ${label(el)} [${r.left.toFixed(0)}..${r.right.toFixed(0)}]`);
    });

    /* 3. text leaves: clipping + overlap */
    const leaves: Array<{ el: Element; r: DOMRect }> = [];
    document.querySelectorAll('.main *, .topbar *').forEach((el) => {
      if (el.closest('svg')) return;
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim());
      if (!hasText || !visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) issues.push(`text outside viewport: ${label(el)} [${r.left.toFixed(0)}..${r.right.toFixed(0)}]`);
      const cs = getComputedStyle(el);
      const clipsX = ['hidden', 'clip'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis';
      const clipsY = ['hidden', 'clip'].includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 2 && cs.display !== 'inline';
      if (clipsX || clipsY) issues.push(`clipped text: ${label(el)} scroll ${el.scrollWidth}x${el.scrollHeight} client ${el.clientWidth}x${el.clientHeight}`);
      leaves.push({ el, r });
    });
    for (let i = 0; i < leaves.length && i < 500; i++) {
      for (let j = i + 1; j < leaves.length && j < 500; j++) {
        const a = leaves[i], b = leaves[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 3 && h > 3 && (w * h) / Math.min(a.r.width * a.r.height, b.r.width * b.r.height) > 0.2) {
          issues.push(`overlapping text: ${label(a.el)} x ${label(b.el)}`);
        }
      }
    }

    /* 4. fixed chrome + clearance */
    const top = document.querySelector('.topbar') as HTMLElement | null;
    const nav = document.querySelector('.bottom') as HTMLElement | null;
    if (!top || getComputedStyle(top).position !== 'fixed') issues.push('topbar is not position:fixed');
    if (!nav || getComputedStyle(nav).position !== 'fixed') issues.push('bottom nav is not position:fixed');
    const mainEl = document.querySelector('.main') as HTMLElement | null;
    if (top && mainEl) {
      const first = mainEl.firstElementChild?.getBoundingClientRect();
      const tb = top.getBoundingClientRect().bottom;
      if (first && window.scrollY === 0 && first.top < tb - 1) issues.push(`content starts under topbar: first.top ${first.top.toFixed(0)} < topbar.bottom ${tb.toFixed(0)}`);
    }
    return issues;
  });
}

async function auditScrollEnd(page: Page): Promise<string[]> {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior }));
  await page.waitForTimeout(80);
  return page.evaluate(() => {
    const issues: string[] = [];
    const nav = document.querySelector('.bottom') as HTMLElement | null;
    const top = document.querySelector('.topbar') as HTMLElement | null;
    const main = document.querySelector('.main') as HTMLElement | null;
    const vh = document.documentElement.clientHeight;
    if (!nav || !main) return ['nav/main missing'];
    const nr = nav.getBoundingClientRect();
    if (Math.abs(nr.bottom - vh) > 1.5) issues.push(`nav not pinned after scroll: bottom ${nr.bottom.toFixed(0)} vh ${vh}`);
    if (top && Math.abs(top.getBoundingClientRect().top) > 1.5) issues.push(`topbar not pinned after scroll: top ${top.getBoundingClientRect().top.toFixed(0)}`);
    let lowest = 0;
    main.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) lowest = Math.max(lowest, r.bottom + window.scrollY);
    });
    const maxScroll = document.documentElement.scrollHeight - vh;
    const lastBottomInView = lowest - window.scrollY;
    if (lastBottomInView > nr.top + 1) issues.push(`content hidden behind nav: lowest content ${lastBottomInView.toFixed(0)} > nav.top ${nr.top.toFixed(0)}`);
    const emptyBelow = document.documentElement.scrollHeight - lowest;
    if (maxScroll > 0 && emptyBelow > nr.height + 96) issues.push(`excessive empty scroll space: ${emptyBelow.toFixed(0)}px below last content (nav ${nr.height.toFixed(0)}px)`);
    return issues;
  });
}

/* ----------------------------------------------------------------- setup */

async function setTextSize(page: Page, option: string) {
  await tab(page, 'You');
  await page.locator('.main').getByLabel('Text size').selectOption({ label: option });
  await page.waitForTimeout(120);
}

async function bootMatrix(page: Page, vp: { width: number; height: number }, size: string) {
  await page.setViewportSize(vp);
  await resetApp(page);
  await completeOnboarding(page);
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  if (size !== 'System') await setTextSize(page, size);
}

async function settle(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
  await page.waitForTimeout(650); /* entry animations */
}

/* ----------------------------------------------------------------- tests */

for (const vp of VIEWPORTS) {
  for (const size of TEXT_SIZES) {
    test(`screens @${vp.width}px text:${size.label}`, async ({ page }) => {
      test.setTimeout(240_000);
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await bootMatrix(page, vp, size.option);

      const shot = async (name: string) => {
        await page.screenshot({ path: `${SHOT_DIR}/${name}-${vp.width}-${size.label}.png`, fullPage: false });
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior }));
        await page.waitForTimeout(60);
        await page.screenshot({ path: `${SHOT_DIR}/${name}-${vp.width}-${size.label}-end.png`, fullPage: false });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
      };

      const unreachable: string[] = [];
      for (const screen of SCREENS) {
        const ok = await screen.go(page);
        if (!ok) { unreachable.push(screen.name); continue; }
        await settle(page);
        const layout = await auditLayout(page);
        expect.soft(layout, `[${screen.name}] layout`).toEqual([]);
        await shot(screen.name);
        await settle(page);
        const end = await auditScrollEnd(page);
        expect.soft(end, `[${screen.name}] scroll/nav clearance`).toEqual([]);
      }

      /* navigation must reset scroll: scroll a long screen, then switch tab */
      await tab(page, 'Progress');
      await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' as ScrollBehavior }));
      const before = await page.evaluate(() => window.scrollY);
      await tab(page, 'You');
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => window.scrollY);
      if (before > 0) expect.soft(after, 'scroll must reset to 0 after navigation').toBe(0);

      /* workout phases (driven through the real UI) */
      await tab(page, 'Train');
      const start = page.locator('.main').getByRole('button', { name: /Begin session|Resume session/ }).first();
      if (await start.isVisible().catch(() => false)) {
        await start.click();
        await page.locator('[data-apex-route="workout"], [data-apex-route^="brief:"]').first().waitFor({ timeout: 8000 }).catch(() => {});
        const inWorkout = (await page.locator('[data-apex-route="workout"]').isVisible().catch(() => false)) || (await startWorkoutFromBrief(page));
        if (inWorkout) {
          const seen = new Set<string>();
          for (let i = 0; i < 12; i++) {
            await settle(page);
            const phase = ((await page.locator('.a3-workout .a3-stage .a3-eyebrow, .a3-workout .a3-topcopy .a3-eyebrow, .a3-workout .a3-loghead h2').first().textContent({ timeout: 2000 }).catch(() => '')) || 'phase').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
            const name = 'workout-' + (phase || 'phase');
            if (!seen.has(name)) {
              seen.add(name);
              const layout = await auditLayout(page);
              expect.soft(layout, ).toEqual([]);
              await shot(name);
            }
            let clicked = false;
            for (const re of WORKOUT_ADVANCE) {
              const btn = page.locator('.main').getByRole('button', { name: re }).first();
              if (await btn.isVisible().catch(() => false)) { await btn.click(); clicked = true; break; }
            }
            if (!clicked) break;
          }
          unreachable.push('workout phases captured: ' + [...seen].join('|'));
        } else unreachable.push('workout');
      } else unreachable.push('workout');

      test.info().annotations.push({ type: 'unreachable', description: unreachable.join(', ') || 'none' });
    });
  }
}

test('splash appears exactly once per load', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[1]);
  await page.addInitScript(() => {
    (window as any).__splashAdds = 0;
    new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => {
        if (n instanceof Element && (n.matches('.apex3-splash') || n.querySelector('.apex3-splash'))) (window as any).__splashAdds++;
      });
    }).observe(document, { childList: true, subtree: true });
  });
  await resetApp(page);
  await completeOnboarding(page);
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(4000);
  for (const l of ['Train', 'Progress', 'You', 'Home']) await tab(page, l);
  const adds = await page.evaluate(() => (window as any).__splashAdds);
  const still = await page.locator('.apex3-splash').count();
  expect(adds, 'splash DOM insertions in this page load').toBeLessThanOrEqual(1);
  expect(still, 'splash must be gone after its sequence').toBe(0);
});

test('reduced motion disables APEX 3.0 animations (OS setting)', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[1]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await resetApp(page);
  await completeOnboarding(page);
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 15_000 });
  await tab(page, 'Home');
  const names = await page.evaluate(() => {
    const el = document.querySelector('.a3-home > *') as HTMLElement | null;
    return el ? getComputedStyle(el).animationName : 'missing';
  });
  expect(names).toBe('none');
});

test('reduced motion disables APEX 3.0 animations (in-app preference)', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[1]);
  await resetApp(page);
  await completeOnboarding(page);
  await expect(page.locator('.bottom')).toBeVisible({ timeout: 15_000 });
  await tab(page, 'You');
  await page.getByRole('checkbox', { name: 'Reduce motion', exact: true }).check();
  await tab(page, 'Home');
  await expect(page.locator('.app.reduce-motion')).toHaveCount(1);
  const name = await page.evaluate(() => {
    const el = document.querySelector('.a3-home > *') as HTMLElement | null;
    return el ? getComputedStyle(el).animationName : 'missing';
  });
  expect(name).toBe('none');
});

/* ====================================================================
 * Extension: workout complete, exercise complete, and modal/sheet states.
 * Reuses bootMatrix / settle / auditLayout / startWorkoutFromBrief above.
 * ==================================================================== */

async function auditModal(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const issues: string[] = [];
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const modal = document.querySelector('.a3-modal') as HTMLElement | null;
    if (!modal) return ['modal (.a3-modal) is not present'];
    const label = (el: Element) => {
      const c = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}"${t}"`;
    };
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const sw = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
    if (sw > vw + 1) issues.push(`horizontal overflow: scrollWidth ${sw} > viewport ${vw}`);
    const mr = modal.getBoundingClientRect();
    if (mr.left < -1 || mr.right > vw + 1) issues.push(`modal outside viewport horizontally [${mr.left.toFixed(0)}..${mr.right.toFixed(0)}] vw ${vw}`);
    if (mr.bottom > vh + 1) issues.push(`modal extends below viewport: bottom ${mr.bottom.toFixed(0)} vh ${vh}`);
    if (mr.top < -1) issues.push(`modal extends above viewport: top ${mr.top.toFixed(0)}`);
    if (modal.scrollWidth > modal.clientWidth + 1) issues.push(`modal content wider than modal: ${modal.scrollWidth} > ${modal.clientWidth}`);
    modal.querySelectorAll('button, a[href], input, select, textarea, [role=button]').forEach((el) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1) issues.push(`control outside viewport: ${label(el)} [${r.left.toFixed(0)}..${r.right.toFixed(0)}]`);
    });
    const leaves: Array<{ el: Element; r: DOMRect }> = [];
    modal.querySelectorAll('*').forEach((el) => {
      if (el.closest('svg')) return;
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim());
      if (!hasText || !visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) issues.push(`text outside viewport: ${label(el)} [${r.left.toFixed(0)}..${r.right.toFixed(0)}]`);
      const cs = getComputedStyle(el);
      const clipsX = ['hidden', 'clip'].includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis';
      const clipsY = ['hidden', 'clip'].includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 2 && cs.display !== 'inline';
      if (clipsX || clipsY) issues.push(`clipped text: ${label(el)} scroll ${el.scrollWidth}x${el.scrollHeight} client ${el.clientWidth}x${el.clientHeight}`);
      leaves.push({ el, r });
    });
    for (let i = 0; i < leaves.length && i < 500; i++) {
      for (let j = i + 1; j < leaves.length && j < 500; j++) {
        const a = leaves[i], b = leaves[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 3 && h > 3 && (w * h) / Math.min(a.r.width * a.r.height, b.r.width * b.r.height) > 0.2) {
          issues.push(`overlapping text: ${label(a.el)} x ${label(b.el)}`);
        }
      }
    }
    return issues;
  });
}

async function closeModal(page: Page) {
  await page.locator('.a3-modal .a3-modal-head button').first().click();
  await expect(page.locator('.a3-modal')).toHaveCount(0);
}

for (const vp of VIEWPORTS) {
  for (const size of TEXT_SIZES) {
    test(`states @${vp.width}px text:${size.label}`, async ({ page }) => {
      test.setTimeout(420_000);
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await bootMatrix(page, vp, size.option);
      const notes: string[] = [];

      const shot = async (name: string) => {
        await page.screenshot({ path: `${SHOT_DIR}/${name}-${vp.width}-${size.label}.png`, fullPage: false });
      };
      const modalState = async (name: string, open: () => Promise<boolean>) => {
        if (!(await open())) { notes.push(`${name}: could not open`); return; }
        await page.waitForTimeout(450);
        const issues = await auditModal(page);
        expect.soft(issues, `[${name}] modal`).toEqual([]);
        await shot(name);
        await closeModal(page);
      };

      /* enter the workout through the real UI */
      await tab(page, 'Train');
      const start = page.locator('.main').getByRole('button', { name: /Begin session|Resume session/ }).first();
      await expect(start).toBeVisible();
      await start.click();
      await page.locator('[data-apex-route="workout"], [data-apex-route^="brief:"]').first().waitFor({ timeout: 8000 }).catch(() => {});
      const inWorkout = (await page.locator('[data-apex-route="workout"]').isVisible().catch(() => false)) || (await startWorkoutFromBrief(page));
      expect(inWorkout, 'workout must start').toBe(true);
      await settle(page);

      /* ExerciseSheet */
      await modalState('state-exercise-sheet', async () => {
        const b = page.locator('.main').getByRole('button', { name: 'Details', exact: true }).first();
        if (!(await b.isVisible().catch(() => false))) return false;
        await b.click();
        return page.locator('.a3-modal').isVisible({ timeout: 3000 }).catch(() => false);
      });

      /* the session menu (View, Journal, Safety, Pause) is a surface of its own */
      await page.locator('.main').getByRole('button', { name: 'More', exact: true }).click().catch(() => {});
      await settle(page);
      expect.soft(await auditLayout(page), '[state-session-menu] layout').toEqual([]);
      await shot('state-session-menu');

      /* Safety modal */
      await modalState('state-safety-modal', async () => {
        const b = page.locator('.main').getByRole('button', { name: 'Safety', exact: true }).first();
        if (!(await b.isVisible().catch(() => false))) return false;
        await b.click();
        return page.locator('.a3-modal').isVisible({ timeout: 3000 }).catch(() => false);
      });

      /* Journal: the toolbar button is exercised; a modal is audited if one opens,
         otherwise the workout-notes surface in overview mode is audited instead. */
      {
        const j = page.locator('.main').getByRole('button', { name: 'Journal', exact: true }).first();
        if (await j.isVisible().catch(() => false)) {
          await j.click();
          await expect(page.locator('[data-apex-route="journal"]')).toBeVisible();
          await settle(page);
          expect.soft(await auditLayout(page), '[state-journal] layout').toEqual([]);
          await shot('state-journal');
          await tab(page, 'Train'); // the workout is still running: Train returns to it
          await expect(page.locator('[data-apex-route="workout"]')).toBeVisible();
        } else notes.push('journal: button not visible');
      }

      /* Overview mode (exercise cards) + substitution modal */
      await page.locator('.main').getByRole('button', { name: 'More', exact: true }).click().catch(() => {});
      await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Advanced', exact: true }).click().catch(() => {});
      const overviewBtn = page.locator('.main').getByRole('button', { name: 'Whole workout', exact: true }).first();
      if (await overviewBtn.isVisible().catch(() => false)) {
        await overviewBtn.click();
        await settle(page);
        const layout = await auditLayout(page);
        expect.soft(layout, '[state-overview] layout').toEqual([]);
        await shot('state-overview');
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior }));
        await page.waitForTimeout(80);
        await shot('state-overview-end');
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
        await modalState('state-substitution-modal', async () => {
          const b = page.locator('.main').getByRole('button', { name: 'Replace', exact: true }).first();
          if (!(await b.isVisible().catch(() => false))) return false;
          await b.click();
          return page.locator('.a3-modal').isVisible({ timeout: 3000 }).catch(() => false);
        });
        const focusBtn = page.locator('.main').getByRole('button', { name: 'Back to focus', exact: true }).first();
        if (await focusBtn.isVisible().catch(() => false)) await focusBtn.click();
        await settle(page);
      } else notes.push('overview: toggle not visible');

      /* Drive the session forward: exercise complete, then workout complete */
      let exerciseCompleteSeen = false;
      let workoutCompleteSeen = false;
      for (let i = 0; i < 220 && !workoutCompleteSeen; i++) {
        if (!exerciseCompleteSeen && (await page.locator('.a3-stage-done').isVisible().catch(() => false))) {
          exerciseCompleteSeen = true;
          await settle(page);
          expect.soft(await auditLayout(page), '[state-exercise-complete] layout').toEqual([]);
          await shot('state-exercise-complete');
        }
        if (await page.locator('.a3-stage-done').getByText('SESSION COMPLETE', { exact: true }).isVisible().catch(() => false)) {
          workoutCompleteSeen = true;
          await settle(page);
          expect.soft(await auditLayout(page), '[state-workout-complete] layout').toEqual([]);
          await shot('state-workout-complete');
          await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior }));
          await page.waitForTimeout(80);
          await shot('state-workout-complete-end');
          break;
        }
        let clicked = false;
        for (const re of WORKOUT_ADVANCE.filter((r) => !/FINISH SESSION/i.test(r.source))) {
          const btn = page.locator('.main').getByRole('button', { name: re }).first();
          if (await btn.isVisible().catch(() => false)) { await btn.click(); clicked = true; break; }
        }
        if (!clicked) await page.waitForTimeout(150);
        await page.waitForTimeout(40);
      }
      if (!exerciseCompleteSeen) notes.push('exercise-complete: not reached');
      if (!workoutCompleteSeen) notes.push('workout-complete: not reached');
      expect.soft(exerciseCompleteSeen, 'exercise-complete stage reached').toBe(true);
      expect.soft(workoutCompleteSeen, 'workout-complete stage reached').toBe(true);
      test.info().annotations.push({ type: 'notes', description: notes.join(' | ') || 'none' });
    });
  }
}
