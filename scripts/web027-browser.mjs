import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import { WORKSPACE_NAVIGATION_MANIFEST } from "../apps/web/src/workspace-surface-access.js";
import { createHash } from "node:crypto";

const out = "output/playwright/web-027";
const account = privateKeyToAccount(JSON.parse(await readFile("/Users/cptmao/Documents/IPO.ONE/.ipo-one/web026-runtime/isolated-qa-wallet.json", "utf8")).privateKey);
const build = JSON.parse(await readFile(out + "/candidate-runtime.json", "utf8"));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [], errors = [];
const actionEvidence = [];
async function click(page, selector) {
  const control = page.locator(selector);
  const label = await control.innerText();
  await control.click();
  actionEvidence.push({ selector, label, at: new Date().toISOString() });
}
async function humanLifecycle(page) {
  await click(page, "#humanGuideSecondaryBtn");
  await page.getByRole("button", { name: "Create scoped Consent", exact: true }).click();
  actionEvidence.push({ selector: "Create scoped Consent", label: "Create scoped Consent", at: new Date().toISOString() });
  await page.locator("#humanCreditAmount").fill("24.50");
  await writeFile(out + "/human-application-before-submit.txt", await page.locator("#mainContent").innerText());
  await expect(page.locator("#submitHumanCreditBtn")).toBeEnabled({ timeout: 5000 });
  await click(page, "#submitHumanCreditBtn");
  await expect(page.locator("#humanApplicationStatus")).toHaveText("Offer ready", { timeout: 20_000 });
  await page.locator("#humanOfferAcknowledge").check();
  await click(page, "#acceptHumanOfferBtn");
  if (await page.locator("#accessLayer").isVisible()) {
    await page.getByRole("button", { name: /WEB027 isolated test wallet/ }).click();
    if (await page.locator("#walletSignInBtn").isEnabled()) await page.locator("#walletSignInBtn").click();
    if (await page.locator("#accessLayer").isVisible()) await page.locator("#accessCloseBtn").click();
    await click(page, "#acceptHumanOfferBtn");
  }
  await expect(page.locator("#economicActionLayer")).toBeVisible();
  await click(page, "#economicActionConfirmBtn");
  await expect(page.locator("#humanObligationCard")).toBeVisible({ timeout: 20_000 });
  await click(page, "#executeHumanObligationBtn");
  await expect(page.locator("#economicActionLayer")).toBeVisible();
  await click(page, "#economicActionConfirmBtn");
  await expect(page.locator("#humanObligationExecution")).toContainText("Executed", { timeout: 20_000 });
  await page.locator("#humanRepaymentAmount").fill("2.50");
  await click(page, "#postHumanRepaymentBtn");
  await expect(page.locator("#economicActionLayer")).toBeVisible();
  await click(page, "#economicActionConfirmBtn");
  await expect(page.locator("#humanObligationRepaid")).toHaveText("$2.50", { timeout: 20_000 });
  await page.reload();
  await expect(page.locator("#humanObligationRepaid")).toHaveText("$2.50", { timeout: 20_000 });
  await page.screenshot({ path: out + "/durable-human-repayment.png" });
}
async function agentLifecycle(page) {
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  if (await page.locator("#createPrivateAgentSubjectBtn").isVisible()) {
    await page.locator("#agentAuthorityDisplayName").fill("WEB027 verification Agent");
    await click(page, "#createPrivateAgentSubjectBtn");
    await expect(page.locator("#createAccountChallengeBtn")).toBeVisible();
  }
  if (await page.locator("#createAccountChallengeBtn").isVisible()) {
    await click(page, "#createAccountChallengeBtn");
    await expect(page.locator("#proveAccountOnlineBtn")).toBeEnabled();
    await click(page, "#proveAccountOnlineBtn");
    await expect(page.locator("#agentAccountActivationStatus")).toContainText("active", { ignoreCase: true, timeout: 20_000 });
  }
  if (await page.locator("#createDraftMandateBtn").isVisible()) {
    await page.locator("#agentMandatePerActionLimit").fill("100");
    await page.locator("#agentMandateAggregateLimit").fill("500");
    await click(page, "#createDraftMandateBtn");
    await expect(page.locator("#agentAuthorityStatus")).toContainText("Draft", { timeout: 20_000 });
  }
  if ((await page.locator("#agentAuthorityStatus").innerText()).includes("Draft")) {
    await click(page, "#openAgentApplicationHandoffBtn");
    await expect(page.locator("#agentOnlineRunBtn")).toHaveText("Review and activate this Mandate", { timeout: 30_000 });
    await click(page, "#agentOnlineRunBtn");
    await expect(page.locator("#activateMandateBtn")).toBeDisabled();
    await page.locator("#principalMandateAcknowledge").check();
    await click(page, "#activateMandateBtn");
    await expect(page.locator("#agentAuthorityStatus")).toContainText("Active", { timeout: 20_000 });
  }
  await page.screenshot({ path: out + "/durable-agent-authority.png" });
  await click(page, "#continueAgentCreditBtn");
  if (await page.locator("#agentOnlineRunBtn").isVisible() && await page.locator("#agentOnlineRunBtn").isEnabled()) await click(page, "#agentOnlineRunBtn");
  await expect(page.locator("#agentOnlineReviewBtn")).toBeVisible({ timeout: 30_000 });
  await writeFile(out + "/durable-agent-result.txt", await page.locator("#mainContent").innerText());
  await page.screenshot({ path: out + "/durable-agent-result.png" });
  await click(page, "#agentOnlineReviewBtn");
  await expect(page.locator('[data-view-panel="obligations"]')).toBeVisible();
  await page.reload();
  await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated");
  await writeFile(out + "/durable-agent-obligation-restored.txt", await page.locator("#mainContent").innerText());
}
async function walletContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, reducedMotion: "reduce" });
  await context.exposeFunction("__web027QaSign", message => account.signMessage({ message: { raw: message } }));
  await context.addInitScript(({ address }) => {
    const provider = { async request({ method, params }) {
      if (["eth_requestAccounts", "eth_accounts"].includes(method)) return [address];
      if (method === "eth_chainId") return "0x14a34";
      if (["wallet_switchEthereumChain", "wallet_revokePermissions"].includes(method)) return null;
      if (method === "personal_sign") return window.__web027QaSign(params[0]);
      throw Object.assign(new Error("Test wallet rejects unsupported operations"), { code: 4200 });
    }, on() {}, removeListener() {} };
    window.addEventListener("eip6963:requestProvider", () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: {
      info: { uuid: "02702702-7000-4000-8000-000000000001", name: "WEB027 isolated test wallet", rdns: "local.web027.test", icon: "data:image/png;base64,iVBORw0KGgo=" }, provider
    } })));
  }, { address: account.address });
  return context;
}
async function login(page, port, role) {
  await page.goto(`http://127.0.0.1:${port}/#${role === "controller" ? "agent-console" : "request-credit"}`);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: /WEB027 isolated test wallet/ }).click();
  await page.locator("#walletSignInBtn").click();
  await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated", { timeout: 20_000 });
  await expect(page.locator("#accessLayer")).toBeHidden();
}
try {
  for (const [role, port] of [["borrower", 8935], ["controller", 8936]]) {
    const context = await walletContext();
    const page = await context.newPage();
    page.on("pageerror", error => errors.push({ role, message: error.message }));
    await login(page, port, role);
    const asset = await (await page.request.get(`http://127.0.0.1:${port}/app.js`)).body();
    expect(createHash("sha256").update(asset).digest("hex")).toBe(createHash("sha256").update(await readFile("apps/web/src/app.js")).digest("hex"));
    await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("dark");
    await page.screenshot({ path: `${out}/durable-${role}-entry.png` });
    const entry = await page.locator("#mainContent").innerText();
    await writeFile(`${out}/durable-${role}-entry.txt`, entry);
    if (process.argv[2] === "flow" && role === "borrower") await humanLifecycle(page);
    if (process.argv[2] === "agent" && role === "controller") {
      try { await agentLifecycle(page); } catch (error) {
        await writeFile(out + "/agent-failure.txt", await page.locator("body").innerText());
        await page.screenshot({ path: out + "/agent-failure.png" });
        throw error;
      }
    }
    if (role === "controller") {
      await page.getByRole("button", { name: "Agents", exact: true }).click();
      await writeFile(`${out}/durable-principal-authority.txt`, await page.locator("#mainContent").innerText());
    }
    const more = page.locator("#sidebarMoreBtn");
    if (await more.isVisible()) await more.click();
    const visited = [];
    for (const { viewId } of WORKSPACE_NAVIGATION_MANIFEST.workspaces[role].views) {
      await page.locator(`.nav-item[data-view="${viewId}"]`).click();
      await expect(page.locator(`[data-view-panel="${viewId}"]`)).toBeVisible();
      visited.push(viewId);
    }
    const defaultView = WORKSPACE_NAVIGATION_MANIFEST.workspaces[role].defaultView;
    await page.locator(`.nav-item[data-view="${defaultView}"]`).click();
    await page.reload();
    await expect(page.locator("#sidebarApiStatus")).toHaveText("Authenticated");
    await page.locator("#topbarSignOutBtn").click();
    await login(page, port, role);
    results.push({ role, port, signatureLogin: true, automaticEntry: true, refresh: true, relogin: true, clickedViews: visited, operations: "pending" });
    await context.close();
  }
  expect(errors).toEqual([]);
  const report = { source: build.source, mode: "local_no_funds", database: build.database, apiMocks: false, fixtureQuery: false, results, actionEvidence, errors, verdict: "PARTIAL — full capability acceptance pending" };
  await writeFile(`${out}/durable-${process.argv[2] ?? "navigation"}.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
