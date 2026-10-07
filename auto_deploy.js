/**
 * TVBox 仓库一键自动化（在你关闭 Edge 后运行）
 * 复用 Edge 的 Default profile 登录态，完成：
 *   1. 创建 Public 仓库 Captain-2019/tvbox-sync
 *   2. 上传全部文件（走 GitHub Web UI，无需 git push 认证）
 *   3. 开启 Pages（Source = GitHub Actions）
 *   4. 触发首次 workflow 运行
 *   5. 等待完成并验证 Pages 产物
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/28P010/AppData/Local/Microsoft/Edge/User Data';
const REPO = 'tvbox-sync';
const OWNER = 'Captain-2019';
const LOCAL = 'D:/工作/workbudy/2026-10-07-08-43-46/tvbox-sync';

// 需要上传的文件（相对路径 -> 仓库路径）
const FILES = [
  ['sources.json', 'sources.json'],
  ['tvbox_sync.py', 'tvbox_sync.py'],
  ['gen_status_page.py', 'gen_status_page.py'],
  ['start.sh', 'start.sh'],
  ['README.md', 'README.md'],
  ['CLOUD_DEPLOY.md', 'CLOUD_DEPLOY.md'],
  ['DEPLOY_FOR_CAPTAIN.md', 'DEPLOY_FOR_CAPTAIN.md'],
  ['.gitignore', '.gitignore'],
  ['.gitattributes', '.gitattributes'],
  ['.github/workflows/update.yml', '.github/workflows/update.yml'],
  ['out/tvbox.json', 'out/tvbox.json'],
  ['out/live.json', 'out/live.json'],
  ['out/status.json', 'out/status.json'],
  ['out/status.html', 'out/status.html'],
];

const log = (...a) => console.log('[AUTO]', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: EDGE,
    headless: false,
    viewport: { width: 1500, height: 950 },
    args: ['--profile-directory=Default', '--start-maximized'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.setDefaultTimeout(60000);

  // ---------- 校验登录态 ----------
  await page.goto(`https://github.com/${OWNER}`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const loggedIn = await page.locator('button[aria-label="Open user navigation menu"]').count() > 0
    || !page.url().includes('/login');
  if (!loggedIn) {
    console.log('RESULT: NOT_LOGGED_IN');
    await ctx.close();
    return;
  }
  log('登录态正常:', page.url());

  // ---------- 1. 建仓库 ----------
  await page.goto(`https://github.com/new?name=${REPO}&description=TVBox%20source%20auto-sync&public=1`,
    { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  const repoExists = await page.locator('text=/already exists/i').count() > 0
    || page.url().includes('existing_name');
  if (repoExists) {
    log('仓库已存在，跳过创建');
  } else {
    // 确保 Public
    const publicRadio = page.locator('input[name="visibility"][value="public"]');
    if (await publicRadio.count()) await publicRadio.check().catch(() => {});
    const createBtn = page.locator('button:has-text("Create repository")').last();
    await createBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await sleep(2500);
    log('创建仓库完成:', page.url());
  }

  // 确认仓库页
  if (!page.url().includes(`/${OWNER}/${REPO}`)) {
    await page.goto(`https://github.com/${OWNER}/${REPO}`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
  }
  log('仓库地址:', page.url());

  // ---------- 2. 上传文件 ----------
  await page.goto(`https://github.com/${OWNER}/${REPO}/upload/main`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  // 先建子目录 out/ 和 .github/workflows/（GitHub 上传不支持带路径，需分批）
  // 第一批：根目录文件
  const rootFiles = FILES.filter(f => !f[1].includes('/'));
  const rootAbs = rootFiles.map(f => path.join(LOCAL, f[0]));
  log('上传根目录文件:', rootFiles.length);

  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(rootAbs);
  await sleep(3000);

  let commitBtn = page.locator('button:has-text("Commit changes")').last();
  if (await commitBtn.count() && await commitBtn.isEnabled()) {
    await commitBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await sleep(3000);
    log('根目录文件提交完成');
  }

  // 第二批：.github/workflows/update.yml（GitHub 支持斜杠路径，直接传完整相对路径）
  await page.goto(`https://github.com/${OWNER}/${REPO}/upload/main`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  const wfInput = page.locator('input[type="file"]').first();
  await wfInput.setInputFiles([path.join(LOCAL, '.github/workflows/update.yml')]);
  await sleep(2500);
  commitBtn = page.locator('button:has-text("Commit changes")').last();
  if (await commitBtn.count()) {
    await commitBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await sleep(3000);
    log('工作流文件提交完成');
  }

  // 第三批：out/ 目录文件（GitHub 拖拽区支持路径前缀）
  await page.goto(`https://github.com/${OWNER}/${REPO}/upload/main/out`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  const outFiles = FILES.filter(f => f[1].startsWith('out/')).map(f => path.join(LOCAL, f[0]));
  const outInput = page.locator('input[type="file"]').first();
  if (await outInput.count()) {
    await outInput.setInputFiles(outFiles);
    await sleep(2500);
    commitBtn = page.locator('button:has-text("Commit changes")').last();
    if (await commitBtn.count()) {
      await commitBtn.click();
      await page.waitForLoadState('domcontentloaded');
      await sleep(3000);
      log('out/ 文件提交完成');
    }
  }

  // ---------- 3. 开启 Pages ----------
  await page.goto(`https://github.com/${OWNER}/${REPO}/settings/pages`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const sel = page.locator('select').first();
  if (await sel.count()) {
    await sel.selectOption({ label: 'GitHub Actions' }).catch(async () => {
      await sel.selectOption('github_actions').catch(() => {});
    });
    await sleep(1500);
    const saveBtn = page.locator('button:has-text("Save")').first();
    if (await saveBtn.count()) {
      await saveBtn.click();
      await sleep(3000);
      log('Pages 已开启 (Source=GitHub Actions)');
    }
  } else {
    log('WARN: 未找到 Pages 来源下拉框，需手动设置');
  }

  // ---------- 4. 触发首次运行 ----------
  await page.goto(`https://github.com/${OWNER}/${REPO}/actions/workflows/update.yml`,
    { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const runBtn = page.locator('button:has-text("Run workflow")').first();
  if (await runBtn.count()) {
    await runBtn.click();
    await sleep(1500);
    const confirm = page.locator('button:has-text("Run workflow")').last();
    if (await confirm.count()) { await confirm.click(); }
    log('已触发首次运行');
  } else {
    log('WARN: 未找到 Run workflow 按钮');
  }

  // ---------- 5. 等待并验证 ----------
  log('等待 workflow 执行（最多 4 分钟）...');
  for (let i = 0; i < 24; i++) {
    await sleep(10000);
    await page.goto(`https://github.com/${OWNER}/${REPO}/actions`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    const status = await page.evaluate(() => document.body.innerText);
    if (/completed successfully|success/i.test(status)) { log('workflow 执行成功'); break; }
    if (/failure|failed/i.test(status) && !/0 failures/.test(status)) { log('workflow 失败，请查看日志'); break; }
    if (i === 23) log('等待超时，仍在检查');
  }

  // 验证 Pages 产物
  const PAGES = `https://${OWNER.toLowerCase()}.github.io/${REPO}/tvbox.json`;
  log('验证 Pages:', PAGES);
  await sleep(5000);
  const ok = await page.goto(PAGES, { waitUntil: 'domcontentloaded' }).then(r => r.status()).catch(() => 0);
  log('Pages HTTP 状态:', ok, ok === 200 ? '(可用)' : '(可能还在构建)');

  console.log('RESULT: DONE');
  console.log('PAGES_URL:', PAGES);
  await ctx.close();
})().catch(e => {
  console.error('ERR', e.message);
  console.log('RESULT: ERROR -', e.message);
  process.exit(1);
});