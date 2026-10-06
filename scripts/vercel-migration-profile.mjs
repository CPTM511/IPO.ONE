import { createHash } from "node:crypto";

// BNB-004 adds only offchain BNB network identity after conditional public-release authorization.
// Local invitation,
// runtime enrollment and Passkey migrations are not production migrations.
export const VERCEL_MIGRATION_PROFILE = Object.freeze({
  id: "bnb004_no_funds_wallet_networks_v1",
  baselineCommit: "7ce4b9500ea98744afd9df4087e6a2f203c8b36c",
  count: 77,
  setSha256: "9449c310a601f0be115c36ee99f0b39a2ac5b41a48ce1f18811b8342d4943c77",
  localOnly: Object.freeze([
    "0074_bnb_no_funds_wallet_networks",
    "0076_invited_wallet_role_enrollment",
    "0077_local_ordinary_wallet_access",
    "0078_local_principal_agent_runtime",
    "0079_local_human_sandbox_activation",
    "0080_local_risk_passkeys",
    "0081_local_passkey_bounds",
    "0082_local_special_role_enrollment",
    "0083_local_operations_reviewer_origin",
    "0085_local_bnb_ordinary_wallet_access",
    "0086_local_bnb_risk_passkey_origin"
  ])
});

export function selectVercelMigrations(migrations) {
  const retained = migrations.filter(item => !VERCEL_MIGRATION_PROFILE.localOnly.includes(item.name));
  const digest = createHash("sha256").update(JSON.stringify(retained.map(({ name, checksum }) => ({ name, checksum })))).digest("hex");
  if (retained.length !== VERCEL_MIGRATION_PROFILE.count || digest !== VERCEL_MIGRATION_PROFILE.setSha256) {
    throw new Error("Hosted migration profile changed: review the exact production schema before building");
  }
  return retained;
}
