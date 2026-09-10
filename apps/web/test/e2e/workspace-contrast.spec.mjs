import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {workspaceContrastJourney} from '../support/workspace-contrast-journey.mjs';

for(const [role,port] of [['human',4173],['agent',4179],['capital',4174],['risk',4175]]) {
 test(`${role} role-allowed pages retain readable text in both themes`,async({page})=>{
  test.setTimeout(180000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.locator('#appStartup')).toBeHidden();
  const reports=await workspaceContrastJourney(page,{role,screenshots:'output/playwright/web-027/dark-contrast/screenshots'});
  await mkdir('output/playwright/web-027/dark-contrast',{recursive:true});
  await writeFile(`output/playwright/web-027/dark-contrast/${role}.json`,JSON.stringify(reports,null,2));
  expect(reports.flatMap(r=>r.failures.map(f=>({role,width:r.width,theme:r.theme,view:r.view,state:r.state,...f})))).toEqual([]);
  expect(reports.flatMap(r=>r.manual), 'All encountered text surfaces must have a determinate contrast result').toEqual([]);
 });
}
