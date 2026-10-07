import {test,expect} from '@playwright/test';
import {renderedContrast} from '../support/rendered-contrast.mjs';

test('Pending Agent account proof uses readable current theme surfaces',async({page})=>{
  await page.route('**/tenant/v1/operations',async route=>{
    const operation=route.request().postDataJSON()?.operationId;
    if(!['pilotReadWorkspaceResume','pilotReadAgentAccountBinding'].includes(operation))return route.continue();
    const response=await route.fetch();const data=await response.json();
    if(operation==='pilotReadWorkspaceResume'){
      data.response.resources=data.response.resources.filter(r=>r.resourceType==='subject');
      data.response.continuationReceipts=[];
    }else{
      data.response.subjectStatus='pending';data.response.accountBinding=null;
    }
    await route.fulfill({response,json:data});
  });
  await page.goto('http://127.0.0.1:4179/?preview_data=fixture#request-credit');
  await page.getByRole('button',{name:'Agents',exact:true}).click();
  await expect(page.locator('.account-proof-status')).toBeVisible();
  await page.getByText('Developer proof request',{exact:true}).click();
  for(const width of [1440,390])for(const theme of ['dark','light']){
    await page.setViewportSize({width,height:1000});
    await page.getByRole('combobox',{name:'Appearance',exact:true}).selectOption(theme);
    for(const scope of ['.account-proof-status','.account-proof-request']){
      const report=await renderedContrast(page,scope);
      expect(report.checked).toBeGreaterThan(0);
      expect(report.failures,`${width} ${theme} ${scope}`).toEqual([]);
      expect(report.manual).toEqual([]);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  }
});
