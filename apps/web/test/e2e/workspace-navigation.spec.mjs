import { expect, test } from "@playwright/test";

test("Borrower reaches every final-credit-loop destination with visible clicks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const moreTools = page.getByRole("button", { name: "More tools" });
  await expect(moreTools).toBeVisible();
  await moreTools.click();
  await expect(moreTools).toHaveAttribute("aria-expanded", "true");

  for (const destination of [
    "Repay & Settle",
    "Credit Passport",
    "Credit Track Record"
  ]) {
    const entry = page.getByRole("button", { name: new RegExp(`^${destination}`) });
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(page.locator("#viewTitle")).toHaveText(destination);
    await expect(entry).toHaveAttribute("aria-current", "page");
  }
});

test("placement never removes a role-allowed Borrower navigation control", async ({ page }) => {
  await page.goto("/");
  const allowedViews = [
    "overview",
    "request-credit",
    "obligations",
    "activity-proofs",
    "repay-settle",
    "credit-passport",
    "wallet-permissions",
    "credit-track-record",
    "reports-exports"
  ];
  for (const viewId of allowedViews) {
    const entry = page.locator(`.nav-item[data-view="${viewId}"]`);
    await expect(entry).toHaveCount(1);
    await expect(entry).not.toHaveAttribute("hidden", "");
    await expect(entry).toHaveAttribute(
      "data-workspace-placement",
      /^(primary|advanced)$/
    );
  }
});
