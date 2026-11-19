import { expect, test } from "@playwright/test";
import { translateCopy } from "../../src/product-i18n.js";
import { agentSteps } from "../../src/web-009-public-review.js";

const headings = {
  "#web009AgentTitle": "How an AI agent gets working capital.",
  "#web009InterfacesTitle": "Two interfaces. One credit system.",
  "#web009ProgressTitle": "A settled outcome becomes useful credit history.",
  "#web009CapitalTitle": "Capital providers set the terms.",
  "#web009DevelopersTitle": "One lifecycle, available through every interface.",
  "#web009TrustTitle": "Models can recommend. Approved policy authorizes.",
  "#web009ClosingTitle": "Turn performance into your next capital opportunity."
};
const languages = ["zh", "es", "fr", "ru", "vi", "en"];
const localized = (source, language) => translateCopy(source, language).text;

async function expectCompleteCopy(page) {
  // Allow one pass for the DOM observer and the next frame for the resulting layout.
  const audit = await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return (await import("/product-localization.js")).productLocalizationAudit();
  });
  expect(audit.missing, `Remaining owned copy in ${audit.language}`).toEqual([]);
}

for (const width of [390, 1440]) {
  test(`the published homepage stays localized through demo interactions at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("http://127.0.0.1:4178/");
    const selector = page.locator("#publicProductLanguage");
    await expect(selector).toBeVisible();
    const lifecycleState = page.locator(".b-state-select select");
    const lifecycleCard = page.locator(".b-lifecycle");
    const example = page.locator("[data-web009-code-panel]");

    for (const language of languages) {
      await selector.selectOption(language);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      for (const [heading, source] of Object.entries(headings)) {
        await expect(page.locator(heading)).toHaveText(localized(source, language));
      }
      await expect(page.locator(".web011-public-footer").getByRole("link", { name: localized("Whitepaper", language), exact: true })).toBeVisible();
      if (width === 390) {
        await page.locator(".web011-mobile-nav summary").click();
        await expect(page.locator(".b-menu-close")).toHaveText(localized("Close menu", language));
        await page.keyboard.press("Escape");
      }

      const hero = page.locator(".b-hero-stage");
      const accountablePrincipal = localized("Accountable Principal", language);
      await expect(hero.locator(".b-identity").getByText(accountablePrincipal, { exact: true })).toBeVisible();
      await expect(lifecycleCard.locator(".b-identity").getByText(accountablePrincipal, { exact: true })).toBeVisible();
      const heroDetails = hero.locator("[data-b-evidence-detail]");
      if (!(await heroDetails.isVisible())) await hero.locator("[data-b-evidence-toggle]").click();
      await expect(heroDetails.getByText(localized("About this example", language), { exact: true })).toBeVisible();
      for (const button of await hero.locator("[data-b-hero-state]").all()) {
        await button.click();
        await expectCompleteCopy(page);
      }

      for (const [index, step] of agentSteps.entries()) {
        await lifecycleState.selectOption(String(index));
        await expect(lifecycleCard.locator("[data-b-step-title]")).toHaveText(localized(step.title, language));
        await expect(lifecycleCard.locator("[data-b-pin-label]")).toHaveText(localized(`State ${index + 1} of 10`, language));
        await expect(lifecycleCard.locator("[data-web010-step-prohibited]")).toHaveText(localized(step.prohibited, language));
        if (index === 8) {
          await expect(lifecycleCard.locator('[data-b-term-label="0"]')).toHaveText(localized("Principal", language));
        }
        await expectCompleteCopy(page);
      }
      await page.locator('[data-web009-path="agent"]').click();
      await expect(page.locator("[data-web009-path-flow] li").first()).toContainText(accountablePrincipal);
      await expect(page.locator("[data-web009-path-note]"))
        .toHaveText(localized("An Agent begins with accountable Principal authority and a bounded execution plan.", language));
      await page.locator('[data-web009-rail="Stablecoin"]').click();
      await expect(page.locator("[data-web009-rail-value]")).toHaveText(localized("Stablecoin", language));
      await page.locator('[data-web009-code="rest"]').click();
      await expect(example).toContainText('"operationId": "pilotRequestCredit"');
      await page.locator('[data-web009-code="a2a"]').click();
      await expect(example).toContainText(localized("Use the current versioned capability catalog.", language));
      await expectCompleteCopy(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }

    await selector.selectOption("zh");
    await expect(lifecycleState).toHaveValue("9");
    await expect(page.locator('[data-web009-code="a2a"]')).toHaveAttribute("aria-selected", "true");
    await expect(example).toContainText("使用当前版本的能力目录。");
    await page.reload();
    await expect(selector).toHaveValue("zh");
    await expect(page.locator("#web009AgentTitle")).toHaveText("AI Agent 如何获得营运资金");
    await expectCompleteCopy(page);
  });
}

test("home playback does not reintroduce English with animations enabled", async ({ page }) => {
  // Start playback deliberately through visible controls.
  await page.addInitScript(() => {
    sessionStorage.setItem("ipo-one-web012b-hero-played", "1");
    sessionStorage.setItem("ipo-one-web012b-lifecycle-played", "1");
  });
  await page.goto("http://127.0.0.1:4178/");
  await page.locator("#publicProductLanguage").selectOption("zh");
  const replay = page.locator("[data-b-hero-play]");
  await replay.click();
  await expect(replay).toHaveText("跳过");
  await expectCompleteCopy(page);
  await replay.click();
  await expect(replay).toHaveText("重放");

  const play = page.locator("[data-b-play]");
  await expect(play).toHaveAttribute("title", "播放流程演示");
  await play.click();
  await expect(play).toHaveText("暂停");
  await expectCompleteCopy(page);
  await play.click();
  await expect(play).toHaveText("播放");
});
