import { test, expect } from "@playwright/test";

// Presentation regression only: these fixtures do not prove hosted role access.
for (const theme of ["light", "dark"]) for (const width of [1440, 390]) {
  test(`public management boundary stays visible at ${width} in ${theme}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(value => localStorage.setItem("ipo-one-theme", value), theme);
    await page.route("**/auth/v1/options", async route => {
      const response = await route.fetch();
      const options = await response.json();
      await route.fulfill({ response, json: {
        ...options, profile: "public_authenticated_no_funds_beta", riskPasskey: false,
        walletAuthentication: true, walletWorkspaceRoles: ["human_borrower", "principal_controller"]
      } });
    });
    await page.goto("http://127.0.0.1:4178/");
    await page.getByRole("button", { name: "Open IPO.ONE", exact: true }).first().click();
    const notice = page.locator("#managementAccessNotice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Human and Principal/Agent no-funds workflows");
    await expect(notice).toContainText("Capital Partner, Risk, Operations and Auditor workspaces remain private");
    await expect(notice).toContainText("separately reviewed release");
    await expect(page.locator("#borrowerWorkspaceRoleBtn")).toBeEnabled();
    await expect(page.locator("#principalWorkspaceRoleBtn")).toBeEnabled();
    await expect(page.locator("#riskWorkspaceRoleBtn")).toBeHidden();
    await expect(page.locator("#capitalPartnerWorkspaceRoleBtn")).toBeHidden();
    await expect(page.locator(".access-dialog")).toHaveJSProperty("scrollWidth", await page.locator(".access-dialog").evaluate(el => el.clientWidth));
    await page.locator(".access-dialog").screenshot({ path: `output/playwright/bnb004-role-mfa/public-${theme}-${width}.png` });
    await page.reload();
    await page.getByRole("button", { name: "Open IPO.ONE", exact: true }).first().click();
    await expect(notice).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("review workspace exposes missing MFA and a failed refresh cannot retain Passkey controls", async ({ page }) => {
  let failed = false;
  let passkeyRequests = 0;
  page.on("request", request => { if (request.url().includes("/auth/v1/passkey/")) passkeyRequests++; });
  await page.route("**/auth/v1/options", async route => {
    if (failed) return route.fulfill({ status: 503, json: { code: "authentication_unavailable" } });
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), riskPasskey: false } });
  });
  await page.goto("http://127.0.0.1:4175/?preview_data=fixture#risk-operations");
  await expect(page.locator("#riskPasskeyPanel")).toBeVisible();
  await expect(page.locator("#riskPasskeyBadge")).toHaveText("Passkey unavailable");
  await expect(page.locator("#riskPasskeyMessage")).toContainText("Independent approvals are still required");
  for (const id of ["registerRiskPasskeyBtn", "verifyRiskPasskeyBtn"]) {
    await expect(page.locator(`#${id}`)).toBeVisible();
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  failed = true;
  await page.reload();
  await expect(page.locator("#riskPasskeyBadge")).toHaveText("Verification unavailable");
  await expect(page.locator("#riskPasskeyMessage")).toContainText("Retry the sign-in check");
  await expect(page.locator("#verifyRiskPasskeyBtn")).toBeDisabled();
  expect(passkeyRequests).toBe(0);
});
