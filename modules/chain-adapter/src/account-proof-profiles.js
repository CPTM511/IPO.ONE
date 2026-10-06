import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { BASE_SEPOLIA_PROFILE, X_LAYER_TESTNET_PROFILE, createChainProfile } from "./chain-profiles.js";

// Signature-only profiles deliberately cannot be passed to createChainProfile
// or a chain execution/indexer adapter. No RPC, transaction or funds authority.
function bnbProfile(chainId) {
  const core = {
    profileId: `bnb_${chainId.split(":")[1]}_offchain_account_proof_v1`,
    chainId,
    sandboxOnly: true,
    productionApproved: false,
    fundsMode: "synthetic_only",
    transactionSubmissionAllowed: false
  };
  return Object.freeze({ ...core, profileHash: hashId("account_proof_profile", core),
    schemaVersion: "offchain_account_proof_profile.v1" });
}

const BNB_PROFILES = Object.freeze([bnbProfile("eip155:97"), bnbProfile("eip155:56")]);

export function listAccountProofProfiles() {
  return structuredClone([BASE_SEPOLIA_PROFILE, X_LAYER_TESTNET_PROFILE, ...BNB_PROFILES]);
}

export function normalizeAccountProofProfile(profile) {
  const approved = BNB_PROFILES.find((entry) => entry.chainId === profile?.chainId);
  if (approved) {
    if (!profile || Object.keys(profile).length !== Object.keys(approved).length ||
        Object.entries(approved).some(([key, value]) => profile[key] !== value)) {
      throw new DomainError("invalid_account_proof_configuration", "BNB account proof requires its exact signature-only profile");
    }
    return approved;
  }
  const { profileHash, schemaVersion, ...input } = profile ?? {};
  const normalized = createChainProfile(input);
  if (profileHash !== undefined && profileHash !== normalized.profileHash) {
    throw new DomainError("chain_profile_hash_mismatch", "account proof profile hash does not match its contents");
  }
  if (schemaVersion !== undefined && schemaVersion !== normalized.schemaVersion) {
    throw new DomainError("invalid_chain_profile", "account proof profile schema is unsupported");
  }
  return normalized;
}
