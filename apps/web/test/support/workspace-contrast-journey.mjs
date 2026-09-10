import {expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {renderedContrast} from './rendered-contrast.mjs';

export async function workspaceContrastJourney(page, {role, widths=[1440,390], screenshots}={}) {
  const reports=[];
  await page.setViewportSize({width:1440,height:1000});
  const more=page.getByRole('button',{name:'More tools',exact:true});
  if(await more.isVisible()&&await more.getAttribute('aria-expanded')!=='true')await more.click();
  const views=await page.locator('.nav-item[data-view]:visible').evaluateAll(nodes=>nodes.map(n=>n.dataset.view));
  const settle=()=>page.locator('.app-shell').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  for(const width of widths)for(const theme of ['dark','light']) {
    await page.setViewportSize({width,height:1000});
    await page.getByRole('combobox',{name:'Appearance',exact:true}).selectOption(theme);
    for(const view of views) {
      if(width<900)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
      if(await more.isVisible()&&await more.getAttribute('aria-expanded')!=='true')await more.click();
      await page.locator(`.nav-item[data-view="${view}"]`).click();
      const panel=page.locator(`[data-view-panel="${view}"]`);
      await expect(panel).toBeVisible();
      const disclosures=panel.locator('details:not([open]) > summary:visible');
      let opened=0;
      while(await disclosures.count()) {expect(++opened).toBeLessThan(40);await disclosures.first().click();}
      await settle();
      reports.push({role,width,theme,view,state:'expanded',...await renderedContrast(page)});
      const action=page.locator(view==='overview'?'#homeHumanBorrowBtn':'#openPrincipalWorkspaceLink');
      if(['overview','request-credit'].includes(view)&&await action.isVisible()) {
        for(const state of ['hover','focus']) {
          const card=action;
          if(state==='hover')await card.hover();
          else {await page.keyboard.press('Tab');await card.focus();await expect(card).toBeFocused();}
          await settle();reports.push({role,width,theme,view,state,...await renderedContrast(page)});
        }
        await page.mouse.move(0,0);
      }
      if(screenshots&&['overview','request-credit','agent-console','risk-operations','capital-partners'].includes(view)) {
        await mkdir(screenshots,{recursive:true});
        await panel.scrollIntoViewIfNeeded();
        await page.screenshot({path:`${screenshots}/${role}-${width}-${theme}-${view}.png`,fullPage:true});
      }
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  return reports;
}
