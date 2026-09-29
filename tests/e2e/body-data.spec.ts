import { test, expect } from '@playwright/test';
import { resetApp, completeOnboarding, assertNoHorizontalOverflow } from './helpers';

function dateAt(offset:number){
  const date=new Date();
  date.setDate(date.getDate()+offset);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

test('Body data records dated weights and plots daily history',async({page})=>{
  await resetApp(page);
  await completeOnboarding(page);
  await page.getByRole('button',{name:'Command Center',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.locator('input').first().fill('Open measurements');
  await dialog.locator('input').first().press('Enter');
  await expect(page.locator('[data-apex-route="measurements"]')).toBeVisible();

  await page.getByLabel('Measurement date').fill(dateAt(-2));
  await page.getByLabel('Weight (kg)').fill('80.2');
  await page.getByRole('button',{name:'Save measurements for selected date'}).click();
  await expect(page.locator('.weight-trend-day.has-weight')).toHaveCount(1);

  await page.context().setOffline(true);
  await page.getByLabel('Measurement date').fill(dateAt(-1));
  await expect(page.getByLabel('Weight (kg)')).toHaveValue('');
  await page.getByLabel('Weight (kg)').fill('79.8');
  await page.getByRole('button',{name:'Save measurements for selected date'}).click();

  await expect(page.locator('.weight-trend-day.has-weight')).toHaveCount(2);
  await expect(page.getByText('-0.4 kg',{exact:true})).toBeVisible();
  await expect(page.locator('.weight-trend-chart')).toHaveAttribute('aria-label',/80.2 kilograms.*79.8 kilograms/);

  await page.getByLabel('Measurement date').fill(dateAt(-3));
  await page.getByLabel('Weight (kg)').fill('85');
  await page.getByRole('button',{name:'Save measurements for selected date'}).click();
  await expect(page.locator('.weight-trend-day.has-weight')).toHaveCount(3);
  const profileWeight=await page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('apex-state-v4')||'null');
    return state?.profile?.body?.weightKg;
  });
  expect(profileWeight).toBe(79.8);

  for(const [period,count] of [['7D',7],['30D',30],['3M',90],['1Y',365]] as const){
    const rangeButton=page.getByRole('button',{name:`Show ${period} weight trend`});
    await rangeButton.click();
    await expect(rangeButton).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.weight-trend-day')).toHaveCount(count);
  }
  await page.getByRole('button',{name:'Show All weight trend'}).click();
  const allWeightDates=await page.locator('.weight-trend-day.has-weight').evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).title.slice(0,10)).sort());
  const dateLimit=await page.getByLabel('Measurement date').getAttribute('max');
  const ordinal=(value:string)=>{const[y,m,d]=value.split('-').map(Number);return Date.UTC(y,m-1,d)/86400000};
  const expectedAllDays=ordinal(dateLimit!)-ordinal(allWeightDates[0])+1;
  await expect(page.locator('.weight-trend-day')).toHaveCount(expectedAllDays);

  await page.getByRole('button',{name:'Progress',exact:true}).click();
  await expect(page.locator('.apex-body-shortcut')).toContainText(/79\.8\s*kg/);
  await page.getByRole('button',{name:/Open Body \/ Weight/}).click();
  await expect(page.locator('[data-apex-route="measurements"]')).toBeVisible();

  await page.setViewportSize({width:360,height:800});
  await assertNoHorizontalOverflow(page);
});