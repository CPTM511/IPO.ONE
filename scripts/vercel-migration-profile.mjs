import { createHash } from "node:crypto";

// WEB-027 retains the formal site's approved database. Local invitation,
// runtime enrollment and Passkey migrations are not production migrations.
export const VERCEL_MIGRATION_PROFILE = Object.freeze({
  id: "web027_existing_hosted_schema_v1",
  baselineCommit: "7ce4b9500ea98744afd9df4087e6a2f203c8b36c",
  count: 75,
  setSha256: "a76b984081c4bd309fe265023a9184a28fb57ff4602185dc704a6a54ed56b89d",
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
