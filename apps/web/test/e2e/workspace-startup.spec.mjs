import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

function holdRequest(page, pattern) {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  return page.route(pattern, async route => { await held; await route.continue(); })
    .then(() => release);
}

for (const theme of ['light', 'dark']) {
  test(`cold ${theme} entry never paints the legacy page while modules load`, async ({page}) => {
    await page.addInitScript(value => localStorage.setItem('ipo-one-theme', value), theme);
    const release = await holdRequest(page, '**/workspace-experience.js');
    try {
      await page.goto('http://127.0.0.1:4178/', {waitUntil:'commit'});
      await expect(page.locator('#appStartup')).toBeVisible();
      await expect(page.locator('.app-shell')).toBeHidden();
      await expect(page.locator('#signedOutPrivacyShield')).toBeHidden();
      await expect(page.locator('html')).toHaveAttribute('data-ipo-theme', theme);
      await mkdir('output/playwright/web-027/startup', {recursive:true});
      await page.screenshot({path:`output/playwright/web-027/startup/cold-${theme}.png`});
    } finally { release(); }
    await expect(page.locator('#web009HeroTitle')).toBeVisible();
    await expect(page.locator('#appStartup')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/web012b-review-mode/);
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

test('failed module loading exposes a working reload control and never reveals legacy UI', async ({page}) => {
  await page.route('**/workspace-experience.js', route => route.abort('failed'));
  await page.goto('http://127.0.0.1:4178/');
  await expect(page.locator('#appStartupStatus')).toContainText('could not finish loading');
  await expect(page.getByRole('button',{name:'Reload IPO.ONE',exact:true})).toBeVisible();
  await expect(page.locator('.app-shell')).toBeHidden();
  await page.unroute('**/workspace-experience.js');
  await page.getByRole('button',{name:'Reload IPO.ONE',exact:true}).click();
  await expect(page.locator('#web009HeroTitle')).toBeVisible();
  await expect(page.locator('#appStartup')).toBeHidden();
});

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
  try {
    await page.goto('http://127.0.0.1:4178/', {waitUntil:'commit'});
    await expect(page.locator('#appStartupStatus')).toContainText('taking longer than expected', {timeout:25000});
    await expect(page.getByRole('button',{name:'Reload IPO.ONE',exact:true})).toBeVisible();
    await expect(page.locator('.app-shell')).toBeHidden();
  } finally { release(); }
  await expect(page.locator('#appStartup')).toBeHidden();
  await expect(page.locator('#web009HeroTitle')).toBeVisible();
});
