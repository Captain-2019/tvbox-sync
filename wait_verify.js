const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/28P010/AppData/Local/Microsoft/Edge/User Data';
const OWNER = 'Captain-2019', REPO = 'tvbox-sync';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[WAIT]', ...a);

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: EDGE, headless: false,
    viewport: { width: 1500, height: 950 },
    args: ['--profile-directory=Default'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.setDefaultTimeout(30000);

  for (let i = 0; i < 20; i++) {
    await page.goto(`https://github.com/${OWNER}/${REPO}/actions/workflows/update.yml`,
      { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    const st = await page.evaluate(() => {
      const t = document.body.innerText.replace(/\s+/g, ' ');
      const completed = /completed successfully/i.test(t);
      const failed = /failure/i.test(t);
      const inProgress = /in progress/i.test(t);
      const m = t.match(/(Update TVBox config[^A-Z]{0,60})/);
      return { completed, failed, inProgress, snippet: m ? m[1] : t.slice(0, 160) };
    });
    log(`轮询 ${i + 1}:`, JSON.stringify(st));
    if (st.completed || st.failed) { log('执行结束'); break; }
    await sleep(12000);
  }

  await page.screenshot({ path: 'shot_final.png' });

  // 验证 Pages 产物
  const PAGES = `https://${OWNER.toLowerCase()}.github.io/${REPO}/tvbox.json`;
  log('访问:', PAGES);
  try {
    const resp = await page.goto(PAGES, { waitUntil: 'domcontentloaded', timeout: 45000 });
    log('HTTP 状态:', resp.status());
    const body = await page.evaluate(() => document.body.innerText.slice(0, 300));
    log('响应片段:', body.replace(/\s+/g, ' ').slice(0, 220));
  } catch (e) {
    log('Pages 访问失败:', e.message.slice(0, 100));
  }
  console.log('DONE');
  await ctx.close();
})().catch(e => console.log('ERR ' + e.message));