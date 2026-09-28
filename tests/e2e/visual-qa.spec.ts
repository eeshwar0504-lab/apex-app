import { test, expect } from '@playwright/test';
import { resetApp, completeOnboarding, assertNoHorizontalOverflow } from './helpers';

const MOBILE = { width: 412, height: 915 };
const TABLET = { width: 768, height: 1024 };

async function boot(page: Parameters<typeof test>[0] extends never ? never : any, viewport = MOBILE) {
  await page.setViewportSize(viewport);
  await resetApp(page);
  await completeOnboarding(page);
}

async function geometry(page: any) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const nav = document.querySelector('.bottom') as HTMLElement | null;
    const app = document.querySelector('.app') as HTMLElement | null;
    const body = document.body;
    const doc = document.documentElement;
    const navRect = nav?.getBoundingClientRect();
    const appRect = app?.getBoundingClientRect();
    return {
      viewport: { width: vw, height: vh },
      scrollWidth: Math.max(body.scrollWidth, doc.scrollWidth),
      scrollHeight: Math.max(body.scrollHeight, doc.scrollHeight),
      nav: navRect ? { left: navRect.left, right: navRect.right, top: navRect.top, bottom: navRect.bottom, width: navRect.width, height: navRect.height, position: getComputedStyle(nav).position } : null,
      app: appRect ? { left: appRect.left, right: appRect.right, width: appRect.width } : null,
    };
  });
}

async function assertViewportIntegrity(page: any) {
  const g = await geometry(page);
  expect(g.scrollWidth, JSON.stringify(g)).toBeLessThanOrEqual(g.viewport.width + 1);
  expect(g.app?.left ?? 0, JSON.stringify(g)).toBeGreaterThanOrEqual(-1);
  expect(g.app?.right ?? g.viewport.width, JSON.stringify(g)).toBeLessThanOrEqual(g.viewport.width + 1);
  expect(g.nav, 'APEX bottom navigation must exist').not.toBeNull();
  expect(g.nav.position, JSON.stringify(g)).toMatch(/fixed|sticky/);
  expect(g.nav.left, JSON.stringify(g)).toBeGreaterThanOrEqual(-1);
  expect(g.nav.right, JSON.stringify(g)).toBeLessThanOrEqual(g.viewport.width + 1);
  expect(g.nav.bottom, JSON.stringify(g)).toBeLessThanOrEqual(g.viewport.height + 1);
  expect(g.nav.top, JSON.stringify(g)).toBeGreaterThanOrEqual(-1);
}

test.describe('APEX 3.0 visual QA', () => {
  test('412px Home has no horizontal overflow and nav is viewport anchored', async ({ page }) => {
    await boot(page);
    await assertViewportIntegrity(page);
    await assertNoHorizontalOverflow(page);
  });

  test('bottom navigation remains fixed while content scrolls', async ({ page }) => {
    await boot(page);
    const before = await page.locator('.bottom').boundingBox();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);
    const after = await page.locator('.bottom').boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(Math.abs((before?.y ?? 0) - (after?.y ?? 0))).toBeLessThanOrEqual(2);
    await assertViewportIntegrity(page);
  });

  test('critical Home controls stay inside the 412px viewport', async ({ page }) => {
    await boot(page);
    const failures = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const selectors = ['.apex-hero-core', '.apex-live-status', '.premium-bottom-nav', '.bottom'];
      return selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)).map((node: any) => {
        const r = node.getBoundingClientRect();
        return r.left < -1 || r.right > vw + 1 ? { selector, left: r.left, right: r.right, width: r.width } : null;
      })).filter(Boolean);
    });
    expect(failures).toEqual([]);
  });

  test('Train and Progress retain viewport integrity', async ({ page }) => {
    await boot(page);
    for (const route of ['train', 'progress', 'you']) {
      await page.getByRole('button', { name: route === 'train' ? 'Train' : route === 'progress' ? 'Progress' : 'You', exact: true }).click();
      await expect(page.locator(`[data-apex-route="${route}"]`)).toBeVisible();
      await assertViewportIntegrity(page);
    }
  });

  test('tablet layout stays inside viewport', async ({ page }) => {
    await boot(page, TABLET);
    await assertViewportIntegrity(page);
  });

  test('splash remains visible long enough for the cinematic sequence', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    const start = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const splash = page.locator('.splash');
    await expect(splash).toBeVisible({ timeout: 3000 });
    const early = await page.evaluate(() => {
      const el = document.querySelector('.splash');
      if (!el) return null;
      const style = getComputedStyle(el);
      return { opacity: style.opacity, animationName: style.animationName, animationDuration: style.animationDuration };
    });
    expect(early).not.toBeNull();
    expect(early?.animationName).not.toBe('none');
    const visibleForAtLeast = 900;
    await page.waitForTimeout(visibleForAtLeast);
    await expect(splash).toBeVisible();
    expect(Date.now() - start).toBeGreaterThanOrEqual(visibleForAtLeast);
  });

  test('reduced motion removes splash animation', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const splash = page.locator('.splash');
    await expect(splash).toBeVisible({ timeout: 3000 });
    const style = await splash.evaluate(el => {
      const s = getComputedStyle(el);
      return { animationName: s.animationName, animationDuration: s.animationDuration, transitionDuration: s.transitionDuration };
    });
    expect(style.animationName).toBe('none');
    expect(parseFloat(style.animationDuration) || 0).toBeLessThanOrEqual(0.01);
  });

  test('visual evidence screenshots are captured for key screens', async ({ page }) => {
    await boot(page);
    const screens = [
      ['home', 'Home'],
      ['train', 'Train'],
      ['progress', 'Progress'],
      ['you', 'You'],
    ] as const;
    for (const [name, label] of screens) {
      if (name !== 'home') await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator(`[data-apex-route="${name}"]`)).toBeVisible();
      await page.screenshot({ path: `test-results/visual-qa-${name}-412.png`, fullPage: false });
    }
  });
});
