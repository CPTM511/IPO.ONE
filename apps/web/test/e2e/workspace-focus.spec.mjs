import { test, expect } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  for (const width of [1440, 390]) {
    test(`mouse navigation uses current ${theme} focus at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('http://127.0.0.1:4173/?preview_data=fixture#request-credit');
      await page.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption(theme);
      await expect(page.locator('#humanGuidePrimaryBtn')).toHaveText('Review next payment');
      await page.locator('#humanGuidePrimaryBtn').click();
      const card = page.locator('#humanObligationCard');
      await expect(card).toBeFocused();
      expect(await card.evaluate(node => node.matches(':focus-visible'))).toBe(false);
      await expect(card).toHaveCSS('outline-color', theme === 'dark' ? 'rgb(123, 217, 200)' : 'rgb(22, 106, 88)');
      await expect(card).toHaveCSS('outline-style', 'solid');
      await expect(card).toHaveCSS('outline-width', '2px');
      for (const badge of [card.locator('.obligation-card-heading > div > span'), card.locator('.obligation-card-heading em')]) {
        await expect(badge).toBeVisible();
        await expect(badge).toHaveCSS('color', theme === 'dark' ? 'rgb(123, 217, 200)' : 'rgb(22, 106, 88)');
        await expect(badge).toHaveCSS('background-color', theme === 'dark' ? 'rgb(27, 51, 53)' : 'rgb(224, 240, 233)');
      }
    });
  }
}
