import { test, expect } from '@playwright/test';

for (const [role, port, initialView] of [
  ['Human', 4173, 'request-credit'],
  ['Principal', 4179, 'agent-console']
]) {
  test(`${role} Evidence keeps the owner surface without exposing the review console`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/?preview_data=fixture#${initialView}`);
    await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated');
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await expect(page.locator('#viewTitle')).toHaveText('Activity & evidence');
    await expect(page.locator('#auditorEvidenceConsole')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Verify Registry Evidence', exact: true })).toBeVisible();
    if (role === 'Human') {
      await expect(page.getByRole('button', { name: 'Open owner timeline', exact: true })).toBeVisible();
    }
    await page.reload();
    await expect(page.locator('#sidebarApiStatus')).toHaveText('Authenticated');
    await expect(page.locator('#auditorEvidenceConsole')).toBeHidden();
  });
}
