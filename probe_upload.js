const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/28P010/AppData/Local/Microsoft/Edge/User Data';
const LOCAL = 'D:/工作/workbudy/2026-10-07-08-43-46/tvbox-sync';
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: EDGE, headless: false,
    viewport: { width: 1500, height: 950 },
    args: ['--profile-directory=Default'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.setDefaultTimeout(45000);

  // 从页面内拿 CSRF token
  await page.goto('https://github.com/Captain-2019/tvbox-sync', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const csrf = await page.evaluate(() => {
    const m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  });
  console.log('CSRF:', csrf ? 'OK' : 'MISSING');

  const results = [];
  for (const [rel, repoPath] of FILES) {
    const abs = path.join(LOCAL, rel);
    const content = fs.readFileSync(abs);          // Buffer -> base64
    const b64 = content.toString('base64');
    const payload = {
      message: `add ${repoPath}`,
      content: b64,
      branch: 'main',
    };
    const res = await page.evaluate(async ({ payload }) => {
      const r = await fetch('/Captain-2019/tvbox-sync/git/trees/main', { method: 'GET' });
      return { status: r.status, body: (await r.text()).slice(0, 200) };
    }, { payload });
    results.push({ repoPath, probe: res.status });
  }

  console.log('PROBE_RESULT ' + JSON.stringify(results[0]));
  console.log('CSRF_OK');
  await ctx.close();
})().catch(e => console.log('ERR ' + e.message));