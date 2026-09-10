import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

function holdRequest(page, pattern) {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  return page.route(pattern, async route => { await held; await route.continue(); })
    .then(() => release);
}

for (const [mode,port,heldResource] of [['public',4178,'**/workspace-experience.js'],['authenticated',4179,'**/auth/v1/options']]) {
  test(`${mode} startup ignores unrelated script failures and still reaches the workspace`, async ({page}) => {
    await page.addInitScript(() => localStorage.setItem('ipo-one-theme','dark'));
    const release=await holdRequest(page,heldResource);
    await page.route('**/optional-wallet-resource.js',route=>route.abort('failed'));
    try {
      await page.goto(`http://127.0.0.1:${port}/#overview`,{waitUntil:'commit'});
      await expect(page.locator('#appStartup')).toBeVisible();
      for(const src of ['/optional-wallet-resource.js','https://wallet-resource.invalid/optional-wallet-resource.js']) {
        // Exercise actual browser resource errors, as an extension or optional
        // integration can produce, while the real application is still loading.
        await page.evaluate(src=>new Promise(resolve=>{
          const script=document.createElement('script');
          script.src=src;script.onerror=()=>resolve();document.head.append(script);
        }),src);
        await expect(page.locator('html')).not.toHaveAttribute('data-ipo-startup','failed');
        await expect(page.locator('#appStartupTitle')).toBeHidden();
        await expect(page.locator('#appStartupReload')).toBeHidden();
      }
      await expect(page.locator('.app-shell')).toBeHidden();
    } finally { release(); }
    await expect(page.locator('html')).toHaveAttribute('data-ipo-startup','ready');
    if(mode==='public')await expect(page.locator('#web009HeroTitle')).toBeVisible();
    else await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated');
    await expect(page.locator('#appStartup')).toBeHidden();
  });
}

for (const theme of ['light', 'dark']) {
  test(`fast ${theme} entry reveals the current page without a loading interstitial`, async ({page}) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.addInitScript(value => localStorage.setItem('ipo-one-theme', value), theme);
    const release = await holdRequest(page, '**/workspace-experience.js');
    try {
      await page.goto('http://127.0.0.1:4178/', {waitUntil:'commit'});
      await expect(page.locator('#appStartup')).toBeVisible();
      await page.clock.runFor(1000);
      await expect(page.locator('#appStartupTitle')).toBeHidden();
      await expect(page.locator('#appStartupStatus')).toBeHidden();
      await expect(page.locator('#appStartupReload')).toBeHidden();
      await expect(page.locator('.app-shell')).toBeHidden();
      await expect(page.locator('#signedOutPrivacyShield')).toBeHidden();
      await expect(page.locator('html')).toHaveAttribute('data-ipo-theme', theme);
      await mkdir('output/playwright/web-027/startup', {recursive:true});
      await page.screenshot({path:`output/playwright/web-027/startup/cold-${theme}.png`});
    } finally { release(); }
    await expect(page.locator('#web009HeroTitle')).toBeVisible();
    await expect(page.locator('#appStartup')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/web012b-review-mode/);
    await page.clock.runFor(5000);
    await expect(page.locator('html')).toHaveAttribute('data-ipo-startup', 'ready');
    await page.getByRole('button', {name:'Log in',exact:true}).click();
    await expect(page.locator('#accessLayer')).toBeVisible();
  });
}

test('authenticated reload waits for server recovery without showing the public or old workspace', async ({page}) => {
  await page.goto('http://127.0.0.1:4179/#agent-console');
  await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated');
  const release = await holdRequest(page, '**/auth/v1/options');
  try {
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('#appStartup')).toBeVisible();
    await expect(page.locator('#web009PublicReview')).toBeHidden();
    await expect(page.locator('.app-shell')).toBeHidden();
    await expect(page.locator('#appStartupStatus')).toContainText('workspace');
  } finally { release(); }
  await expect(page.locator('#appStartup')).toBeHidden();
  await expect(page.locator('#viewTitle')).toHaveText('Agent tasks');
  await expect(page.locator('.workspace-primary-nav')).toBeVisible();
  await page.getByRole('button',{name:'Agents',exact:true}).click();
  await expect(page.locator('#viewTitle')).toHaveText('Agent setup & authority');
});

for (const theme of ['light', 'dark']) {
  test(`slow ${theme} authenticated recovery keeps the final canvas and uses a quiet delayed hint`, async ({page}) => {
    await page.addInitScript(value => localStorage.setItem('ipo-one-theme', value), theme);
    await page.goto('http://127.0.0.1:4179/#agent-console');
    await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated');
    const finalCanvas = await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor);
    const release = await holdRequest(page, '**/auth/v1/options');
    try {
      await page.reload({waitUntil:'domcontentloaded'});
      await expect(page.locator('#appStartupTitle')).toBeHidden();
      await expect(page.locator('body')).toHaveCSS('background-color', finalCanvas);
      await expect(page.locator('html')).toHaveCSS('background-color', finalCanvas);
      await expect(page.locator('#appStartupStatus')).toBeVisible();
      await expect(page.locator('#appStartupStatus')).toHaveCSS('font-size','12px');
      const box = await page.locator('#appStartupStatus').boundingBox();
      expect(box.y).toBeGreaterThan(page.viewportSize().height - 100);
      await expect(page.locator('.app-shell')).toBeHidden();
    } finally { release(); }
    await expect(page.locator('#viewTitle')).toHaveText('Agent tasks');
    await expect(page.locator('body')).toHaveCSS('background-color', finalCanvas);
    await expect(page.locator('#appStartup')).toBeHidden();
  });
}

for(const resource of ['app.js','workspace-experience.js']) {
test(`failed ${resource} loading exposes a working reload control and never reveals legacy UI`, async ({page}) => {
  const pattern=`**/${resource}*`;
  await page.route(pattern, route => route.abort('failed'));
  await page.goto('http://127.0.0.1:4178/');
  await expect(page.locator('#appStartupStatus')).toContainText('could not finish loading');
  await expect(page.getByRole('button',{name:'Reload IPO.ONE',exact:true})).toBeVisible();
  await expect(page.locator('.app-shell')).toBeHidden();
  await page.unroute(pattern);
  await page.getByRole('button',{name:'Reload IPO.ONE',exact:true}).click();
  await expect(page.locator('#web009HeroTitle')).toBeVisible();
  await expect(page.locator('#appStartup')).toBeHidden();
});
}

test('disabled JavaScript has a visible explanation instead of a legacy or blank page', async ({browser}) => {
  const context=await browser.newContext({javaScriptEnabled:false});
  const page=await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4178/');
    // Playwright's text engine deliberately excludes noscript; inspect its
    // rendered child directly while retaining the visible-content assertion.
    await expect(page.locator('#appStartup noscript p')).toBeVisible();
    await expect(page.locator('#appStartup noscript p')).toHaveJSProperty('textContent', 'Enable JavaScript to open your secure workspace.');
    await expect(page.locator('.app-shell')).toBeHidden();
  } finally { await context.close(); }
});

test('a stalled module offers retry while keeping the legacy shell hidden', async ({page}) => {
  const release = await holdRequest(page, '**/workspace-experience.js');
  await page.route('**/optional-wallet-resource.js',route=>route.abort('failed'));
  try {
    await page.goto('http://127.0.0.1:4178/', {waitUntil:'commit'});
    await expect(page.locator('#appStartup')).toBeVisible();
    await page.evaluate(()=>new Promise(resolve=>{
      const script=document.createElement('script');script.src='/optional-wallet-resource.js';
      script.onerror=()=>resolve();document.head.append(script);
    }));
    await expect(page.locator('#appStartupTitle')).toBeHidden();
    await expect(page.locator('#appStartupStatus')).toContainText('taking longer than expected', {timeout:25000});
    await expect(page.getByRole('button',{name:'Reload IPO.ONE',exact:true})).toBeVisible();
    await expect(page.locator('.app-shell')).toBeHidden();
  } finally { release(); }
  await expect(page.locator('#appStartup')).toBeHidden();
  await expect(page.locator('#web009HeroTitle')).toBeVisible();
});
