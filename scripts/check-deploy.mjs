import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [dockerfile, dockerignore, service, workflow, packageJson, nodeVersion] = await Promise.all([
  source("Dockerfile"),
  source(".dockerignore"),
  source("deploy/gcp/cloud-run-service.yaml.tmpl"),
  source(".github/workflows/quality.yml"),
  source("package.json"),
  source(".node-version")
]);

assert.match(dockerfile, /node:24\.18\.0-bookworm-slim@sha256:[a-f0-9]{64}/);
assert.match(dockerfile, /gcr\.io\/distroless\/nodejs24-debian13:nonroot@sha256:[a-f0-9]{64}/);
assert.match(dockerfile, /^USER 65532:65532$/m);
assert.match(dockerfile, /^HEALTHCHECK /m);
assert.match(dockerfile, /^ENTRYPOINT \["\/nodejs\/bin\/node"\]$/m);
assert.match(dockerfile, /pnpm install --frozen-lockfile --prod --ignore-scripts/);
assert.doesNotMatch(dockerfile, /IPO_ONE_PUBLIC_SANDBOX_ACK=/);

for (const requiredIgnore of [".git", ".env", "node_modules", "docs", "security"]) {
  assert.match(dockerignore, new RegExp(`^${requiredIgnore.replace(".", "\\.")}$`, "m"));
}

for (const requiredSetting of [
  "run.googleapis.com/default-url-disabled: \"true\"",
  "run.googleapis.com/ingress: internal-and-cloud-load-balancing",
  "IPO_ONE_DEPLOYMENT_MODE",
  "I_UNDERSTAND_NO_REAL_FUNDS",
  "IPO_ONE_TRUST_PROXY",
  "https://ipo.one",
  "startupProbe:",
  "livenessProbe:",
  "readinessProbe:",
  "serviceAccountName: ${SERVICE_ACCOUNT_EMAIL}",
  "image: ${IMAGE_URI}"
]) {
  assert.ok(service.includes(requiredSetting), `missing deployment guard: ${requiredSetting}`);
}
assert.doesNotMatch(service, /(PASSWORD|PRIVATE_KEY|API_TOKEN|DATABASE_URL)/);
assert.match(workflow, /postgres:17\.10-alpine3\.23@sha256:[a-f0-9]{64}/);
assert.equal(/uses:\s+[^\s]+@v\d/.test(workflow), false, "GitHub Actions must use immutable commits");

const manifest = JSON.parse(packageJson);
assert.equal(manifest.engines?.node, ">=24.18.0 <25");
assert.equal(nodeVersion.trim(), "24.18.0");

console.log("Deployment artifacts satisfy the public-sandbox baseline.");
