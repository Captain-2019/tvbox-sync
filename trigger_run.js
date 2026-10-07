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

  await page.goto(`https://github.com/${OWNER}/${REPO}/actions/workflows/update.yml`,
    { waitUntil: 'domcontentloaded' });
  await sleep(4500);

  // 新版 UI 的 Run workflow 按钮可能是带图标的 split button
  const info = await page.evaluate(() => {
    const bs = Array.from(document.querySelectorAll('button, summary, a'));
    return bs.filter(b => /run workflow/i.test(b.innerText || b.textContent || ''))
      .map(b => ({ tag: b.tagName, id: b.id, cls: (b.className || '').slice(0, 70), txt: (b.innerText || '').trim().slice(0, 30) }));
  });
  console.log('RUN_BTNS ' + JSON.stringify(info));

  // 优先点 id=workflow_dispatch 触发按钮
  let clicked = false;
  const direct = page.locator('#workflow_dispatch button, button[data-testid="workflow-dispatch-button"]');
  if (await direct.count()) { await direct.first().click(); clicked = true; log('点了 workflow_dispatch 按钮'); }

  if (!clicked) {
    const rw = page.locator('button:has-text("Run workflow"), summary:has-text("Run workflow")');
    if (await rw.count()) { await rw.first().click(); clicked = true; log('点了 Run workflow'); }
  }
  if (!clicked) { log('WARN: 未找到触发按钮'); }
  await sleep(2500);

  // 确认面板里的绿色 Run workflow
  const confirmBtn = page.locator('button:has-text("Run workflow")').last();
  if (await confirmBtn.count()) {
    const box = await confirmBtn.boundingBox().catch(() => null);
    if (box) {
      await confirmBtn.click().catch(e => log('confirm fail:', e.message.slice(0, 50)));
      log('已确认触发');
    }
  }
  await sleep(4000);
  await page.screenshot({ path: 'shot_triggered.png' });

  // 检查是否已产生 run
  await page.goto(`https://github.com/${OWNER}/${REPO}/actions`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const runs = await page.evaluate(() => {
    const t = document.body.innerText;
    const has = !/no workflow runs yet/i.test(t);
    const q = t.match(/(\d+)\s+workflow runs?/);
    return { hasRuns: has, count: q ? q[1] : '0', snippet: t.replace(/\s+/g, ' ').slice(t.indexOf('Update TVBox'), t.indexOf('Update TVBox') + 200) };
  });
  console.log('RUNS ' + JSON.stringify(runs));
  console.log('DONE');
  await ctx.close();
})().catch(e => console.log('ERR ' + e.message));