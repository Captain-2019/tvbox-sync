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
  page.setDefaultTimeout(45000);

  // ===== 1. 开启 Pages：选 GitHub Actions =====
  await page.goto(`https://github.com/${OWNER}/${REPO}/settings/pages`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);

  // 新版 UI：先选 Build type，再选部署来源，最后 Save
  // 优先点 "Deploy from a branch" 旁的 radio（GitHub Pages 经典方式，稳妥）
  const branchBtn = page.locator('button:has-text("Deploy from a branch")').first();
  const actionsBtn = page.locator('button:has-text("GitHub Actions")').first();

  if (await branchBtn.count()) {
    await branchBtn.click();
    await sleep(2500);
    log('已选 Build type = Deploy from a branch');
  } else if (await actionsBtn.count()) {
    await actionsBtn.click();
    await sleep(2500);
    log('已选 Build type = GitHub Actions');
  } else {
    log('WARN: 未找到 build type 按钮');
  }

  // 选分支 main
  const branchCtl = page.locator('button:has-text("main")').first();
  if (await branchCtl.count()) {
    await branchCtl.click();
    await sleep(1800);
    const opt = page.locator('li[role=option]:has-text("main"), button:has-text("main")').last();
    if (await opt.count()) await opt.click().catch(() => {});
    log('已选分支 = main');
    await sleep(1200);
  }

  // Save
  const saveBtn = page.locator('button:has-text("Save")').first();
  if (await saveBtn.count()) {
    const enabled = await saveBtn.isEnabled().catch(() => false);
    log('Save 按钮 enabled =', enabled);
    if (enabled) { await saveBtn.click(); log('已点击 Save'); }
  }
  await sleep(5000);

  // 验证
  const pagesState = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, ' ');
    const m = t.match(/(https?:\/\/[^\s]*github\.io[^\s]*)/);
    return { hasGithubIo: !!m, url: m ? m[1] : '', snippet: t.slice(t.indexOf('GitHub Pages'), t.indexOf('GitHub Pages') + 300) };
  });
  console.log('PAGES_STATE ' + JSON.stringify(pagesState));
  await page.screenshot({ path: 'shot_pages2.png' });

  // ===== 2. 触发 workflow 首次运行 =====
  await page.goto(`https://github.com/${OWNER}/${REPO}/actions/workflows/update.yml`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const runBtns = await page.locator('button:has-text("Run workflow")').count();
  log('Run workflow 按钮数 =', runBtns);
  if (runBtns) {
    await page.locator('button:has-text("Run workflow")').first().click();
    await sleep(2500);
    // 下拉面板里再点一次确认
    const confirm = page.locator('button:has-text("Run workflow")').last();
    if (await confirm.count()) {
      await confirm.click();
      log('已触发首次运行');
    }
    await sleep(3000);
  }

  await page.screenshot({ path: 'shot_run.png' });
  console.log('DONE');
  await ctx.close();
})().catch(e => console.log('ERR ' + e.message));