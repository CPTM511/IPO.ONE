import { createHash } from "node:crypto";

// WEB-027 retains the formal baseline plus verified ordinary-wallet recovery. Local invitation,
// runtime enrollment and Passkey migrations are not production migrations.
export const VERCEL_MIGRATION_PROFILE = Object.freeze({
  id: "web027_wallet_expiry_recovery_v2",
  baselineCommit: "7ce4b9500ea98744afd9df4087e6a2f203c8b36c",
  count: 76,
  setSha256: "3f986af76fe361af50a3a8401a55277f8e80903c9277d27255592ab84e33e15f",
  localOnly: Object.freeze([
    "0076_invited_wallet_role_enrollment",
    "0077_local_ordinary_wallet_access",
    "0078_local_principal_agent_runtime",
    "0079_local_human_sandbox_activation",
    "0080_local_risk_passkeys",
    "0081_local_passkey_bounds",
    "0082_local_special_role_enrollment",
    "0083_local_operations_reviewer_origin"
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
