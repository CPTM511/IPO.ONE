import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

// Existing synthetic projections only. No database, credentials, real session,
// chain submission or economic commands participate in this browser suite.
const fixture = JSON.parse(await readFile(
  new URL("../../../../api/tenant-protocol/conformance/human-sandbox-obligation-workflow-receipt.v1.fixtures.json", import.meta.url), "utf8"));
const currentId = fixture.valid[0].obligation.obligationId;
const olderId = `${currentId}_secondary`;
const principalOrigin = `http://127.0.0.1:${process.env.IPO_ONE_RECOVERY_PRINCIPAL_PORT ?? "42932"}`;

async function queryGuard(page) {
  const writes = [];
  const reads = [];
  await page.route("**/tenant/v1/operations", async route => {
    const request = route.request().postDataJSON();
    if (!request.operationId.startsWith("pilotRead")) {
      writes.push(request.operationId);
      await route.abort();
    } else {
      reads.push(request);
      await route.continue();
    }
  });
  return { writes, reads };
}

async function openRecovery(page, origin = "") {
  await page.goto(`${origin}/`);
  await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated");
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  const entry = page.locator('.nav-item[data-view="obligations"]');
  if (!(await entry.isVisible())) await page.getByRole("button", { name: "More tools", exact: true }).click();
  await entry.click();
  await expect(page.locator('.view[data-view-panel="obligations"]')).toBeVisible();
  await page.getByText("Find an older record by ID", { exact: true }).click();
  await expect(page.getByLabel("Obligation ID from your receipt")).toBeVisible();
}

async function loadRecord(page, id = olderId) {
  await page.getByLabel("Obligation ID from your receipt").fill(id);
  await page.getByRole("button", { name: "Load record", exact: true }).click();
}

for (const theme of ["light", "dark"]) {
  for (const width of [1440, 390]) {
    test(`older owner record loads and refreshes outside recent references: ${theme}, ${width}`, async ({ page }) => {
      const guard = await queryGuard(page);
      await page.addInitScript(value => localStorage.setItem("ipo-one-theme", value), theme);
      await page.setViewportSize({ width, height: 950 });
      await openRecovery(page);
      await expect(page.locator("#obligationPortfolioList button")).toHaveCount(1);
      await loadRecord(page);
      await expect(page.locator("#obligationDetailAuthorityId")).toHaveAttribute("title", olderId);
      await expect(page.locator("#obligationDetailContent")).toBeVisible();
      await expect(page.locator("#privateCreditOutstanding")).not.toHaveText("—");
      await page.locator("#obligationDetailEvidenceBtn").click();
      await expect(page.locator("#ownedEvidenceCount")).not.toHaveText("0");
      await expect(page.locator("#obligationPortfolioCoverage")).not.toHaveText("Complete server coverage");
      await expect(page.locator("#ownedObligationRecoveryDetails")).toContainText("not a complete history");
      expect(await page.locator("#ownedObligationRestore").evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      await mkdir("output/record-recovery/screenshots", { recursive: true });
      await page.locator("#ownedObligationRecoveryDetails").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `output/record-recovery/screenshots/recovery-${theme}-${width}.png` });
      await page.locator("#ownedObligationRecoveryDetails").screenshot({
        path: `output/record-recovery/screenshots/recovery-entry-${theme}-${width}.png`
      });
      await page.reload();
      await expect(page.locator("#obligationDetailAuthorityId")).toHaveAttribute("title", olderId);
      expect(guard.reads.filter(r => r.operationId === "pilotReadOwnObligation" && r.resource.resourceId === olderId)).toHaveLength(2);
      expect(guard.writes).toEqual([]);
    });
  }
}

for (const [name, id, status, code] of [
  ["invalid syntax", "not a record id", 0, ""],
  ["missing", "obligation_missing_private", 404, "tenant_resource_unavailable"],
  ["another owner", "obligation_other_private", 403, "authorization_denied"]
]) {
  test(`${name} reveals no previous selection or private error detail and permits correction`, async ({ page }) => {
    const guard = await queryGuard(page);
    if (status) await page.route("**/tenant/v1/operations", async route => {
      if (route.request().postDataJSON().resource?.resourceId !== id) return route.fallback();
      await route.fulfill({ status, json: { code, detail: "SECRET_OTHER_OWNER_STATE" } });
    });
    await openRecovery(page);
    const before = guard.reads.filter(r => r.operationId === "pilotReadOwnObligation").length;
    await loadRecord(page, id);
    await expect(page.locator("#obligationDetailContent")).toBeHidden();
    await expect(page.locator("#privateCreditOutstanding")).toHaveText("—");
    await expect(page.locator("#ownedObligationRestoreHelper")).toHaveText(status
      ? "Owner access is required or the Obligation is unavailable."
      : "Enter one exact Obligation ID with no spaces.");
    await expect(page.locator("body")).not.toContainText("SECRET_OTHER_OWNER_STATE");
    if (!status) expect(guard.reads.filter(r => r.operationId === "pilotReadOwnObligation")).toHaveLength(before);
    await loadRecord(page);
    await expect(page.locator("#obligationDetailAuthorityId")).toHaveAttribute("title", olderId);
    expect(guard.writes).toEqual([]);
  });
}

test("transient error retries the same read; revoked locator after reload never shows cached values", async ({ page }) => {
  const guard = await queryGuard(page);
  let failOnce = true;
  let revoked = false;
  await page.route("**/tenant/v1/operations", async route => {
    const command = route.request().postDataJSON();
    if (command.operationId !== "pilotReadOwnObligation" || command.resource.resourceId !== olderId) return route.fallback();
    if (failOnce || revoked) {
      const status = revoked ? 404 : 503;
      failOnce = false;
      await route.fulfill({ status, json: { code: revoked ? "tenant_resource_unavailable" : "gateway_unavailable" } });
    } else await route.fallback();
  });
  await openRecovery(page);
  await loadRecord(page);
  await expect(page.locator("#ownedObligationRestoreHelper")).toContainText("Obligation read failed");
  await expect(page.locator("#privateCreditOutstanding")).toHaveText("—");
  await page.getByRole("button", { name: "Load record", exact: true }).click();
  await expect(page.locator("#obligationDetailAuthorityId")).toHaveAttribute("title", olderId);
  revoked = true;
  await page.reload();
  await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated");
  await expect(page.locator("#obligationDetailContent")).toBeHidden();
  await expect(page.locator("#privateCreditOutstanding")).toHaveText("—");
  expect(await page.evaluate(() => sessionStorage.getItem("ipo-one-owned-obligation-id.v1"))).toBeNull();
  expect(guard.writes).toEqual([]);
});

for (const event of ["accountsChanged", "chainChanged"]) {
  for (const lateResult of ["success", "error"]) {
    test(`${event} during a read discards late ${lateResult} and clears private locators`, async ({ page }) => {
      const guard = await queryGuard(page);
      await page.addInitScript({ path: "apps/web/test/support/wallet-provider-browser-init.js" });
      await page.addInitScript(id => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
          const response = await originalFetch(...args);
          const body = args[1]?.body;
          if (typeof body === "string" && JSON.parse(body).resource?.resourceId === id) {
            const originalText = response.text.bind(response);
            response.text = async () => {
              const text = await originalText();
              window.__recoveryLateBodyConsumed = true;
              return text;
            };
          }
          return response;
        };
      }, olderId);
      await page.route("**/auth/v1/options", async route => {
        const response = await route.fetch();
        const options = await response.json();
        await route.fulfill({ response, json: { ...options, sessionAuthenticationMethod: "siwe",
          walletAuthentication: true, walletWorkspaceRoles: ["human_borrower"], sessionWorkspaceRole: "human_borrower" } });
      });
      await page.route("**/auth/v1/wallet/invalidate", route => route.fulfill({ json: {
        schemaVersion: "wallet_session_invalidation_result.v1", status: "invalidated", reauthenticationRequired: true,
        authorityAvailable: false, credentialsIncluded: false, fundsAuthority: false
      } }));
      await openRecovery(page);
      await page.getByRole("button", { name: "Signed in", exact: true }).click();
      await page.getByRole("button", { name: /Alpha Wallet/ }).click();
      await page.locator("#accessCloseBtn").click();
      let release;
      let reached;
      const held = new Promise(resolve => { release = resolve; });
      const entered = new Promise(resolve => { reached = resolve; });
      await page.route("**/tenant/v1/operations", async route => {
        if (route.request().postDataJSON().resource?.resourceId !== olderId) return route.fallback();
        const response = lateResult === "success" ? await route.fetch() : null;
        reached();
        await held;
        if (response) await route.fulfill({ response });
        else await route.fulfill({ status: 503, json: { code: "gateway_unavailable" } });
      });
      await loadRecord(page);
      await entered;
      await expect(page.locator("#obligationDetailContent")).toBeHidden();
      await page.evaluate(event => {
        const listeners = window.__ipoWalletFixture.providers[0].provider.listeners.get(event);
        if (!listeners?.size) throw new Error("Provider event listener unavailable");
        for (const listener of listeners) listener(event === "accountsChanged" ? ["0x2222222222222222222222222222222222222222"] : "0x61");
      }, event);
      await expect(page.locator("body")).toHaveClass(/private-session-closed/);
      release();
      await page.waitForFunction(() => window.__recoveryLateBodyConsumed === true);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      await expect(page.locator("#obligationDetailContent")).toBeHidden();
      await expect(page.locator("#ownedObligationId")).toHaveValue("");
      await expect(page.locator("#privateCreditOutstanding")).toHaveText("—");
      expect(await page.evaluate(() => sessionStorage.getItem("ipo-one-owned-obligation-id.v1"))).toBeNull();
      await expect(page.locator("#ownedObligationRestoreHelper")).not.toContainText("Obligation read failed");
      expect(guard.writes).toEqual([]);
    });
  }
}

test("Principal has the same visible read-only entry and rejects a different Agent Subject", async ({ page }) => {
  const guard = await queryGuard(page);
  await openRecovery(page, principalOrigin);
  const selected = await page.locator("#ownedObligationId").inputValue();
  expect(selected).not.toBe("");
  await loadRecord(page, selected);
  await expect(page.locator("#ownedObligationRestoreHelper")).toContainText("Current server state loaded");
  const historicalId = `${selected}_historical`;
  await page.route("**/tenant/v1/operations", async route => {
    const command = route.request().postDataJSON();
    if (command.operationId !== "pilotReadOwnObligation" || command.resource?.resourceId !== historicalId) return route.fallback();
    const response = await route.fetch({ postData: JSON.stringify({ ...command,
      resource: { resourceType: "obligation", resourceId: selected } }) });
    const result = await response.json();
    const obligation = result.response.obligation;
    const priorOldest = obligation.oldestUnpaidInstallmentId;
    obligation.obligationId = historicalId;
    obligation.installments.forEach((item, index) => {
      const originalId = item.installmentId;
      item.obligationId = historicalId;
      item.installmentId = `${historicalId}_installment_${index + 1}`;
      if (originalId === priorOldest) obligation.oldestUnpaidInstallmentId = item.installmentId;
    });
    await route.fulfill({ response, json: result });
  });
  await loadRecord(page, historicalId);
  await expect(page.locator("#obligationDetailAuthorityId")).toHaveAttribute("title", historicalId);
  await page.reload();
  await expect(page.locator("#obligationDetailAuthorityId")).toHaveAttribute("title", historicalId);
  await page.getByText("Find an older record by ID", { exact: true }).click();
  const foreignId = "obligation_other_agent_owned_by_principal";
  await page.route("**/tenant/v1/operations", async route => {
    const command = route.request().postDataJSON();
    if (command.resource?.resourceId !== foreignId) return route.fallback();
    const response = await route.fetch({ postData: JSON.stringify({ ...command,
      resource: { resourceType: "obligation", resourceId: selected } }) });
    const result = await response.json();
    result.response.obligation.subjectId = "subject_other_agent";
    await route.fulfill({ response, json: result });
  });
  await loadRecord(page, foreignId);
  await expect(page.locator("#ownedObligationRestoreHelper")).toHaveText("Owner access is required or the Obligation is unavailable.");
  await expect(page.locator("#obligationDetailContent")).toBeHidden();
  expect(guard.writes).toEqual([]);
});

for (const drift of ["different record", "older trusted time"]) {
  test(`${drift} response cannot restore a selected balance or Evidence`, async ({ page }) => {
    const guard = await queryGuard(page);
    await openRecovery(page);
    await loadRecord(page);
    await expect(page.locator("#obligationDetailAuthorityId")).toHaveAttribute("title", olderId);
    await page.locator("#obligationDetailEvidenceBtn").click();
    await expect(page.locator("#ownedEvidenceCount")).not.toHaveText("0");
    await page.route("**/tenant/v1/operations", async route => {
      const command = route.request().postDataJSON();
      if (command.operationId !== "pilotReadOwnObligation" || command.resource.resourceId !== olderId) return route.fallback();
      const response = await route.fetch();
      const result = await response.json();
      if (drift === "different record") result.response.obligation.obligationId = "obligation_response_mismatch";
      else result.response.asOf = "2000-01-01T00:00:00.000Z";
      await route.fulfill({ response, json: result });
    });
    await page.getByRole("button", { name: "Load record", exact: true }).click();
    await expect(page.locator("#ownedObligationRestoreHelper")).toContainText("Obligation read failed");
    await expect(page.locator("#privateCreditOutstanding")).toHaveText("—");
    await expect(page.locator("#obligationDetailContent")).toBeHidden();
    await expect(page.locator("#ownedEvidenceCount")).toHaveText("0");
    expect(guard.writes).toEqual([]);
  });
}
