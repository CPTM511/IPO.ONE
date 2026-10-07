import { DomainError } from "../../../packages/domain/src/index.js";

// Explicit local review composition; this never advertises a hosted release.
export function createLocalProductCapability({ releaseId, syntheticMeteredResource, anchorConfigured }) {
  if (!/^[a-f0-9]{40}$/.test(releaseId ?? "") || anchorConfigured !== false ||
      syntheticMeteredResource?.syntheticOnly !== true ||
      syntheticMeteredResource?.productionFundsMoved !== false ||
      syntheticMeteredResource?.externalProviderExecutionEnabled !== false) {
    throw new DomainError("invalid_local_product_capability", "Local metered review requires a sealed no-chain-write runtime");
  }
  return Object.freeze({
    schemaVersion: "ipo_one_deployment_capability.v1",
    protocol: "IPO.ONE",
    deployment: { hostingStatus: "LOCAL_REVIEW", deploymentRole: "local", releaseId },
    providers: { syntheticMeteredResource },
    chainEvidence: {
      schemaVersion: "ipo_one_chain_capability.v1", releaseId,
      status: "DISABLED", reasonCode: "local_no_chain_write_review",
      hashOnly: true, historicalArtifactsAreCurrentUserEvidence: false
    },
    safety: {
      realFundsEnabled: false, externalProviderExecutionEnabled: false,
      productionSignerAuthorityEnabled: false, withdrawalAuthorityEnabled: false,
      venueWriteAuthorityEnabled: false, syntheticOrRedactedDataOnly: true
    }
  });
}
