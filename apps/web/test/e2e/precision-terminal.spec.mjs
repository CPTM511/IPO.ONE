import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

test("Principal authority preserves the original controls and activates only the exact reviewed Mandate", async ({ page }) => {
  const failures = [];
  page.on("pageerror", error => failures.push(error.message));
  await page.goto("http://127.0.0.1:4179/?preview_data=fixture#agent-console");
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await expect(page.locator("#principalAuthoritySurface")).toBeVisible();
  await expect(page.locator("#humanGuide")).toBeHidden();
  await expect(page.locator("#precisionAuthorityTerms")).toBeVisible();
  await expect(page.locator('[data-authority="relationship"]')).toHaveText("Prepares authority for");
  await expect(page.locator('[data-authority="aggregate"]')).toHaveText("$500.00");
  await page.locator("#openAgentApplicationHandoffBtn").click();
  await expect(page.locator("#agentOnlineRunBtn")).toHaveText("Review and activate this Mandate");
  await page.locator("#agentOnlineRunBtn").click();
  await expect(page.locator("#activateMandateBtn")).toBeDisabled();
  await page.locator("#principalMandateAcknowledge").check();
  await expect(page.locator("#activateMandateBtn")).toBeEnabled();
  await mkdir("output/playwright/web-027", { recursive: true });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1024 });
    for (const theme of ["dark", "light"]) {
      await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
      const widthState = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      expect(widthState.content).toBeLessThanOrEqual(widthState.viewport + 1);
      await expect(page.locator("#activateMandateBtn")).toBeEnabled();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `output/playwright/web-027/authority-${width}-${theme}.png` });
    }
  }
  await page.locator("#activateMandateBtn").click();
  await expect(page.locator("#mandateReviewStatus")).toHaveText("Active");
  await expect(page.locator('[data-authority="relationship"]')).toHaveText("Authorizes");
  await expect(page.locator("#continueAgentCreditBtn")).toBeVisible();
  await page.locator("#continueAgentCreditBtn").click();
  await expect(page.locator('[data-view-panel="agent-console"]')).toBeVisible();
  await page.locator("#agentOnlineRunBtn").click();
  await expect(page.locator("#agentOnlineStatus")).toHaveText("Lifecycle verified");
  await page.reload();
  await expect(page.locator("#agentOnlineRunBtn")).toHaveText("Verify Agent Evidence");
  const repeatedGoals = [];
  page.on("request", request => {
    if (request.url().endsWith("/local/v1/reference-agent/runtime")) repeatedGoals.push(request.url());
  });
  await page.locator("#agentOnlineRunBtn").click();
  await expect(page.locator("#agentOnlineStatus")).toHaveText("Lifecycle verified");
  await expect(page.locator("#agentOnlineReviewBtn")).toBeVisible();
  expect(repeatedGoals).toEqual([]);
  expect(failures).toEqual([]);
});

test("All original identified controls survive the redesign without duplicate IDs", async ({ page }) => {
  const baseline = JSON.parse(await readFile("docs/design/web-027/baseline-controls.json", "utf8"));
  await page.goto("http://127.0.0.1:4179/?preview_data=fixture#agent-console");
  const ids = await page.locator("[id]").evaluateAll(nodes => nodes.map(node => node.id));
  for (const item of baseline.controls.filter(item => item.id)) {
    expect(ids.filter(id => id === item.id), `Preserved control ${item.id}`).toHaveLength(1);
  }
  // Structural preservation complements clicks; it never proves usability.
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await page.locator("#principalApplicationDetails > summary").click();
  await expect(page.locator("#agentRequestPrimaryBtn")).toBeVisible();
});


test("Starting another Human request leads to fresh Consent without losing the current credit plan", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/?preview_data=fixture#request-credit");
  await expect(page.locator("#humanGuidePrimaryBtn")).toHaveText("Review next payment");
  const outstanding = await page.locator('[data-summary="outstanding"]').innerText();
  await page.locator("#humanGuideSecondaryBtn").click();
  await expect(page.locator("#humanGuidePrimaryBtn")).toHaveText("Create scoped Consent");
  await expect(page.locator("#submitHumanCreditBtn")).toBeDisabled();
  await expect(page.locator('[data-summary="outstanding"]')).toHaveText(outstanding);
  await page.locator("#humanGuideSecondaryBtn").click();
  await expect(page.locator("#humanGuidePrimaryBtn")).toHaveText("Review next payment");
  await expect(page.locator('[data-summary="outstanding"]')).toHaveText(outstanding);
});
