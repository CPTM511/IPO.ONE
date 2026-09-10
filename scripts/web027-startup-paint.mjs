// Actual deployed first-paint observation. No API, HTML, clock or asset mocks.
import {chromium, expect} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.WEB027_PAINT_ORIGIN || 'https://ipo.one';
const out = process.env.WEB027_PAINT_OUTPUT || 'output/playwright/web-027/formal/startup-paint';
await mkdir(out, {recursive:true});
const ready = await (await fetch(`${origin}/readyz`)).json();
const browser = await chromium.launch({headless:true, proxy:{server:'http://127.0.0.1:7890',bypass:'127.0.0.1,localhost'}});
const results = [];
try {
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({viewport:{width,height:1000},colorScheme:theme});
    await context.addInitScript(() => {
      const frames = []; window.__startupPaint = frames; let previous = '';
      const visible = selector => {const n = document.querySelector(selector); return Boolean(n?.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');};
      function observe() {
        const body = document.body;
        const state = {stage:document.documentElement.dataset.ipoStartup,theme:document.documentElement.dataset.ipoTheme,
          canvas:body ? getComputedStyle(body).backgroundColor : null,
          title:visible('#appStartupTitle'),hint:visible('#appStartupStatus'),shell:visible('.app-shell'),legacy:visible('#signedOutPrivacyShield'),
          current:!!body?.classList.contains('product-experience')};
        const key = JSON.stringify(state);
        if (key !== previous) {frames.push({at:performance.now(),...state}); previous = key;}
        requestAnimationFrame(observe);
      }
      requestAnimationFrame(observe);
    });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    for (const phase of ['cold','reload']) {
      const name = `${width}-${theme}-${phase}`, images = [], writes = [];
      const capture = ({data,metadata,sessionId}) => {
        const file = `${name}-${String(images.length).padStart(3,'0')}.jpg`;
        images.push({file,timestamp:metadata.timestamp});
        writes.push(writeFile(`${out}/${file}`,Buffer.from(data,'base64')));
        cdp.send('Page.screencastFrameAck',{sessionId}).catch(()=>{});
      };
      cdp.on('Page.screencastFrame',capture);
      await cdp.send('Page.startScreencast',{format:'jpeg',quality:70,maxWidth:1440,maxHeight:1000,everyNthFrame:1});
      if (phase === 'cold') await page.goto(`${origin}/#overview`,{waitUntil:'domcontentloaded'});
      else await page.reload({waitUntil:'domcontentloaded'});
      await expect(page.locator('#web009HeroTitle')).toBeVisible({timeout:45000});
      await expect(page.locator('html')).toHaveAttribute('data-ipo-startup','ready');
      await page.getByRole('button',{name:'Log in',exact:true}).click();
      await expect(page.locator('#accessLayer')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#accessLayer')).toBeHidden();
      await cdp.send('Page.stopScreencast'); cdp.off('Page.screencastFrame',capture); await Promise.all(writes);
      const frames = await page.evaluate(()=>window.__startupPaint);
      const painted = frames.filter(f => f.stage && f.canvas);
      assert(painted.length > 0 && images.length > 0);
      assert(!painted.some(f => f.title), 'Full-screen startup title was painted');
      assert(!painted.some(f => f.shell && (f.legacy || !f.current)), 'Intermediate legacy UI was painted');
      assert(!painted.some(f => f.stage === 'loading' && f.hint), 'Fast-load feedback flashed');
      assert(!painted.some(f => f.canvas !== (theme === 'dark' ? 'rgb(9, 13, 18)' : 'rgb(245, 244, 239)')), 'Public canvas changed during startup');
      assert(!painted.some(f => f.theme !== theme || f.stage === 'failed'));
      const result = {name,frames,images,loginOpenedAndDismissed:true,passed:true};
      results.push(result);await writeFile(`${out}/${name}.json`,JSON.stringify(result,null,2));
      console.log(JSON.stringify({name,frames,images:images.length,passed:true}));
    }
    await context.close();
  }
  const finalReady = await (await fetch(`${origin}/readyz`)).json();
  assert.equal(finalReady.releaseId,ready.releaseId, 'Deployment changed during acceptance');
} finally {
  await browser.close();
  await writeFile(`${out}/result.json`,JSON.stringify({source:ready.releaseId,origin,results,apiMocks:false,assetMocks:false},null,2));
}
