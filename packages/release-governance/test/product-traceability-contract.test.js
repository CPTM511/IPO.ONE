import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXPECTED_ENABLED_RELEASE_PROFILES,
  validateExactTenantCatalogCoverage,
  validateTraceabilityReleaseMaturity
} from "../../../scripts/product-traceability-contract.mjs";

function launchPolicy() {
  return {
    profiles: {
      public_sandbox: {
        releaseEnabled: true,
        capabilities: {
          realFundsEnabled: false,
          humanCreditEnabled: false,
          externalProviderExecutionEnabled: false
        }
      },
      closed_non_funds_pilot: { releaseEnabled: false, capabilities: {} },
      live_testnet_secured_pool: {
        releaseEnabled: true,
        environment: "live-testnet-secured-pool",
        capabilities: {
          realFundsEnabled: false,
          humanCreditEnabled: false,
          testAssetsEnabled: true,
          securedPoolEnabled: true,
          publicPoolParticipationEnabled: true,
          marketCreationEnabled: false,
          externalProviderExecutionEnabled: false,
          agentVenueExecutionEnabled: false
        },
        exactProfile: {
          chainId: "eip155:84532",
          realValueClassification: "test_assets_only"
        }
      },
      controlled_agent_credit_pilot: { releaseEnabled: false, capabilities: {} }
    }
  };
}

function maturity() {
  return {
    enabledReleaseProfiles: [...EXPECTED_ENABLED_RELEASE_PROFILES],
    closedPilotReleaseEnabled: false,
    controlledCreditReleaseEnabled: false
  };
}

test("traceability admits only the exact reviewed sandbox and Base Sepolia profiles", () => {
  assert.deepEqual(
    validateTraceabilityReleaseMaturity({ launchPolicy: launchPolicy(), releaseMaturity: maturity() }),
    []
  );
});

test("traceability fails closed for an extra, missing, or reordered profile", () => {
  const extra = launchPolicy();
  extra.profiles.controlled_agent_credit_pilot.releaseEnabled = true;
  assert.match(
    validateTraceabilityReleaseMaturity({ launchPolicy: extra, releaseMaturity: maturity() }).join("\n"),
    /enabled-profile set drifted/
  );

  const missing = launchPolicy();
  missing.profiles.live_testnet_secured_pool.releaseEnabled = false;
  assert.match(
    validateTraceabilityReleaseMaturity({ launchPolicy: missing, releaseMaturity: maturity() }).join("\n"),
    /enabled-profile set drifted/
  );

  const reordered = maturity();
  reordered.enabledReleaseProfiles.reverse();
  assert.match(
    validateTraceabilityReleaseMaturity({ launchPolicy: launchPolicy(), releaseMaturity: reordered }).join("\n"),
    /enabled release profiles drifted/
  );
});

test("traceability retains the Base Sepolia test-assets and no-write boundary", () => {
  const expanded = launchPolicy();
  expanded.profiles.live_testnet_secured_pool.capabilities.realFundsEnabled = true;
  expanded.profiles.live_testnet_secured_pool.capabilities.agentVenueExecutionEnabled = true;
  assert.match(
    validateTraceabilityReleaseMaturity({ launchPolicy: expanded, releaseMaturity: maturity() }).join("\n"),
    /Testnet safety boundary drifted/
  );
});

test("traceability requires exact binding and action coverage for the closed catalog", () => {
  const catalogIds = ["alpha", "beta", "gamma"];
  assert.deepEqual(validateExactTenantCatalogCoverage({
    catalogIds,
    bindingIds: catalogIds,
    classifiedCatalogIds: catalogIds
  }), []);

  assert.deepEqual(validateExactTenantCatalogCoverage({
    catalogIds,
    bindingIds: ["alpha", "beta"],
    classifiedCatalogIds: ["alpha", "beta", "extra"]
  }), [
    "operation bindings must cover the exact closed Tenant catalog",
    "REAL_LOCAL V9 actions must account for every operation in the closed Tenant catalog"
  ]);
});
