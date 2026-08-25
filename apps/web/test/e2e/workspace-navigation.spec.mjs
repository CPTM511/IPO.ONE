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

test("Borrower loads durable terminal Credit State through a visible control", async ({ page }) => {
  await page.goto("/");
  const moreTools = page.getByRole("button", { name: "More tools" });
  await moreTools.click();
  await page.getByRole("button", { name: /^Credit Track Record/ }).click();

  await page.getByRole("button", { name: "Load verified record" }).click();

  await expect(page.locator("#creditTrackRecordStateTitle")).toHaveText(
    "1 completed credit cycle"
  );
  await expect(page.locator("#creditTrackRecordLatestOutcome")).toHaveText(
    "On Time Repaid"
  );
  await expect(page.locator("#creditTrackRecordReliability")).toHaveText(
    "Verified On Time History"
  );
  await expect(page.locator("#creditTrackRecordRows")).toContainText(
    "Positive Repayment History"
  );
  await expect(page.locator("#creditTrackRecordStateCopy")).toContainText(
    "does not authorize funds or an automatic limit change"
  );
});

test("Borrower sees exact-release chain writing as explicitly disabled", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More tools" }).click();
  await page.getByRole("button", { name: /^Repay & Settle/ }).click();

  await expect(page.locator("#humanObligationChainAnchorStatus")).toHaveText(
    "DISABLED"
  );
  await expect(page.locator("#humanObligationChainAnchorCopy")).toContainText(
    "no transaction, observation, finality, or reconciliation is claimed"
  );
  await expect(page.locator("#anchorPendingEvidenceBtn")).toBeHidden();
  await expect(page.locator("#humanObligationChainAnchorLink")).toBeHidden();
});

test("Borrower visibly reviews an exact secured-Pool action without submission", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#request-credit");

  const pool = page.getByRole("region", { name: "Review liquidity or secured borrowing" });
  await expect(pool).toBeVisible();
  await pool.getByRole("button", { name: "Refresh Pool state" }).click();
  await expect(page.locator("#securedPoolStatus")).toHaveText("Awaiting indexed state");
  await expect(page.locator("#securedPoolSubmission")).toContainText("no chain transaction will be submitted");

  await page.locator("#securedPoolActionType").focus();
  await page.keyboard.press("b");
  await page.keyboard.press("Tab");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("1000000");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  await expect(page.locator("#securedPoolReviewAction")).toHaveText("Borrow");
  await expect(page.locator("#securedPoolReviewAmount")).toHaveText("1000000");
  await expect(page.locator("#securedPoolReviewHelper")).toContainText(
    "pool_submission_unavailable"
  );
  await expect(page.locator("#securedPoolSubmission")).toContainText("no chain transaction will be submitted");
});

test("secured-Pool controls remain usable at 200 percent zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/#request-credit");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "200%";
  });

  const refresh = page.getByRole("button", { name: "Refresh Pool state" });
  await refresh.scrollIntoViewIfNeeded();
  await expect(refresh).toBeVisible();
  await refresh.click();
  await expect(page.locator("#securedPoolReviewForm")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review exact action" })).toBeEnabled();
});

test("Capital Partner reaches the bilateral workspace without public-pool authority", async ({ page }) => {
  await page.goto("http://127.0.0.1:4174/");

  const entry = page.getByRole("button", { name: /^Capital Partners/ });
  await expect(entry).toBeVisible();
  await entry.click();

  await expect(page.locator("#capitalPartnersViewTitle")).toHaveText("Capital Partners");
  await page.getByRole("button", { name: "Refresh workspace" }).click();
  await expect(page.locator("#capitalPartnerMaturity")).toHaveText(
    "Synthetic marketplace ready"
  );
  await expect(page.locator("[data-view-panel='capital-partners']")).toContainText(
    "Public pools, deposits, custody, allocation, withdrawals, and real capital remain disabled"
  );
  await expect(page.locator("[data-view-panel='capital-partners']")).toContainText(
    "No funds authority"
  );
});

test("Risk reaches the aggregate secured-Pool control view with visible clicks", async ({ page }) => {
  await page.goto("http://127.0.0.1:4175/");

  const entry = page.getByRole("button", { name: /^Risk & Operations/ });
  await expect(entry).toBeVisible();
  await entry.click();

  const refresh = page.getByRole("button", { name: "Refresh Pool control view" });
  await expect(refresh).toBeEnabled();
  await refresh.click();

  await expect(page.locator("#riskSecuredPoolStatus")).toHaveText(
    "Aggregate server state loaded"
  );
  await expect(page.locator("#riskSecuredPoolPositions")).toHaveText("0");
  await expect(page.locator("#riskSecuredPoolDiscrepancies")).toHaveText("0");
  await expect(page.locator("#riskSecuredPoolHelper")).toContainText(
    "no address or liquidation submission authority was returned"
  );
});
