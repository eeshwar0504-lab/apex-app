import { test, expect, type Page } from '@playwright/test';
import { resetApp, completeOnboarding } from './helpers';

async function openTrainRoute(page: Page) {
  const trainButton = page.getByRole('button', {
    name: 'Train',
    exact: true,
  });

  await expect(trainButton).toBeVisible({
    timeout: 10_000,
  });

  await trainButton.click();

  await expect(
    page.locator('[data-apex-route="train"]')
  ).toBeVisible({
    timeout: 10_000,
  });

  await expect(
    page.getByText('What happens next.')
  ).toBeVisible({
    timeout: 10_000,
  });
}

async function openScheduledSession(page: Page) {
  await openTrainRoute(page);

  /*
   * APEX may expose the current session as:
   *   Start session
   * or the next scheduled session as:
   *   Preview next
   *
   * Prefer the primary command button, but fall back to the queue
   * when the responsive layout presents the session through its row.
   */
  const primaryStart = page.getByRole('button', {
    name: /Start session|Preview next/i,
  });

  if (
    await primaryStart.first().isVisible().catch(() => false)
  ) {
    await expect(primaryStart.first()).toBeEnabled();
    await primaryStart.first().click();
  } else {
    const queueSession = page
      .locator('.apex-queue-list .apex-queue-card')
      .filter({
        has: page.getByRole('button'),
      })
      .first();

    await expect(queueSession).toBeVisible({
      timeout: 10_000,
    });

    const queueButton = queueSession.getByRole('button').first();

    await expect(queueButton).toBeVisible();
    await expect(queueButton).toBeEnabled();

    await queueButton.click();
  }

  await expect(
    page.locator('[data-apex-route^="brief:"]')
  ).toBeVisible({
    timeout: 10_000,
  });

  await expect(
    page.getByText('LOAD GUIDANCE')
  ).toBeVisible({
    timeout: 10_000,
  });
}

async function confirmAllRequiredEquipment(page: Page) {
  /*
   * PreWorkout exposes one block per equipment category.
   *
   * The execution-path tests need an executable session, so:
   * - confirm available equipment
   * - if the UI currently exposes "Mark available", use the
   *   application's own control to restore the executable path
   *
   * The separate equipment-gating test still verifies the
   * unavailable branch independently.
   */

  const unavailableMessage = page.getByText(
    /Equipment unavailable/i
  ).first();

  if (
    await unavailableMessage.isVisible().catch(() => false)
  ) {
    const markAvailable = page.getByRole('button', {
      name: /Mark available/i,
    });

    const count = await markAvailable.count();

    for (let i = 0; i < count; i += 1) {
      const button = markAvailable.nth(i);

      if (
        await button.isVisible().catch(() => false) &&
        await button.isEnabled().catch(() => false)
      ) {
        await button.click();
        await page.waitForTimeout(100);
      }
    }
  }

  /*
   * React re-renders the equipment list after every confirmation,
   * so query the current DOM on every pass rather than retaining
   * stale locators.
   */
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const confirmButtons = page.getByRole('button', {
      name: 'Confirm available',
    });

    const count = await confirmButtons.count();

    let clicked = false;

    for (let i = 0; i < count; i += 1) {
      const button = confirmButtons.nth(i);

      if (
        await button.isVisible().catch(() => false) &&
        await button.isEnabled().catch(() => false)
      ) {
        await button.click();
        clicked = true;
        break;
      }
    }

    if (clicked) {
      await page.waitForTimeout(100);
      continue;
    }

    break;
  }

  /*
   * If an unavailable state is still exposed, use APEX's own
   * restoration control instead of mutating application state
   * from the test.
   */
  const markAvailable = page.getByRole('button', {
    name: /Mark available/i,
  });

  const markCount = await markAvailable.count();

  for (let i = 0; i < markCount; i += 1) {
    const button = markAvailable.nth(i);

    if (
      await button.isVisible().catch(() => false) &&
      await button.isEnabled().catch(() => false)
    ) {
      await button.click();
      await page.waitForTimeout(100);
    }
  }

  await page.waitForTimeout(150);
}

async function enterGuidedWorkout(page: Page) {
  await openScheduledSession(page);

  await confirmAllRequiredEquipment(page);

  const startTraining = page.getByRole('button', {
    name: /Session ready · Start training/i,
  });

  if (
    await startTraining.isVisible().catch(() => false)
  ) {
    await expect(startTraining).toBeEnabled();
    await startTraining.click();
  } else {
    const confirmEquipment = page.getByRole('button', {
      name: /Confirm equipment to continue/i,
    });

    if (
      await confirmEquipment.isVisible().catch(() => false)
    ) {
      await expect(confirmEquipment).toBeEnabled();
      await confirmEquipment.click();
    }
  }

  await expect(
    page.locator('[data-apex-route="workout"]')
  ).toBeVisible({
    timeout: 10_000,
  });
}

async function reachActiveSet(page: Page) {
  /*
   * APEX's guided flow is deliberately sequential:
   *
   *   equipment
   *       ↓
   *     ready
   *       ↓ START SET
   *   set_ready
   *       ↓ START SET
   *   set_active
   *
   * Therefore seeing START SET does NOT by itself mean that the
   * active-set logger has been reached. We keep driving the
   * explicit transition until the real active-set control appears.
   */
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const completeSet = page.getByRole('button', {
      name: 'Complete set',
    });

    if (
      await completeSet.first().isVisible().catch(() => false)
    ) {
      await expect(completeSet.first()).toBeEnabled();
      return;
    }

    /*
     * Guided equipment phase.
     */
    const equipmentButtons = page.getByRole('button', {
      name: 'Confirm available',
    });

    const equipmentCount = await equipmentButtons.count();

    let equipmentClicked = false;

    for (let i = 0; i < equipmentCount; i += 1) {
      const button = equipmentButtons.nth(i);

      if (
        await button.isVisible().catch(() => false) &&
        await button.isEnabled().catch(() => false)
      ) {
        await button.click();
        equipmentClicked = true;
        break;
      }
    }

    if (equipmentClicked) {
      await page.waitForTimeout(150);
      continue;
    }

    /*
     * Guided equipment transition.
     */
    const continueButton = page.getByRole('button', {
      name: /^Continue/i,
    });

    if (
      await continueButton.last().isVisible().catch(() => false) &&
      await continueButton.last().isEnabled().catch(() => false)
    ) {
      await continueButton.last().click();
      await page.waitForTimeout(150);
      continue;
    }

    /*
     * Explicit pre-workout transition if a responsive state exposes
     * it here instead of immediately entering the focused card.
     */
    const startTraining = page.getByRole('button', {
      name: /Session ready · Start training/i,
    });

    if (
      await startTraining.isVisible().catch(() => false) &&
      await startTraining.isEnabled().catch(() => false)
    ) {
      await startTraining.click();
      await page.waitForTimeout(150);
      continue;
    }

    /*
     * IMPORTANT:
     *
     * START SET appears in both:
     *
     *   READY
     *   SET READY
     *
     * The first click advances READY → SET READY.
     * The second click advances SET READY → SET ACTIVE.
     *
     * Keep looping rather than returning after the first button.
     */
    const startSet = page.getByRole('button', {
      name: /START SET/i,
    });

    if (
      await startSet.first().isVisible().catch(() => false)
    ) {
      await expect(startSet.first()).toBeEnabled();
      await startSet.first().click();
      await page.waitForTimeout(200);
      continue;
    }

    await page.waitForTimeout(150);
  }

  throw new Error(
    'APEX did not reach the active-set logger within 20 seconds.'
  );
}

async function enterActiveSet(page: Page) {
  await enterGuidedWorkout(page);

  await reachActiveSet(page);

  /*
   * The active-set logger is now proven by its actual functional
   * completion control.
   */
  const completeSet = page.getByRole('button', {
    name: 'Complete set',
  });

  await expect(completeSet).toBeVisible({
    timeout: 10_000,
  });

  await expect(completeSet).toBeEnabled();
}

test.describe('APEX training execution', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await completeOnboarding(page);
  });

  test('opens the scheduled session and exposes a real start control', async ({ page }) => {
    await openTrainRoute(page);

    const start = page.getByRole('button', {
      name: /Start session|Preview next/i,
    });

    if (
      await start.first().isVisible().catch(() => false)
    ) {
      await expect(start.first()).toBeEnabled();
      await start.first().click();
    } else {
      const queueSession = page
        .locator('.apex-queue-list .apex-queue-card')
        .first();

      await expect(queueSession).toBeVisible({
        timeout: 10_000,
      });

      const queueButton = queueSession
        .getByRole('button')
        .first();

      await expect(queueButton).toBeEnabled();
      await queueButton.click();
    }

    await expect(
      page.locator('[data-apex-route^="brief:"]')
    ).toBeVisible({
      timeout: 10_000,
    });

    await expect(
      page.getByText('LOAD GUIDANCE')
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test('equipment confirmation gates training start', async ({ page }) => {
    await openScheduledSession(page);

    const confirmButtons = page.getByRole('button', {
      name: 'Confirm available',
    });

    const unavailableButtons = page.getByRole('button', {
      name: 'Not available',
    });

    const confirmCount = await confirmButtons.count();
    const unavailableCount = await unavailableButtons.count();
    const requirementLabels = await page.locator('.equipment-check-block .equipment-check-main .eyebrow').allTextContents();

    expect(
      confirmCount + unavailableCount
    ).toBeGreaterThan(0);
    expect(requirementLabels).toContain('Machine Chest Press');
    expect(new Set(requirementLabels).size).toBeGreaterThan(1);

    /*
     * Verify that APEX exposes the actual equipment decision surface.
     */
    if (confirmCount > 0) {
      await expect(
        confirmButtons.first()
      ).toBeVisible();
    }

    if (unavailableCount > 0) {
      await expect(
        unavailableButtons.first()
      ).toBeVisible();

      await unavailableButtons.first().click();

      await expect(
        page.getByText(/Equipment unavailable/i).first()
      ).toBeVisible();

      await expect(
        page.getByText(/APEX found alternatives/i).first()
      ).toBeVisible();

      /*
       * Restore the session to an executable state so the test
       * does not leave a partially mutated workout behind.
       */
      const markAvailable = page.getByRole('button', {
        name: /Mark available/i,
      });

      if (
        await markAvailable.first().isVisible().catch(() => false)
      ) {
        await markAvailable.first().click();
      }
    }
  });

  test('active set logger exposes load/reps/RIR controls without clipping', async ({ page }) => {
    await enterActiveSet(page);

    /*
     * These are the real focused-set controls rendered by SetEditor.
     */
    await expect(
      page.getByRole('button', {
        name: 'Decrease reps',
      })
    ).toBeVisible();

    await expect(
      page.getByRole('button', {
        name: 'Increase reps',
      })
    ).toBeVisible();

    await expect(
      page.getByRole('button', {
        name: 'Decrease RIR',
      })
    ).toBeVisible();

    await expect(
      page.getByRole('button', {
        name: 'Increase RIR',
      })
    ).toBeVisible();

    await expect(
      page.getByRole('button', {
        name: 'Complete set',
      })
    ).toBeVisible();

    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));

    expect(
      overflow.width
    ).toBeLessThanOrEqual(
      overflow.viewport + 1
    );
  });

  test('pause and resume controls remain reachable during an active session', async ({ page }) => {
    await enterActiveSet(page);

    /*
     * APEX exposes the toolbar control with an explicit accessible
     * name that changes with the persisted pause state.
     */
    const pause = page.getByRole('button', {
      name: 'Pause workout',
    });

    await expect(pause).toBeVisible({
      timeout: 10_000,
    });

    await expect(pause).toBeEnabled();

    await pause.click();

    const resume = page.getByRole('button', {
      name: 'Resume workout',
    });

    await expect(resume).toBeVisible({
      timeout: 10_000,
    });

    await expect(resume).toBeEnabled();
  });

  test('set actions request haptics when the preference is enabled', async ({ page }) => {
    await page.evaluate(() => {
      const target=window as typeof window & {__apexVibrations:Array<number|number[]>};
      target.__apexVibrations=[];
      Object.defineProperty(navigator,'vibrate',{
        configurable:true,
        value:(pattern:number|number[])=>{
          target.__apexVibrations.push(pattern);
          return true;
        }
      });
    });

    await enterActiveSet(page);

    const vibrations=await page.evaluate(()=>
      (window as typeof window & {__apexVibrations:Array<number|number[]>}).__apexVibrations
    );
    expect(vibrations.length).toBeGreaterThan(0);
  });

  test('disabling haptics suppresses set-action vibration', async ({ page }) => {
    await page.evaluate(() => {
      const target=window as typeof window & {__apexVibrations:Array<number|number[]>};
      target.__apexVibrations=[];
      Object.defineProperty(navigator,'vibrate',{
        configurable:true,
        value:(pattern:number|number[])=>{
          target.__apexVibrations.push(pattern);
          return true;
        }
      });
    });

    await page.getByRole('button',{name:'You',exact:true}).click();
    await page.getByRole('checkbox',{name:'Haptics',exact:true}).uncheck();
    await enterActiveSet(page);

    const vibrations=await page.evaluate(()=>
      (window as typeof window & {__apexVibrations:Array<number|number[]>}).__apexVibrations
    );
    expect(vibrations).toEqual([]);
  });

  test('paused active workout restores after browser reload', async ({ page }) => {
    await enterActiveSet(page);
    await page.getByRole('button',{name:'Pause workout'}).click();
    await expect(page.getByRole('button',{name:'Resume workout'})).toBeVisible();

    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('[data-apex-route="workout"]')).toBeVisible({timeout:15000});
    await expect(page.getByRole('button',{name:'Resume workout'})).toBeVisible();

    await page.getByRole('button',{name:'Resume workout'}).click();
    await expect(page.getByRole('button',{name:'Pause workout'})).toBeVisible();
  });

  test('scheduled workout flows through logging rest and completion', async ({ page }) => {
    test.setTimeout(120_000);
    await enterActiveSet(page);

    for(let step=0;step<120;step++){
      if(await page.locator('[data-apex-route^="session:"]').isVisible().catch(()=>false))break;

      const complete=page.getByRole('button',{name:'Complete set'}).first();
      if(await complete.isVisible().catch(()=>false)){
        await complete.click();
        continue;
      }

      const feedback=page.getByRole('button',{name:/^ABOUT RIGHT\b/});
      if(await feedback.isVisible().catch(()=>false)){
        await feedback.click();
        continue;
      }

      const skipRest=page.getByRole('button',{name:'SKIP REST',exact:true});
      if(await skipRest.isVisible().catch(()=>false)){
        await skipRest.click();
        continue;
      }

      const startSet=page.getByRole('button',{name:/START SET/i}).first();
      if(await startSet.isVisible().catch(()=>false)){
        await startSet.click();
        continue;
      }

      const review=page.getByRole('button',{name:'REVIEW SESSION',exact:true});
      if(await review.isVisible().catch(()=>false)){
        await review.click();
        continue;
      }

      const finish=page.getByRole('button',{name:'FINISH SESSION',exact:true});
      if(await finish.isVisible().catch(()=>false)){
        await finish.click();
        continue;
      }

      const advance=page.getByRole('button',{name:/^CONTINUE/i}).first();
      if(await advance.isVisible().catch(()=>false)){
        await advance.click();
        continue;
      }

      await page.waitForTimeout(50);
    }

    await expect(page.locator('[data-apex-route^="session:"]')).toBeVisible();
    await expect(page.locator('.session-review-metrics')).toBeVisible();
    await expect(page.getByText('SESSION COMPLETE',{exact:true}).first()).toBeVisible();

    await page.getByRole('button',{name:'Command Center',exact:true}).click();
    let dialog=page.getByRole('dialog');
    let input=dialog.locator('input').first();
    await input.fill('Open history');
    await input.press('Enter');
    await expect(page.locator('.history-item').first()).toContainText('completed');

    await page.getByRole('button',{name:'Command Center',exact:true}).click();
    dialog=page.getByRole('dialog');
    input=dialog.locator('input').first();
    await input.fill('Show my progress');
    await input.press('Enter');
    await expect(page.locator('.apex-stat-board article').first()).toContainText('1');
  });
});