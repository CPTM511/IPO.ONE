import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/test/e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["line"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node apps/web/test/support/human-lifecycle-browser-host.mjs",
    env: {
      ...process.env,
      IPO_ONE_BROWSER_QA_PORT: "4173"
    },
    url: "http://127.0.0.1:4173/tenant/v1/healthz",
    reuseExistingServer: false,
    timeout: 30_000
  }
});
