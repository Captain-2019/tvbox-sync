const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PROFILE = 'C:/Users/28P010/AppData/Local/Microsoft/Edge/User Data';
const OWNER = 'Captain-2019', REPO = 'tvbox-sync';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: EDGE, headless: false,
    viewport: { width: 1500, height: 950 },
    args: ['--profile-directory=Default'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.setDefaultTimeout(40000);

  // ---- Pages 页 ----
  await page.goto(`https://github.com/${OWNER}/${REPO}/settings/pages`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const pagesInfo = await page.evaluate(() => ({
    url: location.href,
    selects: Array.from(document.querySelectorAll('select')).map(s => ({
      id: s.id, name: s.getAttribute('name'),
      opts: Array.from(s.options).map(o => o.text.trim())
    })),
    radios: Array.from(document.querySelectorAll('input[type=radio]')).map(r => ({
      name: r.name, value: r.value, checked: r.checked,
      label: (r.closest('label')?.innerText || '').replace(/\s+/g, ' ').slice(0, 40)
    })),
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim())
      .filter(Boolean).slice(0, 25),
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600),
  }));
  console.log('PAGES_INFO ' + JSON.stringify(pagesInfo, null, 1));
  await page.screenshot({ path: 'shot_pages.png', fullPage: false });

  // ---- Actions 页 ----
  await page.goto(`https://github.com/${OWNER}/${REPO}/actions`, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const actionsInfo = await page.evaluate(() => ({
    url: location.href,
    buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim())
      .filter(Boolean).slice(0, 25),
    hasWorkflowName: document.body.innerText.includes('Update TVBox config'),
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500),
  }));
  console.log('ACTIONS_INFO ' + JSON.stringify(actionsInfo, null, 1));
  await page.screenshot({ path: 'shot_actions.png', fullPage: false });

  await ctx.close();
})().catch(e => console.log('ERR ' + e.message));