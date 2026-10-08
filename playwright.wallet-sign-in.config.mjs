import { defineConfig } from "@playwright/test";

const origin = `http://127.0.0.1:${Number(process.env.IPO_ONE_WALLET_REVIEW_PORT ?? 42919)}`;
export default defineConfig({
  testDir: "./apps/web/test/e2e",
  testMatch: "wallet-sign-in-local.spec.mjs",
  workers: 1, retries: 0, forbidOnly: true,
  reporter: [["line"], ["json", { outputFile: "output/wallet-sign-in/results.json" }]],
  outputDir: "output/wallet-sign-in/browser",
  use: { baseURL: origin, headless: true, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: "node apps/web/test/support/wallet-sign-in-browser-host.mjs",
    url: `${origin}/`, reuseExistingServer: false, timeout: 30_000
  }
});
