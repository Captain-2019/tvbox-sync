const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/28P010/AppData/Local/Microsoft/Edge/User Data';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: EDGE,
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--profile-directory=Default'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://github.com/settings/profile', { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  const nameVal = await page
    .locator('input#user_name, input[name="user[name]"]')
    .first()
    .inputValue()
    .catch(() => '');

  // 个人主页链接：形如 https://github.com/<username>
  const hrefs = await page.locator('a[href]').evaluateAll(
    els => els.map(e => e.getAttribute('href'))
  );
  let profLink = '';
  for (const h of hrefs) {
    if (!h) continue;
    const m = h.match(/^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]*)$/);
    if (m) { profLink = h; break; }
  }

  // 侧边栏"你的个人资料"块里的用户名
  let sidebarUser = '';
  try {
    sidebarUser = await page
      .locator('a[data-hovercard-type="user"]')
      .first()
      .getAttribute('href');
  } catch (e) {}

  console.log('WHOAMI ' + JSON.stringify({
    nameVal,
    profLink,
    sidebarUser,
    url: page.url(),
    title: await page.title(),
  }));
  await ctx.close();
})().catch(e => console.log('WHOAMI ' + JSON.stringify({ error: e.message })));