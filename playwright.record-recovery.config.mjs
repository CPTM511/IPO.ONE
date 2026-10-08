import { defineConfig } from "@playwright/test";

const humanPort = process.env.IPO_ONE_RECOVERY_REVIEW_PORT ?? "42931";
const principalPort = process.env.IPO_ONE_RECOVERY_PRINCIPAL_PORT ?? "42932";
export default defineConfig({
  testDir: "./apps/web/test/e2e", testMatch: "record-recovery-local.spec.mjs",
  workers: 1, retries: 0, forbidOnly: true,
  reporter: [["line"], ["json", { outputFile: "output/record-recovery/results.json" }]],
  outputDir: "output/record-recovery/browser",
  use: { baseURL: `http://127.0.0.1:${humanPort}`, headless: true,
    screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: [
    { command: "node apps/web/test/support/human-lifecycle-browser-host.mjs",
      env: { ...process.env, IPO_ONE_BROWSER_QA_PORT: humanPort, IPO_ONE_BROWSER_QA_RECOVERY_REVIEW: "1" },
      url: `http://127.0.0.1:${humanPort}/tenant/v1/healthz`, reuseExistingServer: false, timeout: 30_000 },
    { command: "node apps/web/test/support/agent-console-browser-host.mjs",
      env: { ...process.env, IPO_ONE_BROWSER_QA_PORT: principalPort,
        IPO_ONE_BROWSER_QA_AGENT_RECOVERY_SCENARIO: "active-obligation-no-receipt" },
      url: `http://127.0.0.1:${principalPort}/tenant/v1/healthz`, reuseExistingServer: false, timeout: 30_000 }
  ]
});
