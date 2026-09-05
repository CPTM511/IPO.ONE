import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const roles = [
  { name: "human", port: 4173, title: "Your next step", view: "request-credit", views: ["request-credit", "obligations", "activity-proofs", "wallet-permissions", "overview", "secured-pool", "repay-settle", "credit-passport", "credit-track-record", "reports-exports"] },
  { name: "agent", port: 4179, title: "Agent tasks", view: "agent-console", views: ["agent-console", "request-credit", "activity-proofs", "wallet-permissions", "overview", "secured-pool", "obligations", "credit-track-record", "reports-exports", "architecture"] },
  { name: "capital", port: 4174, title: "Capital workspace", view: "capital-partners", views: ["capital-partners"] },
  { name: "risk", port: 4175, title: "Risk workspace", view: "risk-operations", views: ["risk-operations"] }
];

async function openWorkspace(page, role) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`http://127.0.0.1:${role.port}/?preview_data=fixture#${role.view}`);
  await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated");
  await expect(page.locator("#viewTitle")).toHaveText(role.title);
}

for (const role of roles) {
  test(`${role.name}: every allowed destination remains visibly reachable and recoverable`, async ({ page }) => {
    await openWorkspace(page, role);
    const more = page.locator("#sidebarMoreBtn");
    if (await more.isVisible()) await more.click();
    for (const view of role.views) {
      const entry = page.locator(`.nav-item[data-view="${view}"]`);
      await entry.click();
      await expect(page.locator(`.view[data-view-panel="${view}"]`)).toBeVisible();
      await expect(entry).toHaveAttribute("aria-current", "page");
      await expect(page).toHaveURL(new RegExp(`#${view}$`));
    }
    await page.reload();
    await expect(page.locator(`.view[data-view-panel="${role.views.at(-1)}"]`)).toBeVisible();
    if (role.views.length > 1) {
      await page.locator(`.nav-item[data-view="${role.view}"]`).click();
      await page.goBack();
      await expect(page.locator(`.view[data-view-panel="${role.views.at(-1)}"]`)).toBeVisible();
    }
  });

  test(`${role.name}: task layout remains readable in both themes across six widths`, async ({ page }) => {
    test.setTimeout(60_000);
    await openWorkspace(page, role);
    await mkdir("output/playwright/web-026", { recursive: true });
    for (const width of [1440, 1058, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      for (const theme of ["light", "dark"]) {
        await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
        await expect(page.locator("html")).toHaveAttribute("data-ipo-theme", theme);
        const layout = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
          mainLeft: document.querySelector(".main-shell").getBoundingClientRect().left,
          sidebarRight: document.querySelector(".sidebar").getBoundingClientRect().right,
          headerHeight: document.querySelector(".topbar").getBoundingClientRect().height
        }));
        expect(layout.content, `${role.name} ${width} ${theme}: horizontal overflow`).toBeLessThanOrEqual(layout.width + 1);
        if (width > 900) expect(Math.abs(layout.mainLeft - layout.sidebarRight)).toBeLessThan(2);
        if (width <= 600) expect(layout.headerHeight).toBeLessThanOrEqual(150);
        const amounts = page.locator("#workspaceCreditSummary dd");
        for (const value of await amounts.all()) {
          const box = await value.boundingBox();
          if (box) expect(box.height).toBeLessThan(50);
        }
        await page.screenshot({ path: `output/playwright/web-026/${role.name}-${width}-${theme}.png` });
      }
    }
  });
}

test("Human opens the current payment, keeps entered amount, and recovers its summary", async ({ page }) => {
  await openWorkspace(page, roles[0]);
  await expect(page.locator("#humanGuidePrimaryBtn")).toHaveText("Review next payment");
  await expect(page.locator(".request-credit-human > .human-entry")).toBeHidden();
  await page.locator("#humanGuidePrimaryBtn").click();
  await expect(page.locator("#humanRepaymentAmount")).toBeVisible();
  await page.locator("#humanRepaymentAmount").fill("30");
  await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("dark");
  await expect(page.locator("#humanRepaymentAmount")).toHaveValue("30");
  await page.reload();
  await expect(page.locator('[data-summary="outstanding"]')).toHaveText("$120.00");
  await expect(page.locator('[data-summary="payment"]')).toHaveText("$60.00");
  await expect(page.locator("html")).toHaveAttribute("data-ipo-theme", "dark");
});

test("Human decision help opens its enclosing disclosure with keyboard focus", async ({ page }) => {
  await page.goto("/?browser_qa_workspace=no_subject#request-credit");
  await expect(page.locator("#humanGuideSecondaryBtn")).toHaveText("See how it works");
  await page.locator("#humanGuideSecondaryBtn").click();
  await expect(page.locator(".workspace-assurance")).toHaveAttribute("open", "");
  await expect(page.locator("#humanGuideDetails")).toHaveAttribute("open", "");
  await expect(page.locator("#humanGuideDetails > summary")).toBeFocused();
});

test("Unavailable sign-in is legible, correctly numbered, keyboard reachable and recoverable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:4178/?preview_data=fixture");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.locator("#accessLayer")).toBeVisible();
  await expect(page.locator("#accessMethodStep")).toHaveText("1");
  await expect(page.locator("#signInMethodCopy")).not.toContainText("selected above");
  for (const width of [1058, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    const dialog = page.locator(".access-dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.querySelector(".access-dialog").contains(document.activeElement))).toBe(true);
    }
    await page.screenshot({ path: `output/playwright/web-026/access-${width}.png` });
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("#accessLayer")).toBeHidden();
  await page.getByRole("button", { name: "Open IPO.ONE", exact: true }).first().click();
  await expect(page.locator("#accessLayer")).toBeVisible();
});

test("Agent current task uses the original guarded operation and retains authority management", async ({ page }) => {
  await openWorkspace(page, roles[1]);
  const run = page.locator("#agentOnlineRunBtn");
  await expect(run).toHaveText("Run local Agent application");
  await expect(page.locator(".agent-workspace-entry #agentOnlineRunBtn")).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage Agent authority", exact: true })).toBeVisible();
  await run.click();
  await expect(page.locator("#agentOnlineStatus")).toHaveText("Offer ready · activate");
  await expect(run).toHaveText("Review and activate this Mandate");
  await expect(page.locator("#agentOnlineOfferState")).toContainText("$100.00");
  await run.click();
  await expect(page.locator("#agentAuthorityDisclosure")).toHaveAttribute("open", "");
  await expect(page.locator("#principalMandateAcknowledge")).toBeVisible();
});

test("Ordinary public entry retains controllable illustrative motion and current Whitepaper", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:4178/");
  await expect(page.locator("#web009HeroTitle")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/web012b-review-mode/);
  let mutations = 0;
  page.on("request", request => { if (request.method() === "POST") mutations++; });
  await page.locator('[data-b-hero-state="4"]').click();
  await expect(page.locator('[data-b-hero-state="4"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-b-hero-play]")).toHaveText("Replay");
  for (let index = 0; index < 10; index++) {
    await page.getByRole("combobox", { name: "All lifecycle states" }).selectOption(String(index));
    await expect(page.locator("[data-b-pin-label]")).toHaveText(`State ${index + 1} of 10`);
  }
  await page.locator(".b-lifecycle [data-b-evidence-toggle]").click();
  await expect(page.locator(".b-lifecycle [data-b-evidence-detail]")).toContainText("illustrative credit lifecycle");
  expect(mutations).toBe(0);
  await page.getByRole("link", { name: "Whitepaper", exact: true }).first().click();
  await expect(page).toHaveURL(/\/whitepaper/);
  await expect(page.locator("#whitepaperToc a")).toHaveCount(48);
});
