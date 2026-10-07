const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/28P010/AppData/Local/Microsoft/Edge/User Data';
const OWNER = 'Captain-2019', REPO = 'tvbox-sync';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[STEP]', ...a);

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: EDGE, headless: false,
    viewport: { width: 1500, height: 950 },
    args: ['--profile-directory=Default'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.setDefaultTimeout(20000);

  await page.goto(`https://github.com/${OWNER}/${REPO}/settings/pages`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);

  // 用 evaluate 直接操作原生 select，绕开 overlay 的可见性问题
  const branchSet = await page.evaluate(() => {
    // GitHub 新版用自定义下拉，但底层是 <select> 或 button+listbox
    const selects = Array.from(document.querySelectorAll('select'));
    for (const s of selects) {
      const opts = Array.from(s.options).map(o => ({ v: o.value, t: o.textContent.trim() }));
      if (opts.some(o => /main/i.test(o.t))) {
        const target = opts.find(o => /^main$/i.test(o.t));
        s.value = target.v;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return { method: 'native-select', opts, picked: target.t };
      }
    }
    return { method: 'none', selectCount: selects.length };
  });
  console.log('BRANCH ' + JSON.stringify(branchSet));
  await sleep(2500);

  // 若原生 select 不可用，走自定义下拉
  if (branchSet.method === 'none') {
    const noneBtn = page.locator('button:has-text("None")').first();
    if (await noneBtn.count()) {
      await noneBtn.click().catch(e => log('noneBtn click fail:', e.message.slice(0, 60)));
      await sleep(2000);
      const opt = page.locator('[role=option]:has-text("main"), li:has-text("main"), button:has-text("main")').last();
      if (await opt.count()) {
        await opt.click().catch(e => log('opt click fail:', e.message.slice(0, 60)));
        log('已通过自定义下拉选择 main');
      }
      await sleep(2000);
    }
  }

  await page.screenshot({ path: 'shot_branch.png' });

  // 点 Save
  const save = page.locator('button:has-text("Save")').first();
  if (await save.count()) {
    const en = await save.isEnabled().catch(() => false);
    log('Save enabled =', en);
    if (en) { await save.click().catch(e => log('save click fail:', e.message.slice(0, 60))); log('已点 Save'); }
  } else log('未找到 Save');

  await sleep(6000);
  await page.screenshot({ path: 'shot_saved.png' });

  const state = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, ' ');
    const m = t.match(/https?:\/\/[^\s]*github\.io[^\s]*/);
    const idx = t.indexOf('Branch');
    return { hasUrl: !!m, url: m ? m[1] : '', around: t.slice(idx, idx + 260) };
  });
  console.log('PAGES_STATE ' + JSON.stringify(state));
  await ctx.close();
})().catch(e => console.log('ERR ' + e.message));