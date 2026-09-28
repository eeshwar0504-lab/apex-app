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
        const root = document.querySelector('#root');
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

  test('Home command surfaces render and header stays in view at supported widths', async ({ page }) => {
    await boot(page, { width: 1280, height: 800 });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo(0, 0);
    });

    for (const selector of [
      '.apex-hero-v3',
      '.apex-hero-copy',
      '.apex-hero-visual',
      '.apex-command-meta',
      '.apex-command-grid',
      '.apex-session-card',
      '.apex-readout-card',
      '.apex-coach-card',
      '.apex-goal-card',
      '.apex-insight-grid',
      '.apex-recent-list',
      '.apex-quick-grid',
    ]) {
      await expect(page.locator(selector).first(), `${selector} should render on Home`).toBeVisible();
    }

    const heroLayout = await page.locator('.apex-hero-v3').evaluate(el => ({
      display: getComputedStyle(el).display,
      columns: getComputedStyle(el).gridTemplateColumns,
    }));
    expect(heroLayout.display).toBe('grid');
    expect(heroLayout.columns.trim().split(/\s+/)).toHaveLength(2);

    for (const size of [
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 412, height: 915 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(size);
      await page.evaluate(() => window.scrollTo(0, 0));
      await assertNoHorizontalOverflow(page);
      await assertViewportIntegrity(page);

      const responsiveColumns = await page.locator('.apex-hero-v3').evaluate(el =>
        getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length
      );
      expect(responsiveColumns, `hero should stack at ${size.width}px`).toBe(1);

      const topControls = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom, height: box.height };
        };
        const root = document.querySelector('#root');
        const body = document.body;
        return {
          scrollY: window.scrollY,
          rootScrollTop: root?.scrollTop ?? null,
          bodyScrollTop: body.scrollTop,
          rootOverflow: root ? `${getComputedStyle(root).overflowX}/${getComputedStyle(root).overflowY}` : null,
          header: rect('[data-apex-header]'),
          commandCenter: rect('.command-trigger'),
        };
      });

      for (const [name, box] of Object.entries({ header: topControls.header, commandCenter: topControls.commandCenter })) {
        expect(box, `${name} should exist`).not.toBeNull();
        const diagnostic = JSON.stringify({ size, scrollY: topControls.scrollY, rootScrollTop: topControls.rootScrollTop, bodyScrollTop: topControls.bodyScrollTop, rootOverflow: topControls.rootOverflow });
        expect(box!.top, `${name} should not start above the viewport (${diagnostic})`).toBeGreaterThanOrEqual(-1);
        expect(box!.bottom, `${name} should remain within the viewport (${diagnostic})`).toBeLessThanOrEqual(size.height + 1);
      }
    }
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
    const splash = page.locator('.apex3-splash');
    await expect(splash).toBeVisible({ timeout: 3000 });
    const early = await page.evaluate(() => {
      const el = document.querySelector('.apex3-splash');
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
    const splash = page.locator('.apex3-splash');
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

test('contextual Home imagery loads from the local asset bundle', async ({ page }) => {
  await boot(page);
  const image = page.locator('.apex-hero-image img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
});

test('contextual imagery shows a designed fallback when an asset fails', async ({ page }) => {
  await page.route('**/imagery/**', route => route.abort());
  await boot(page);
  await expect(page.locator('.apex-hero-image.is-fallback .apex-image-fallback')).toBeVisible();
});
