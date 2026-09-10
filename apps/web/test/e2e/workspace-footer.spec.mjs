import {expect, test} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

test('environment details are optional, keyboard operable and fit mobile navigation', async ({page}) => {
  await page.goto('http://127.0.0.1:4173/#request-credit');
  await expect(page.locator('#viewTitle')).toHaveText('Your next step');
  const details = page.locator('#sidebarEnvironment');
  const summary = details.locator('summary');
  await expect(page.locator('#accessButtonLabel')).toHaveText('Signed in');
  await expect(page.locator('.sidebar-funds-note')).toHaveText('No real money is moved.');
  await expect(page.locator('#sidebarApiStatus')).toBeHidden();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', {name:'Environment details'})).toBeVisible();
  await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sidebarApiStatus')).toBeHidden();
  await expect(summary).toBeFocused();
  await mkdir('output/playwright/web-027/footer', {recursive:true});
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({width, height:900});
    for (const theme of ['light', 'dark']) {
      if (await page.locator('body').evaluate(body => body.classList.contains('nav-open'))) {
        await page.getByRole('button', {name:'Close navigation', exact:true}).first().click();
      }
      await page.getByRole('combobox', {name:'Appearance',exact:true}).selectOption(theme);
      if (width < 900) await page.getByRole('button', {name:'Open navigation',exact:true}).click();
      await summary.click();
      await expect(page.locator('.sidebar-environment-panel')).toBeVisible();
      await expect(page.locator('.sidebar-funds-note')).toBeInViewport();
      const panel = await page.locator('.sidebar-environment-panel').boundingBox();
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(width);
      await page.screenshot({path:`output/playwright/web-027/footer/details-${width}-${theme}.png`});
      await summary.click();
      await expect(page.locator('.sidebar-environment-panel')).toBeHidden();
    }
  }
});

test('API reference stays reachable in More tools for all existing workspace roles', async ({page}) => {
  for (const [port, view] of [[4173,'request-credit'], [4179,'agent-console'], [4174,'capital-partners'], [4175,'risk-operations']]) {
    await page.goto(`http://127.0.0.1:${port}/#${view}`);
    await expect(page.locator('#appStartup')).toBeHidden();
    const link = page.getByRole('link', {name:'API reference',exact:true});
    const more = page.getByRole('button', {name:'More tools',exact:true});
    await expect(more).toBeVisible();
    if (await more.getAttribute('aria-expanded') === 'true') await more.click();
    await expect(link).toBeHidden();
    await more.click();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href','/openapi.json');
    await expect(link).toHaveAttribute('target','_blank');
    const currentUrl = page.url();
    const popupPending = page.waitForEvent('popup');
    await link.click();
    const popup = await popupPending;
    await expect(popup).toHaveURL(/\/openapi\.json$/);
    await expect(page).toHaveURL(currentUrl);
    await popup.close();
    await page.locator('#sidebarEnvironment summary').click();
    await more.click();
    await expect(page.locator('.sidebar-environment-panel')).toBeHidden();
  }
});
