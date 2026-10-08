import { test, expect } from "@playwright/test";

async function openWallet(page, { chain = 56, mode = "reject_signature", wallet = "OKX Wallet", width = 1440, theme = "light" } = {}) {
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(({ mode, wallet, theme }) => {
    localStorage.setItem("ipo-one-theme", theme);
    const listeners = new Map();
    let account = "0x1111111111111111111111111111111111111111";
    let chain = "0x14a34";
    window.__walletRequests = [];
    window.__emitWallet = (event, value) => { for (const fn of listeners.get(event) ?? []) fn(value); };
    window.__setWalletAccount = value => {
      account = value;
      window.__emitWallet("accountsChanged", [account]);
    };
    const provider = {
      on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); },
      removeListener(event, fn) { listeners.get(event)?.delete(fn); },
      async request(input) {
        window.__walletRequests.push(input);
        if (input.method === "eth_requestAccounts") {
          if (mode === "pending") return new Promise(resolve => { window.__releaseWallet = () => resolve([account]); });
          if (mode === "reject" || mode === "busy" || mode === "disconnected" || mode === "restricted") {
            const code = { reject: 4001, busy: -32002, disconnected: 4900, restricted: 403 }[mode];
            throw Object.assign(new Error(mode === "restricted" ? "Wallet service is restricted in your jurisdiction" : "Provider refused request"), { code });
          }
          return [account];
        }
        if (input.method === "eth_accounts") return [account];
        if (input.method === "eth_chainId") return chain;
        if (input.method === "wallet_switchEthereumChain") {
          if (mode === "add_chain") throw Object.assign(new Error("Unknown chain"), { code: 4902 });
          chain = input.params[0].chainId;
          window.__emitWallet("chainChanged", chain);
          return null;
        }
        if (input.method === "wallet_addEthereumChain") {
          chain = input.params[0].chainId;
          window.__emitWallet("chainChanged", chain);
          return null;
        }
        if (input.method === "personal_sign") {
          if (mode === "pending_signature") return new Promise(resolve => { window.__releaseSignature = () => resolve(`0x${"11".repeat(65)}`); });
          throw Object.assign(new Error("Synthetic user refused signing"), { code: 4001 });
        }
        throw new Error(`Unexpected test request ${input.method}`);
      }
    };
    if (wallet === "Binance Wallet") window.binancew3w = { ethereum: provider };
    else window.addEventListener("eip6963:requestProvider", () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
      detail: { provider, info: { uuid: "12345678-1234-4234-9234-123456789012", name: wallet, rdns: "com.okx.wallet", icon: "data:image/png;base64,iVBORw0KGgo=" } }
    })));
  }, { mode, wallet, theme });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Open IPO.ONE", exact: true }).first().click();
  await page.locator("#walletProviderList button").filter({ hasText: wallet }).click();
  await page.locator(`[data-wallet-chain="${chain}"]`).click();
  return errors;
}

for (const chain of [56, 97]) {
  for (const wallet of ["OKX Wallet", "Binance Wallet"]) for (const [width, theme] of [[1440, "light"], [1440, "dark"], [390, "light"], [390, "dark"]]) {
    test(`${wallet} connects exact BNB ${chain} through visible ${width} ${theme} clicks before synthetic signature rejection`, async ({ page }) => {
      const errors = await openWallet(page, { chain, wallet, width, theme });
      let challenge;
      let verifies = 0;
      await page.route("**/auth/v1/wallet/challenge", route => {
        challenge = route.request().postDataJSON();
        return route.fulfill({ status: 201, json: { handle: "local_fixture_only", message: "Local synthetic sign-in fixture; no real signature" } });
      });
      page.on("request", request => { if (request.url().endsWith("/auth/v1/wallet/verify")) verifies++; });
      await page.locator("#walletSignInBtn").click();
      await expect(page.locator("#accessAuthStatus")).toContainText("Wallet request rejected");
      await expect(page.locator("#walletSignInBtn")).toBeEnabled();
      expect(challenge.chainId).toBe(chain);
      expect(challenge.workspaceRole).toBe("human_borrower");
      const requests = await page.evaluate(() => window.__walletRequests);
      expect(requests.find(value => value.method === "wallet_switchEthereumChain").params).toEqual([{ chainId: `0x${chain.toString(16)}` }]);
      expect(requests.filter(value => value.method === "personal_sign")).toHaveLength(1);
      expect(requests.some(value => /sendTransaction|sendCalls|signTransaction/.test(value.method))).toBe(false);
      expect(verifies).toBe(0);
      expect(errors).toEqual([]);
      expect(await page.locator(".access-dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.locator(".access-dialog").screenshot({ path: `output/wallet-sign-in/${wallet.split(" ")[0]}-${chain}-${width}-${theme}.png` });
    });
  }

  test(`BNB ${chain} pending popup times out, duplicates are suppressed and late approval is discarded`, async ({ page }) => {
    const errors = await openWallet(page, { chain, mode: "pending" });
    await page.clock.install();
    const button = page.locator("#walletSignInBtn");
    await button.click();
    const box = await button.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator("#accessAuthStatus")).toContainText("Open your wallet extension");
    expect(await page.evaluate(() => window.__walletRequests.length)).toBe(1);
    await page.clock.fastForward(60_001);
    await expect(button).toBeEnabled();
    await expect(page.locator("#accessAuthStatus")).toContainText("wallet has not responded");
    await page.evaluate(() => window.__releaseWallet());
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.__walletRequests.length)).toBe(1);
    expect(errors).toEqual([]);
  });

  for (const action of ["close", "escape", "disconnect"]) test(`BNB ${chain} ${action} interrupts pending account approval`, async ({ page }) => {
    await openWallet(page, { chain, mode: "pending" });
    await page.locator("#walletSignInBtn").click();
    if (action === "close") await page.locator("#accessCloseBtn").click();
    else if (action === "escape") await page.keyboard.press("Escape");
    else await page.evaluate(() => window.__emitWallet("disconnect", { code: 4900 }));
    await page.evaluate(() => window.__releaseWallet());
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.__walletRequests.length)).toBe(1);
    if (action !== "disconnect") await page.getByRole("button", { name: "Open IPO.ONE", exact: true }).first().click();
    await expect(page.locator("#walletSignInBtn")).toBeEnabled();
    await expect(page.locator("#accessAuthStatus")).toContainText("interrupted");
  });

  test(`BNB ${chain} reviewed add-chain recovery reaches connection without transactions`, async ({ page }) => {
    await openWallet(page, { chain, mode: "add_chain" });
    await page.locator("#walletSignInBtn").click();
    await expect(page.locator("#accessAuthStatus")).toContainText("Local review stops before signing");
    const requests = await page.evaluate(() => window.__walletRequests);
    expect(requests.find(value => value.method === "wallet_addEthereumChain").params[0].chainId).toBe(`0x${chain.toString(16)}`);
    expect(requests.some(value => value.method === "personal_sign")).toBe(false);
  });
}

for (const [mode, message] of [["reject", "Wallet request rejected"], ["busy", "already open"], ["disconnected", "disconnected"], ["restricted", "restricted in your jurisdiction"]]) {
  test(`${mode} provider failure explains recovery and preserves restrictions`, async ({ page }) => {
    await openWallet(page, { mode });
    await page.locator("#walletSignInBtn").click();
    await expect(page.locator("#accessAuthStatus")).toContainText(message);
    await expect(page.locator("#walletSignInBtn")).toBeEnabled();
    expect(await page.evaluate(() => window.__walletRequests.length)).toBe(1);
  });
}

for (const mode of ["account", "chain"]) test(`${mode} changes during challenge preparation prevent a signing request`, async ({ page }) => {
  await openWallet(page);
  await page.route("**/auth/v1/wallet/challenge", async route => {
    await page.evaluate(mode => window.__emitWallet(mode === "account" ? "accountsChanged" : "chainChanged", mode === "account" ? [] : "0x61"), mode);
    await route.fulfill({ status: 201, json: { handle: "stale", message: "Stale synthetic challenge" } });
  });
  await page.locator("#walletSignInBtn").click();
  await expect(page.locator("#accessAuthStatus")).toContainText("interrupted");
  expect(await page.evaluate(() => window.__walletRequests.some(value => value.method === "personal_sign"))).toBe(false);
});

test("no wallet retains rediscovery guidance and cannot issue a challenge", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open IPO.ONE", exact: true }).first().click();
  await expect(page.locator("#walletUnavailablePanel")).toBeVisible();
  await expect(page.locator("#rediscoverWalletsBtn")).toBeEnabled();
  await expect(page.locator("#walletSignInBtn")).toBeHidden();
});

for (const chain of [56, 97]) for (const failure of ["service_error", "service_timeout"]) {
  test(`BNB ${chain} ${failure} cannot advance to a signing prompt`, async ({ page }) => {
    await openWallet(page, { chain });
    await page.clock.install();
    let challengeStarted = false;
    await page.route("**/auth/v1/wallet/challenge", route => {
      challengeStarted = true;
      if (failure === "service_timeout") return new Promise(() => {});
      return route.fulfill({ status: 503, json: { code: "authentication_unavailable", detail: "Sign-in service unavailable" } });
    });
    await page.locator("#walletSignInBtn").click();
    await expect.poll(() => challengeStarted).toBe(true);
    if (failure === "service_timeout") await page.clock.fastForward(20_001);
    await expect(page.locator("#walletSignInBtn")).toBeEnabled();
    await expect(page.locator("#accessAuthStatus")).toContainText(failure === "service_timeout" ? "sign-in service has not responded" : "Sign-in service unavailable");
    expect(await page.evaluate(() => window.__walletRequests.some(value => value.method === "personal_sign"))).toBe(false);
  });
}

test("an older interrupted attempt cannot unlock a newer pending attempt", async ({ page }) => {
  await openWallet(page, { mode: "pending" });
  await page.locator("#walletSignInBtn").click();
  const firstRelease = await page.evaluateHandle(() => window.__releaseWallet);
  await page.locator("#accessCloseBtn").click();
  await page.getByRole("button", { name: "Open IPO.ONE", exact: true }).first().click();
  await page.locator("#walletSignInBtn").click();
  await firstRelease.evaluate(fn => fn());
  await expect(page.locator("#walletSignInBtn")).toBeDisabled();
  expect(await page.evaluate(() => window.__walletRequests.filter(value => value.method === "eth_requestAccounts").length)).toBe(2);
  await page.locator("#accessCloseBtn").click();
});

for (const chain of [56, 97]) test(`BNB ${chain} a late synthetic signature after timeout cannot be verified`, async ({ page }) => {
  await openWallet(page, { chain, mode: "pending_signature" });
  await page.clock.install();
  let verifies = 0;
  page.on("request", request => { if (request.url().endsWith("/auth/v1/wallet/verify")) verifies++; });
  await page.route("**/auth/v1/wallet/challenge", route => route.fulfill({ status: 201, json: { handle: "local_fixture_only", message: "No real signing; synthetic pending-response test" } }));
  await page.locator("#walletSignInBtn").click();
  await expect(page.locator("#accessAuthStatus")).toContainText("Review the one-use sign-in message");
  await expect.poll(() => page.evaluate(() => typeof window.__releaseSignature)).toBe("function");
  await page.clock.fastForward(120_001);
  await expect(page.locator("#walletSignInBtn")).toBeEnabled();
  await expect(page.locator("#accessAuthStatus")).toContainText("wallet has not responded");
  await page.evaluate(() => window.__releaseSignature());
  await page.waitForTimeout(50);
  expect(verifies).toBe(0);
});

for (const chain of [56, 97]) test(`OKX BNB ${chain} account switching binds the next challenge to the new account`, async ({ page }) => {
  await openWallet(page, { chain });
  const challenges = [];
  await page.route("**/auth/v1/wallet/challenge", route => {
    challenges.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { handle: "local_fixture_only", message: "Synthetic account isolation test" } });
  });
  await page.locator("#walletSignInBtn").click();
  await expect(page.locator("#accessAuthStatus")).toContainText("Wallet request rejected");
  await page.evaluate(() => window.__setWalletAccount("0x2222222222222222222222222222222222222222"));
  await page.locator("#walletSignInBtn").click();
  await expect.poll(() => challenges.length).toBe(2);
  await expect(page.locator("#accessAuthStatus")).toContainText("Wallet request rejected");
  expect(challenges.map(value => value.address)).toEqual([
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222"
  ]);
  expect(challenges.every(value => value.chainId === chain && value.workspaceRole === "human_borrower")).toBe(true);
  const signatureAccounts = await page.evaluate(() => window.__walletRequests.filter(value => value.method === "personal_sign").map(value => value.params[1]));
  expect(signatureAccounts).toEqual(challenges.map(value => value.address));
});
