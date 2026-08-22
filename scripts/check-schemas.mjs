import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const schemaDirectory = join(process.cwd(), "schemas", "v2");
const requiredFiles = new Set([
  "access-grant.schema.json",
  "agent-credit-offer-workflow-receipt.schema.json",
  "agent-handoff-manifest.schema.json",
  "agent-pilot-capability-manifest.schema.json",
  "agent-sandbox-obligation-workflow-receipt.schema.json",
  "agentic-wallet-provider-capabilities.schema.json",
  "agentic-wallet-provider-descriptor.schema.json",
  "agentic-wallet-provider-request.schema.json",
  "agentic-wallet-provider-result.schema.json",
  "abuse-control-policy.schema.json",
  "aecl-phase5-multi-provider-conformance-evidence.schema.json",
  "approval-decision.schema.json",
  "approval-execution.schema.json",
  "approval-proposal.schema.json",
  "authentication-context.schema.json",
  "authentication-event.schema.json",
  "base-account-capability-observation.schema.json",
  "base-spend-permission-projection.schema.json",
  "authorization-audit-event.schema.json",
  "authorization-decision.schema.json",
  "break-glass-custodian-decision.schema.json",
  "break-glass-incident.schema.json",
  "break-glass-review.schema.json",
  "chain-finality-proof.schema.json",
  "chain-profile.schema.json",
  "circle-managed-execution-projection.schema.json",
  "circle-managed-wallet-capability-observation.schema.json",
  "capital-network-presentation.schema.json",
  "capital-partner-portfolio.schema.json",
  "capital-partner-profile.schema.json",
  "consent-record.schema.json",
  "credit-intent.schema.json",
  "credit-offer.schema.json",
  "credit-offer-v2.schema.json",
  "dual-native-lifecycle-synthetic-result.schema.json",
  "delegated-wallet-grant.schema.json",
  "evidence-event.schema.json",
  "execution-target-policy.schema.json",
  "external-wallet-permission-projection.schema.json",
  "fee-audit-policy.schema.json",
  "facility-view.schema.json",
  "human-identity-reference.schema.json",
  "human-credit-offer-workflow-receipt.schema.json",
  "human-sandbox-obligation-workflow-receipt.schema.json",
  "hyperliquid-info-account-snapshot.schema.json",
  "hypercore-account-binding.schema.json",
  "hypercore-api-wallet-delegate.schema.json",
  "hypercore-cancel-jit-venue-preflight-receipt.schema.json",
  "hypercore-delegate-tombstone.schema.json",
  "hypercore-execution-evidence.schema.json",
  "hypercore-official-signing-request.schema.json",
  "hypercore-prepared-action.schema.json",
  "hypercore-signing-request.schema.json",
  "hypercore-stable-cancel-intent.schema.json",
  "hypercore-stable-cancel-policy-constraint.schema.json",
  "hypercore-testnet-action-authorization.schema.json",
  "hypercore-testnet-exchange-result.schema.json",
  "hypercore-testnet-founder-approval.schema.json",
  "hypercore-testnet-proof-policy.schema.json",
  "hypercore-testnet-signer-handoff.schema.json",
  "hypercore-testnet-submission-attempt.schema.json",
  "hypercore-testnet-submission-transition.schema.json",
  "hyperliquid-testnet-protective-control.schema.json",
  "hyperliquid-testnet-execution-record.schema.json",
  "hyperliquid-testnet-facility-funding-record.schema.json",
  "hyperliquid-testnet-reconciliation-record.schema.json",
  "hyperliquid-testnet-settlement-record.schema.json",
  "hyperliquid-testnet-operability-assurance.schema.json",
  "ledger-transaction.schema.json",
  "mandate.schema.json",
  "membership.schema.json",
  "m2a-008-exact-deployment-decision.schema.json",
  "metamask-advanced-permission-projection.schema.json",
  "metamask-advanced-permission-response-comparison.schema.json",
  "metamask-agent-wallet-security-receipt.schema.json",
  "metamask-agentic-wallet-capability-observation.schema.json",
  "okx-agentic-wallet-capability-observation.schema.json",
  "okx-agentic-wallet-invocation-projection.schema.json",
  "okx-agentic-wallet-risk-receipt.schema.json",
  "okx-tee-execution-reference.schema.json",
  "operational-alert-policy.schema.json",
  "operational-alert-state.schema.json",
  "operational-alert.schema.json",
  "operational-signal.schema.json",
  "pending-exposure-reservation.schema.json",
  "prepared-execution.schema.json",
  "plugin-manifest.schema.json",
  "provider-intent-acknowledgement.schema.json",
  "provider-intent-view.schema.json",
  "provider-sandbox-callback.schema.json",
  "credit-passport-artifact.schema.json",
  "rail-descriptor.schema.json",
  "real-value-offline-review-attestation.schema.json",
  "real-value-pilot-decision-package.schema.json",
  "risk-decision.schema.json",
  "sandbox-obligation-portability-receipt.schema.json",
  "settlement-receipt.schema.json",
  "simulation-report.schema.json",
  "tenant-protocol-catalog.schema.json",
  "tenant-protocol-request.schema.json",
  "tenant-protocol-result.schema.json",
  "transfer-intent.schema.json",
  "transaction-preflight-receipt.schema.json",
  "transfer-quote.schema.json",
  "trading-capital-request.schema.json",
  "trading-facility.schema.json",
  "trading-facility-risk-evaluation.schema.json",
  "trading-match-proposal.schema.json",
  "trading-order-intent.schema.json",
  "trading-provider-mandate.schema.json",
  "trading-credit-assessment.schema.json",
  "trading-credit-challenger-report.schema.json",
  "trading-credit-outcome.schema.json",
  "trading-credit-prior-outcome-summary.schema.json",
  "trading-credit-proof-binding.schema.json",
  "trading-credit-supplemental-evidence.schema.json",
  "trading-real-credit-profile.schema.json",
  "v9-product-traceability.schema.json",
  "wallet-provider-registry.schema.json",
  "wallet-003-erc1271-deployment-decision.schema.json",
  "wallet-signature-verification.schema.json",
  "wallet-session-invalidation.schema.json"
]);
const failures = [];
const ids = new Set();
const files = (await readdir(schemaDirectory)).filter((file) => file.endsWith(".schema.json")).sort();

for (const requiredFile of requiredFiles) {
  if (!files.includes(requiredFile)) failures.push(`missing schema: ${requiredFile}`);
}

for (const file of files) {
  let schema;
  try {
    schema = JSON.parse(await readFile(join(schemaDirectory, file), "utf8"));
  } catch (error) {
    failures.push(`${file} is not valid JSON: ${error.message}`);
    continue;
  }
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    failures.push(`${file} must use JSON Schema draft 2020-12`);
  }
  if (typeof schema.$id !== "string" || !schema.$id.startsWith("https://schemas.ipo.one/v2/")) {
    failures.push(`${file} has an invalid canonical $id`);
  } else if (ids.has(schema.$id)) {
    failures.push(`${file} duplicates schema id ${schema.$id}`);
  } else {
    ids.add(schema.$id);
  }
  if (schema.type !== "object" || schema.additionalProperties !== false) {
    failures.push(`${file} must be a closed top-level object schema`);
  }
  if (!schema.required?.includes("schemaVersion") || typeof schema.properties?.schemaVersion?.const !== "string") {
    failures.push(`${file} must require a constant schemaVersion`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Schema checks passed (${files.length} contracts).`);
