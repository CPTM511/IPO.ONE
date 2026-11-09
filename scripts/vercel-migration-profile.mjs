import { createHash } from "node:crypto";

// Candidate schema preparation only; deployment remains separately authorized.
// B3 adds one nullable synthetic Obligation state and guarded Offer terms.
// BNB-004 adds only offchain BNB network identity after conditional public-release authorization.
// Local invitation,
// runtime enrollment and Passkey migrations are not production migrations.
export const B4_LOCAL_ONLY_MIGRATIONS = Object.freeze(["0090_local_synthetic_platform_fees", "0091_local_synthetic_fee_source_credits", "0092_local_b4_source_review_origins", "0093_local_synthetic_principal_credit_balances", "0094_local_synthetic_source_credit_schedule"]);

export const VERCEL_MIGRATION_PROFILE = Object.freeze({
  id: "synthetic_collateral_v1",
  baselineCommit: "50ee192e79580dc449d9cf9de6f7a6e0bcd7aa12",
  count: 79,
  setSha256: "db281956934a3a96328e7ce9a676bc8b7d9f45e1f4e803f22ab6a9c97a2308b5",
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
    "0086_local_bnb_risk_passkey_origin",
    ...B4_LOCAL_ONLY_MIGRATIONS
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
