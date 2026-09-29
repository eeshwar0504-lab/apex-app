import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  resetApp,
  completeOnboarding,
  assertNoHorizontalOverflow,
} from './helpers';

const MOBILE = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-412', width: 412, height: 915 },
];

const TABLET = { name: 'tablet-768', width: 768, height: 1024 };

const ROUTES = [
  { query: 'Show my progress', route: 'progress', label: 'Progress' },
  { query: 'Open history', route: 'history', label: 'History' },
  { query: 'Open goals', route: 'goals', label: 'Goals' },
  { query: 'Open measurements', route: 'measurements', label: 'Measurements' },
  { query: 'Open my plan', route: 'plan', label: 'Plan Studio' },
  { query: 'Open templates', route: 'templates', label: 'Templates' },
  { query: 'Explain RIR', route: 'learn', label: 'Learn' },
  { query: 'Find chest press exercises', route: 'library', label: 'Exercise Library' },
  { query: 'Open coach', route: 'coach', label: 'Coach' },
];

async function boot(page: Page) {
  await resetApp(page);
  await completeOnboarding(page);
  await expect(page.locator('.app')).toBeVisible();
}

async function route(page: Page, query: string, routeName: string) {
  await page.getByRole('button', { name: 'Command Center', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const input = dialog.locator('input').first();
  await input.fill(query);
  await input.press('Enter');
  await expect(page.locator(`[data-apex-route="${routeName}"]`)).toBeVisible();
}

async function visibleFixedNav(page: Page): Promise<Locator> {
  const nav = page.locator('nav.bottom').first();
  await expect(nav).toBeVisible();
  return nav;
}

async function viewportMetrics(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: root.scrollWidth,
      bodyWidth: body.scrollWidth,
      documentHeight: root.scrollHeight,
      bodyHeight: body.scrollHeight,
    };
  });
}

async function assertNoViewportOverflow(page: Page) {
  const m = await viewportMetrics(page);
  expect(m.documentWidth, `document width ${m.documentWidth} > viewport ${m.viewportWidth}`)
    .toBeLessThanOrEqual(m.viewportWidth + 1);
  expect(m.bodyWidth, `body width ${m.bodyWidth} > viewport ${m.viewportWidth}`)
    .toBeLessThanOrEqual(m.viewportWidth + 1);
}

async function assertCriticalElementInsideViewport(page: Page, selector: string, label: string) {
  const loc = page.locator(selector).first();
  if (!(await loc.count())) return;
  if (!(await loc.isVisible())) return;

  const box = await loc.boundingBox();
  if (!box) return;

  const viewport = page.viewportSize()!;
  expect(box.x, `${label} starts left of viewport`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${label} starts above viewport`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${label} extends past right edge`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, `${label} extends past bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
}

async function assertNoClippedText(page: Page) {
  const result = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(
      'h1,h2,h3,h4,p,button,a,label,small,span,[role="button"]'
    ));
    const bad: string[] = [];

    for (const el of candidates) {
      if (!el.isConnected) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const text = (el.innerText || el.textContent || '').trim();
      if (!text) continue;

      const horizontalClipping =
        el.scrollWidth > el.clientWidth + 2 &&
        style.overflow !== 'visible' &&
        style.whiteSpace !== 'normal';

      const verticalClipping =
        el.scrollHeight > el.clientHeight + 2 &&
        style.overflow !== 'visible';

      if (horizontalClipping || verticalClipping) {
        bad.push(text.slice(0, 80));
      }
    }

    return bad.slice(0, 25);
  });

  expect(result, `Potentially clipped text: ${result.join(' | ')}`).toEqual([]);
}

async function assertTouchTargets(page: Page) {
  const result = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(
      'button,a,[role="button"],input[type="checkbox"],input[type="radio"],input[type="range"]'
    ));

    const tooSmall: string[] = [];

    for (const el of els) {
      if (!el.isConnected) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;

      // Ignore tiny decorative links/controls explicitly marked as compact.
      if (el.dataset.compact === 'true') continue;

      if (r.width < 40 || r.height < 40) {
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
        tooSmall.push(`${name.slice(0, 60)} [${Math.round(r.width)}x${Math.round(r.height)}]`);
      }
    }

    return tooSmall.slice(0, 30);
  });

  expect(result, `Touch targets below 40px: ${result.join(' | ')}`).toEqual([]);
}

async function assertBottomNav(page: Page) {
  const nav = await visibleFixedNav(page);
  const viewport = page.viewportSize()!;
  const before = await nav.boundingBox();
  expect(before).not.toBeNull();

  const style = await nav.evaluate(el => {
    const s = getComputedStyle(el);
    return {
      position: s.position,
      left: s.left,
      right: s.right,
      bottom: s.bottom,
      zIndex: s.zIndex,
    };
  });

  expect(['fixed', 'sticky']).toContain(style.position);

  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' }));
  await page.waitForTimeout(100);

  const after = await nav.boundingBox();
  expect(after).not.toBeNull();

  // A fixed nav should remain at essentially the same viewport position.
  if (style.position === 'fixed') {
    expect(Math.abs((after!.y) - (before!.y))).toBeLessThanOrEqual(2);
  }

  expect(after!.x).toBeGreaterThanOrEqual(-1);
  expect(after!.x + after!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(after!.y + after!.height).toBeLessThanOrEqual(viewport.height + 2);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
}

async function assertAccessibleInteractiveNames(page: Page) {
  const unnamed = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(
      'button,a,input,select,textarea,[role="button"],[role="checkbox"],[role="radio"],[role="switch"]'
    ));

    const bad: string[] = [];

    for (const el of els) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;

      const type = el.getAttribute('type');
      if (type === 'hidden') continue;

      const aria = el.getAttribute('aria-label')?.trim();
      const labelled = el.getAttribute('aria-labelledby')?.trim();
      const text = (el.innerText || el.textContent || '').trim();
      const title = el.getAttribute('title')?.trim();
      const placeholder = el.getAttribute('placeholder')?.trim();

      if (!aria && !labelled && !text && !title && !placeholder) {
        bad.push(el.outerHTML.slice(0, 180));
      }
    }

    return bad.slice(0, 25);
  });

  expect(unnamed, `Unnamed interactive controls: ${unnamed.join('\n')}`).toEqual([]);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/apex-qa-${name}-${page.viewportSize()!.width}x${page.viewportSize()!.height}.png`,
    fullPage: true,
  });
}

test.describe('APEX 3.0 — full automated UI/UX QA', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
  });

  test('home: viewport, overflow, hero and critical controls', async ({ page }) => {
    await assertNoHorizontalOverflow(page);
    await assertNoViewportOverflow(page);
    await assertCriticalElementInsideViewport(page, '.a3-hero', 'Home hero');
    await assertCriticalElementInsideViewport(page, '.a3-stats', 'Home stats');
    await assertNoClippedText(page);
    await screenshot(page, 'home');
  });

  test('bottom navigation remains fixed and usable after scrolling', async ({ page }) => {
    await assertBottomNav(page);
  });

  test('primary navigation reaches Home, Train, Progress and You', async ({ page }) => {
    const tabs = [
      ['Train', 'train'],
      ['Progress', 'progress'],
      ['You', 'you'],
    ] as const;

    for (const [label, routeName] of tabs) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator(`[data-apex-route="${routeName}"]`)).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertBottomNav(page);
    }

    await page.getByRole('button', { name: 'APEX Home', exact: true }).click();
    await expect(page.locator('[data-apex-route="home"]')).toBeVisible();
  });

  test('all first-class routes render through Command Center', async ({ page }) => {
    for (const item of ROUTES) {
      await route(page, item.query, item.route);
      await assertNoHorizontalOverflow(page);
      await assertNoClippedText(page);
      await assertBottomNav(page);
      await screenshot(page, item.route);
    }
  });

  test('Command Center opens, accepts search and routes correctly', async ({ page }) => {
    const cc = page.getByRole('button', { name: 'Command Center', exact: true });
    await cc.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const input = dialog.locator('input').first();
    await expect(input).toBeVisible();
    await input.fill('Show my progress');
    await input.press('Enter');

    await expect(page.locator('[data-apex-route="progress"]')).toBeVisible();
  });

  test('interactive controls have accessible names', async ({ page }) => {
    await assertAccessibleInteractiveNames(page);
  });

  test('interactive controls meet a practical mobile touch target', async ({ page }) => {
    await assertTouchTargets(page);
  });

  test('normal motion exposes animation and reduced motion disables it', async ({ page }) => {
    const indicator = page.locator('.a3-home > .a3-greet').first();
    await expect(indicator).toBeVisible();

    const normal = await indicator.evaluate(el => {
      const s = getComputedStyle(el);
      return { name: s.animationName, duration: parseFloat(s.animationDuration) || 0 };
    });

    expect(normal.name).not.toBe('none');

    await page.getByRole('button', { name: 'You', exact: true }).click();
    await expect(page.locator('[data-apex-route="you"]')).toBeVisible();

    const reduce = page.getByRole('checkbox', { name: 'Reduce motion', exact: true });
    await expect(reduce).toBeVisible();
    if (!(await reduce.isChecked())) await reduce.check();

    await expect(reduce).toBeChecked();
    await expect(page.locator('.app')).toHaveClass(/(?:^|\s)reduce-motion(?:\s|$)/);

    await page.getByRole('button', { name: 'APEX Home', exact: true }).click();
    const reduced = await indicator.evaluate(el => {
      const s = getComputedStyle(el);
      return { name: s.animationName, duration: parseFloat(s.animationDuration) || 0 };
    });

    expect(reduced.name).toBe('none');
    expect(reduced.duration).toBeLessThanOrEqual(0.01);
  });

  test('accessibility settings persist across reload', async ({ page }) => {
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await expect(page.locator('[data-apex-route="you"]')).toBeVisible();

    const reduce = page.getByRole('checkbox', { name: 'Reduce motion', exact: true });
    if (!(await reduce.isChecked())) await reduce.check();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.app')).toHaveClass(/(?:^|\s)reduce-motion(?:\s|$)/);
  });

  test('large-text mode does not create overflow', async ({ page }) => {
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await expect(page.locator('[data-apex-route="you"]')).toBeVisible();

    const large = page.getByRole('button', { name: /Large text/i }).first();
    if (await large.count()) {
      await large.click();
      await page.waitForTimeout(150);
    } else {
      const checkbox = page.getByRole('checkbox', { name: /Large text/i }).first();
      if (await checkbox.count() && !(await checkbox.isChecked())) await checkbox.check();
    }

    await page.getByRole('button', { name: 'APEX Home', exact: true }).click();
    await assertNoHorizontalOverflow(page);
    await assertNoViewportOverflow(page);
    await assertNoClippedText(page);
    await assertBottomNav(page);
  });

  test('high contrast mode preserves layout integrity', async ({ page }) => {
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await expect(page.locator('[data-apex-route="you"]')).toBeVisible();

    const control = page.getByRole('checkbox', { name: /High contrast/i }).first();
    if (await control.count()) {
      if (!(await control.isChecked())) await control.check();
    }

    await page.getByRole('button', { name: 'APEX Home', exact: true }).click();
    await assertNoHorizontalOverflow(page);
    await assertNoViewportOverflow(page);
  });

  test('Train screen remains inside viewport and has usable controls', async ({ page }) => {
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await expect(page.locator('[data-apex-route="train"]')).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await assertNoViewportOverflow(page);
    await assertNoClippedText(page);
    await assertTouchTargets(page);
    await assertBottomNav(page);
    await screenshot(page, 'train');
  });

  test('Progress screen remains inside viewport and renders analytics', async ({ page }) => {
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await expect(page.locator('[data-apex-route="progress"]')).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await assertNoViewportOverflow(page);
    await assertNoClippedText(page);
    await assertBottomNav(page);
    await screenshot(page, 'progress');
  });

  test('You screen exposes settings without viewport breakage', async ({ page }) => {
    await page.getByRole('button', { name: 'You', exact: true }).click();
    await expect(page.locator('[data-apex-route="you"]')).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await assertNoViewportOverflow(page);
    await assertAccessibleInteractiveNames(page);
    await assertBottomNav(page);
    await screenshot(page, 'you');
  });

  test('all supported mobile widths remain inside the viewport', async ({ page }) => {
    for (const size of MOBILE) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.app')).toBeVisible();

      await assertNoHorizontalOverflow(page);
      await assertNoViewportOverflow(page);
      await assertNoClippedText(page);
      await assertBottomNav(page);
    }
  });

  test('tablet layout remains inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: TABLET.width, height: TABLET.height });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.locator('.app')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNoViewportOverflow(page);
    await assertNoClippedText(page);
    await assertBottomNav(page);
  });

  test('splash has a deliberate visible animation window', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const splash = page.locator('.apex3-splash').first();
    if (!(await splash.count())) {
      test.info().annotations.push({
        type: 'warning',
        description: 'No known splash selector was found; splash test skipped.',
      });
      return;
    }

    await expect(splash).toBeVisible();

    const first = Date.now();
    await page.waitForTimeout(900);
    const stillVisible = await splash.isVisible().catch(() => false);
    const elapsed = Date.now() - first;

    // The APEX 3.0 cinematic splash should not disappear almost immediately.
    expect(stillVisible, `Splash disappeared after ~${elapsed}ms`).toBeTruthy();

    await page.waitForTimeout(1500);
    await expect(page.locator('.app')).toBeVisible();
  });

  test('splash reduced-motion path does not depend on animation completion', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('apex-test-reduced-motion', 'true');
      } catch {}
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const splash = page.locator('.apex3-splash').first();
    if (await splash.count()) {
      await expect(page.locator('.app')).toBeVisible({ timeout: 6000 });
    } else {
      await expect(page.locator('.app')).toBeVisible({ timeout: 6000 });
    }
  });

  test('no obvious horizontal overflow across all first-class routes at 412px', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });

    const all = [
      { query: 'Show my progress', route: 'progress' },
      { query: 'Open history', route: 'history' },
      { query: 'Open goals', route: 'goals' },
      { query: 'Open measurements', route: 'measurements' },
      { query: 'Open my plan', route: 'plan' },
      { query: 'Open templates', route: 'templates' },
      { query: 'Explain RIR', route: 'learn' },
      { query: 'Find chest press exercises', route: 'library' },
      { query: 'Open coach', route: 'coach' },
    ];

    for (const item of all) {
      await route(page, item.query, item.route);
      await assertNoHorizontalOverflow(page);
      await assertNoViewportOverflow(page);
    }
  });
});
