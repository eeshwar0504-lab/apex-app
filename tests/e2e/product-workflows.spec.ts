import { test, expect, type Page } from '@playwright/test';
import { resetApp, completeOnboarding } from './helpers';

async function openRoute(page:Page,query:string,route:string){
  await page.getByRole('button',{name:'Command Center',exact:true}).click();
  const dialog=page.getByRole('dialog');
  const input=dialog.locator('input').first();
  await input.fill(query);
  await input.press('Enter');
  await expect(page.locator(`[data-apex-route="${route}"]`)).toBeVisible();
}

test.describe('APEX product workflows',()=>{
  test.beforeEach(async({page})=>{
    await resetApp(page);
    await completeOnboarding(page);
  });

  test('Plan Studio edits a future workout and increments its version',async({page})=>{
    await openRoute(page,'Open my plan','plan');
    const version=page.locator('.plan-header .version');
    const before=await version.textContent();
    const day=page.locator('.day-card').filter({hasText:/\d+ exercises/}).first();
    await expect(day).toBeVisible();
    await day.click();

    const editor=page.locator('.plan-editor').filter({has:page.getByPlaceholder('Add exercise…')});
    const exercises=editor.locator('.editor-exercise');
    const beforeCount=await exercises.count();
    expect(beforeCount).toBeGreaterThan(0);
    await exercises.first().getByRole('button',{name:'Remove'}).click();
    // removing an exercise asks first (Phase 4 confirmation flow)
    await page.getByRole('dialog',{name:'Remove this exercise?'}).getByRole('button',{name:'Remove',exact:true}).click();
    await expect(exercises).toHaveCount(beforeCount-1);
    await editor.getByRole('button',{name:'Done'}).click();
    await expect(version).not.toHaveText(before||'');
  });

  test('Templates save and launch a reusable workout',async({page})=>{
    await openRoute(page,'Open templates','templates');
    await page.getByLabel('Template name').fill('Validation template');
    await page.locator('.picker-list .picker-row').first().click();
    await page.getByRole('button',{name:'Save template',exact:true}).click();

    const row=page.locator('.template-row').filter({hasText:'Validation template'});
    await expect(row).toBeVisible();
    await row.getByRole('button').first().click();
    await expect(page.locator('[data-apex-route^="brief:"]')).toBeVisible();
  });

  test('Exercise Library searches and opens canonical detail',async({page})=>{
    await openRoute(page,'Find chest press exercises','library');
    await page.getByPlaceholder('Chest press, row, squat…').fill('Machine Chest Press');
    const exercise=page.locator('.exercise-tile').first();
    await expect(exercise).toContainText('Machine Chest Press');
    await exercise.click();

    const detail=page.getByRole('dialog');
    await expect(detail).toBeVisible();
    await expect(detail.getByText('SETUP',{exact:true})).toBeVisible();
    await expect(detail.getByText('TECHNIQUE',{exact:true})).toBeVisible();
    await expect(detail.getByText('Stay safe',{exact:true})).toBeVisible();
    await expect(detail.getByRole('button',{name:'Use in training'})).toBeVisible();
  });

  test('Goals create and display an explicit numeric target',async({page})=>{
    await openRoute(page,'Open goals','goals');
    await page.getByRole('button',{name:/Add goal/}).click();
    await page.getByLabel('Goal title').fill('Validation strength goal');
    await page.getByLabel('Target label').fill('Bench press');
    await page.getByLabel('Target value').fill('80');
    await page.getByRole('button',{name:'Create goal',exact:true}).click();
    await expect(page.locator('.goal-card').filter({hasText:'Validation strength goal'})).toContainText('80 kg');
  });

  test('notification preference updates the prepared intent preview',async({page})=>{
    await page.getByRole('button',{name:'You',exact:true}).click();
    const enabled=page.getByRole('checkbox',{name:'Notifications enabled',exact:true});
    await expect(enabled).toBeChecked();
    // the prepared-intent preview is part of the Standard view
    await page.getByRole('radiogroup',{name:'Workout experience'}).getByRole('radio',{name:/Standard/}).click();
    await enabled.uncheck();
    await expect(page.getByText('No reminder is needed right now.',{exact:true})).toBeVisible();
    await enabled.check();
    await expect(enabled).toBeChecked();
  });
});