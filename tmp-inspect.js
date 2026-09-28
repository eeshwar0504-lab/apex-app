const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:5175');
  await page.waitForTimeout(1000);
  const click = async (pattern, exact) => {
    const selector = exact ? page.getByRole('button', { name: pattern }) : page.getByRole('button', { name: pattern });
    await selector.waitFor({ timeout: 20000 });
    await selector.click();
  };
  await page.getByRole('button', { name: /^Continue/i }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /^Continue/i }).click();
  await page.getByRole('button', { name: 'Beginner' }).click();
  await page.getByRole('button', { name: /^Continue/i }).click();
  await page.getByRole('button', { name: /Build muscle/i }).click();
  await page.getByRole('button', { name: /^Continue/i }).click();
  await page.getByRole('button', { name: /4 days \/ week/i }).click();
  await page.getByRole('button', { name: /60 minutes/i }).click();
  await page.getByRole('button', { name: /^Continue/i }).click();
  for (const eq of ['Machine', 'Cable', 'Dumbbell', 'Barbell', 'Bench', 'Bodyweight']) {
    const btn = page.getByRole('button', { name: new RegExp('^' + eq, 'i') });
    await btn.waitFor({ timeout: 20000 });
    await btn.click();
  }
  await page.getByRole('button', { name: /Build my APEX plan/i }).click();
  await page.waitForSelector('[data-apex-route="home"]', { timeout: 20000 });
  const info = await page.evaluate(() => {
    const collect = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return { missing: true, selector };
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      let parent = el.parentElement;
      const chain = [];
      while (parent && chain.length < 6) {
        const ps = getComputedStyle(parent);
        chain.push({
          tag: parent.tagName,
          position: ps.position,
          top: ps.top,
          overflow: ps.overflow,
          overflowY: ps.overflowY,
          transform: ps.transform,
          zIndex: ps.zIndex,
        });
        parent = parent.parentElement;
      }
      return {
        selector,
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        styles: {
          position: s.position,
          top: s.top,
          marginTop: s.marginTop,
          transform: s.transform,
          overflow: s.overflow,
          overflowY: s.overflowY,
          zIndex: s.zIndex,
        },
        parentChain: chain,
      };
    };
    return {
      html: collect('html'),
      body: collect('body'),
      app: collect('.app'),
      topbar: collect('.topbar'),
      brand: collect('.brand'),
      command: collect('.icon-btn.command-trigger'),
      main: collect('.main'),
      screen: collect('[data-apex-route="home"]'),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
