import { expect, Page } from '@playwright/test';

async function waitForOnboarding(page: Page) {
  const onboarding = page.locator('.onboarding');
  const continueButton = page.getByRole('button', {
    name: /^Continue/i,
  });

  /*
   * Wait until APEX has actually left its hydration splash and rendered
   * onboarding. We deliberately inspect the DOM state rather than adding
   * arbitrary sleeps.
   */
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const onboarding = document.querySelector('.onboarding');
          const continueButton = Array.from(
            onboarding?.querySelectorAll('button') ?? []
          ).find((button) =>
            /^Continue/i.test((button.getAttribute('aria-label') || button.textContent || '').trim())
          );

          return Boolean(onboarding && continueButton);
        }),
      {
        timeout: 20_000,
        intervals: [100, 250, 500],
        message: 'APEX onboarding did not render after hydration.',
      }
    )
    .toBe(true);

  await expect(onboarding).toBeVisible({
    timeout: 10_000,
  });

  await expect(continueButton).toBeVisible({
    timeout: 10_000,
  });

  return continueButton;
}

async function clearBrowserPersistence(page: Page) {
  await page.evaluate(async () => {
    try {
      localStorage.clear();
    } catch {
      // Ignore unavailable storage.
    }

    try {
      sessionStorage.clear();
    } catch {
      // Ignore unavailable storage.
    }

    /*
     * IndexedDB is not used by APEX's web persistence path, but clearing it
     * makes the helper safe if a future web adapter introduces it.
     */
    try {
      if ('indexedDB' in window && 'databases' in indexedDB) {
        const databases = await indexedDB.databases();

        await Promise.all(
          databases
            .filter((database) => Boolean(database.name))
            .map(
              (database) =>
                new Promise<void>((resolve) => {
                  const request = indexedDB.deleteDatabase(
                    database.name as string
                  );

                  request.onsuccess = () => resolve();
                  request.onerror = () => resolve();
                  request.onblocked = () => resolve();
                })
            )
        );
      }
    } catch {
      // Best-effort only.
    }

    /*
     * Prevent stale service-worker/cache state from affecting tests.
     */
    try {
      if ('serviceWorker' in navigator) {
        const registrations =
          await navigator.serviceWorker.getRegistrations();

        await Promise.all(
          registrations.map((registration) =>
            registration.unregister().catch(() => false)
          )
        );
      }
    } catch {
      // Best-effort only.
    }

    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();

        await Promise.all(
          cacheNames.map((cacheName) =>
            caches.delete(cacheName).catch(() => false)
          )
        );
      }
    } catch {
      // Best-effort only.
    }
  });
}

export async function resetApp(page: Page) {
  /*
   * Clear storage before the first application script can hydrate state.
   */
  await page.addInitScript(() => {
    try {
      const resetMarker = '__apex_e2e_reset_once';
      if (sessionStorage.getItem(resetMarker) === 'done') return;
      sessionStorage.clear();
      sessionStorage.setItem(resetMarker, 'done');
      localStorage.clear();
    } catch {
      // Storage may not be available yet.
    }

    /*
     * IndexedDB is best-effort here. APEX's current web repository does not
     * use native SQLite in Playwright.
     */
    try {
      if ('indexedDB' in window && 'databases' in indexedDB) {
        void indexedDB.databases().then((databases) => {
          for (const database of databases) {
            if (!database.name) continue;

            try {
              indexedDB.deleteDatabase(database.name);
            } catch {
              // Continue.
            }
          }
        });
      }
    } catch {
      // Best-effort only.
    }
  });

  /*
   * Initial navigation.
   */
  await page.goto('/', {
    waitUntil: 'domcontentloaded',
  });

  /*
   * Clear anything created during the first document lifecycle.
   */
  await clearBrowserPersistence(page);

  /*
   * Reload so APEX starts from the genuinely empty state.
   */
  await page.reload({
    waitUntil: 'domcontentloaded',
  });

  /*
   * IMPORTANT:
   *
   * This is the ONLY place where we wait for onboarding hydration.
   * completeOnboarding() must consume the state produced here instead of
   * performing another independent hydration wait.
   */
  const continueButton = await waitForOnboarding(page);

  await expect(page.locator('.a3-intro')).toBeVisible({
    timeout: 10_000,
  });

  /*
   * Give React one render opportunity after hydration before the next helper
   * begins interacting with the onboarding state.
   */
  await page.waitForFunction(() => {
    const onboarding = document.querySelector('.onboarding');
    const button = Array.from(
      onboarding?.querySelectorAll('button') ?? []
    ).find((candidate) =>
      /^Continue/i.test((candidate.getAttribute('aria-label') || candidate.textContent || '').trim())
    );

    return Boolean(button);
  });

  await expect(continueButton).toBeEnabled();
}

export async function completeOnboarding(page: Page) {
  /*
   * resetApp() has already synchronized hydration and onboarding.
   *
   * Do NOT call waitForOnboarding() here. Re-running the hydration
   * synchronization was the source of the previous failure.
   */
  const continueButton = page.getByRole('button', {
    name: /^Continue/i,
  });

  await expect(continueButton).toBeVisible({
    timeout: 10_000,
  });

  /*
   * Step 1 — Intro
   */
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  /*
   * Step 2 — Training goal
   */
  const buildMuscle = page.getByRole('button', {
    name: /Build muscle/i,
  });

  await expect(buildMuscle).toBeVisible({
    timeout: 10_000,
  });

  await expect(continueButton).toBeDisabled();

  await buildMuscle.click();

  await expect(buildMuscle).toHaveClass(/selected/);
  await expect(continueButton).toBeEnabled();

  await continueButton.click();

  /*
   * Step 3 — Training experience
   */
  const beginner = page.getByRole('button', {
    name: 'Beginner',
  });

  await expect(beginner).toBeVisible({
    timeout: 10_000,
  });

  await expect(continueButton).toBeDisabled();

  await beginner.click();

  await expect(beginner).toHaveClass(/selected/);
  await expect(continueButton).toBeEnabled();

  await continueButton.click();

  /*
   * Step 4 — Training schedule
   */
  const trainingDays = page.getByRole('button', {
    name: /4 days \/ week/i,
  });

  const sessionLength = page.getByRole('button', {
    name: /60 minutes/i,
  });

  await expect(trainingDays).toBeVisible({
    timeout: 10_000,
  });

  await expect(sessionLength).toBeVisible({
    timeout: 10_000,
  });

  await expect(continueButton).toBeDisabled();

  await trainingDays.click();

  await expect(continueButton).toBeDisabled();

  await sessionLength.click();

  await expect(continueButton).toBeEnabled();

  await continueButton.click();

  /*
   * Step 5 — Equipment
   */
  await expect(continueButton).toBeVisible({
    timeout: 10_000,
  });

  await expect(continueButton).toBeDisabled();

  for (const equipment of [
    'Machine',
    'Cable',
    'Dumbbell',
    'Barbell',
    'Bench',
    'Bodyweight',
  ]) {
    const equipmentButton = page.getByRole('button', {
      name: new RegExp(`^${equipment}`, 'i'),
    });

    await expect(equipmentButton).toBeVisible({
      timeout: 10_000,
    });

    await equipmentButton.click();
  }

  await expect(continueButton).toBeEnabled();

  await continueButton.click();

  /*
   * Step 6 — Preferences (units, haptics, motion) keep their defaults.
   */
  await expect(page.getByText('A few preferences.')).toBeVisible({
    timeout: 10_000,
  });

  await continueButton.click();

  /*
   * Step 7 — UI Experience: Guided is the default.
   */
  await expect(page.getByRole('radio', { name: /Guided/ })).toHaveAttribute('aria-checked', 'true', {
    timeout: 10_000,
  });

  await continueButton.click();

  /*
   * Step 8 — Your APEX profile, then build.
   */
  const build = page.getByRole('button', {
    name: /Build my APEX plan/i,
  });

  await expect(build).toBeVisible({
    timeout: 10_000,
  });

  await expect(build).toBeEnabled();

  await build.click();

  /*
   * Onboarding completion updates React state and generates the initial plan.
   * Wait for the actual Home route rather than assuming the click is synchronous.
   */
  await expect(
    page.locator('[data-apex-route="home"]')
  ).toBeVisible({
    timeout: 20_000,
  });

  await expect(page.locator('.a3-home .a3-hero, .apex-command-hero').first()).toBeVisible({
    timeout: 20_000,
  });
}

export async function installReducedMotion(page: Page) {
  /*
   * APEX stores reduced-motion inside preferences.reducedMotion.
   */
  const stateWritten = await page.evaluate(() => {
    const candidates = [
      'apex-state-v4',
      'apex-state',
      'apex-app-state',
      'apex-state-v5',
    ];

    for (const key of candidates) {
      const raw = localStorage.getItem(key);

      if (!raw) {
        continue;
      }

      try {
        const state = JSON.parse(raw);

        if (
          state &&
          typeof state === 'object' &&
          state.preferences &&
          typeof state.preferences === 'object'
        ) {
          state.preferences = {
            ...state.preferences,
            reducedMotion: true,
          };

          localStorage.setItem(key, JSON.stringify(state));

          return {
            key,
            reducedMotion: state.preferences.reducedMotion,
          };
        }
      } catch {
        // Continue searching.
      }
    }

    return {
      key: null,
      reducedMotion: false,
    };
  });

  expect(
    stateWritten.reducedMotion,
    `Could not locate a persisted APEX state containing preferences.reducedMotion. Keys checked: ${[
      'apex-state-v4',
      'apex-state',
      'apex-app-state',
      'apex-state-v5',
    ].join(', ')}`
  ).toBe(true);

  await page.reload({
    waitUntil: 'domcontentloaded',
  });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const keys = [
            'apex-state-v4',
            'apex-state',
            'apex-app-state',
            'apex-state-v5',
          ];

          for (const key of keys) {
            const raw = localStorage.getItem(key);

            if (!raw) {
              continue;
            }

            try {
              const state = JSON.parse(raw);

              if (
                state?.preferences &&
                state.preferences.reducedMotion === true
              ) {
                return true;
              }
            } catch {
              // Ignore malformed state.
            }
          }

          return false;
        }),
      {
        timeout: 10_000,
        message:
          'APEX did not persist preferences.reducedMotion=true after reload.',
      }
    )
    .toBe(true);

  const app = page.locator('.app');

  await expect(app).toBeVisible({
    timeout: 10_000,
  });

  await expect(app).toHaveClass(
    /(?:^|\s)reduce-motion(?:\s|$)/,
    {
      timeout: 10_000,
    }
  );
}

export async function assertNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
  }));

  expect(
    result.scrollWidth,
    `Document horizontal overflow: ${result.scrollWidth}px > ${result.clientWidth}px`
  ).toBeLessThanOrEqual(result.clientWidth + 1);

  expect(
    result.bodyScrollWidth,
    `Body horizontal overflow: ${result.bodyScrollWidth}px > ${result.bodyClientWidth}px`
  ).toBeLessThanOrEqual(result.bodyClientWidth + 1);
}

export async function assertVisibleButtonsAreNotClipped(page: Page) {
  /*
   * Normalize the document scroll position before doing viewport geometry.
   *
   * APEX contains ordinary document-flow content as well as fixed/sticky
   * interface elements. The scroll position must therefore be normalized
   * before the audit, but ordinary content must not be treated as clipped
   * merely because it is below the current viewport.
   */
  await page.evaluate(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    });

    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>('[data-apex-scroll-container]')
    )) {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    }

    document.documentElement.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
    document.body.scrollTop = 0;
    document.body.scrollLeft = 0;
  });

  /*
   * Allow sticky positioning, transforms, and React layout updates to settle.
   */
  await page.waitForTimeout(150);

  const failures = await page
    .locator('button:visible')
    .evaluateAll((buttons) => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const isInsideViewportAnchoredContainer = (element: HTMLElement) => {
        let current: HTMLElement | null = element.parentElement;

        while (current) {
          const position = getComputedStyle(current).position;

          if (position === 'fixed' || position === 'sticky') {
            return true;
          }

          current = current.parentElement;
        }

        return false;
      };

      return buttons
        .map((button) => {
          const element = button as HTMLElement;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);

          const isViewportAnchored =
            style.position === 'fixed' ||
            style.position === 'sticky' ||
            isInsideViewportAnchoredContainer(element);

          /*
           * A normal document-flow button being below the viewport is not
           * clipping. It is simply content that can be reached by scrolling.
           *
           * For viewport-anchored controls, however, being outside the
           * viewport means the control itself is incorrectly positioned.
           */
          const intersectsViewport =
            rect.right > 0 &&
            rect.left < viewportWidth &&
            rect.bottom > 0 &&
            rect.top < viewportHeight;

          if (!intersectsViewport && !isViewportAnchored) {
            return null;
          }

          const tooSmall =
            rect.width < 28 ||
            rect.height < 28;

          /*
           * Horizontal clipping is always meaningful. A normal flow element
           * extending beyond the viewport can become unreachable because
           * body overflow is hidden, so it must still fail the audit.
           */
          const edgeTolerance = isViewportAnchored ? 6 : 0;

          const horizontallyClipped =
            rect.left < -edgeTolerance ||
            rect.right > viewportWidth + edgeTolerance;

          /*
           * Vertical clipping is only audited for viewport-anchored controls.
           * Normal content is expected to extend below the viewport.
           */
          const verticallyClipped =
            isViewportAnchored &&
            (
              rect.top < -edgeTolerance ||
              rect.bottom > viewportHeight + edgeTolerance
            );

          const clipped =
            tooSmall ||
            horizontallyClipped ||
            verticallyClipped;

          if (!clipped) {
            return null;
          }

          return {
            text: (element.textContent || '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 120),
            aria: element.getAttribute('aria-label'),
            role: element.getAttribute('role'),
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            display: style.display,
            position: style.position,
            viewportWidth,
            viewportHeight,
            viewportAnchored: isViewportAnchored,
          };
        })
        .filter(Boolean);
    });

  expect(
    failures,
    JSON.stringify(failures, null, 2)
  ).toEqual([]);
}