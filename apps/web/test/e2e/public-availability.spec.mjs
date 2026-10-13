import { test, expect } from "@playwright/test";

const availability = "Current availability: Public sandbox with synthetic capital. Real funds, external provider execution, and production transaction submission are disabled.";

for (const theme of ["light", "dark"]) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`public availability remains visible and readable at ${viewport.width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((value) => localStorage.setItem("ipo-one-theme", value), theme);
      await page.goto("http://127.0.0.1:4178/");
      await expect(page.locator("#web009HeroTitle")).toBeVisible();
      const notice = page.locator("#web009PublicReview [data-public-availability]");
      await expect(notice).toBeVisible();
      await expect(notice).toHaveText(availability);
      const layout = await notice.evaluate((node) => {
        const style = getComputedStyle(node);
        const bounds = node.getBoundingClientRect();
        const parent = node.closest(".web009-hero-copy");
        const lede = parent.querySelector(".web009-lede").getBoundingClientRect();
        const actions = parent.querySelector(".web009-actions").getBoundingClientRect();
        return {
          fontSize: parseFloat(style.fontSize),
          lineHeight: parseFloat(style.lineHeight),
          top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right,
          ledeBottom: lede.bottom, actionsTop: actions.top,
          clipped: node.scrollHeight > node.clientHeight + 1,
          documentWidth: document.documentElement.scrollWidth
        };
      });
      expect(layout.fontSize).toBeGreaterThanOrEqual(14);
      expect(layout.lineHeight).toBeGreaterThanOrEqual(layout.fontSize * 1.5);
      expect(layout.top).toBeGreaterThanOrEqual(layout.ledeBottom);
      expect(layout.bottom).toBeLessThanOrEqual(layout.actionsTop);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(viewport.width);
      expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(layout.clipped).toBe(false);
      await page.reload();
      await expect(notice).toBeVisible();
      await expect(notice).toHaveText(availability);
      await page.locator("#web009PublicReview .web009-actions .web009-open").click();
      await expect(page.locator("#accessLayer")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-ipo-theme", theme);
      await page.locator("#accessCloseBtn").click();
      await page.locator("#web009PublicReview a[href^='/whitepaper']:visible").first().click();
      await expect(page).toHaveURL(/\/whitepaper(?:\?|$)/);
      await expect(page.locator("#whitepaperTitle")).toBeVisible();
    });
  }
}

test("public sitemap is well-formed XML containing only canonical public pages", async ({ page, request }) => {
  const response = await request.get("http://127.0.0.1:4178/sitemap.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();
  await page.goto("http://127.0.0.1:4178/");
  const parsed = await page.evaluate((value) => {
    const document = new DOMParser().parseFromString(value, "application/xml");
    return {
      errors: document.querySelectorAll("parsererror").length,
      namespace: document.documentElement.namespaceURI,
      urls: [...document.getElementsByTagName("loc")].map((node) => node.textContent)
    };
  }, xml);
  expect(parsed).toEqual({
    errors: 0,
    namespace: "http://www.sitemaps.org/schemas/sitemap/0.9",
    urls: ["https://ipo.one/", "https://ipo.one/whitepaper"]
  });
});
