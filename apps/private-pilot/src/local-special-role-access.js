// WEB-027M: exact invited identities for the isolated acceptance database only.
import { readFile } from "node:fs/promises";
import { ActorType } from "../../../modules/authentication/src/index.js";
import { PilotCapability as C, RoleBundle as R } from "../../../modules/authorization/src/index.js";

export const localSpecialRolesEnabled = () => process.env.IPO_ONE_LOCAL_SPECIAL_ROLES === "web027m_v1";
export const LOCAL_SPECIAL_ROLE_SPECS = Object.freeze({
  operations: Object.freeze({ actorId: "actor_web027m_operations", durableCredentialId: "credential_f4224b12-e6ff-45ca-b42b-54fbb275df19", actorType: ActorType.OPERATIONS_OPERATOR,
    roleBundle: R.OPERATIONS_OPERATOR, port: 8939, hash: "#risk-operations",
    capabilities: Object.freeze([C.SERVICING_QUEUE_READ, C.SERVICING_RESTRUCTURE_SANDBOX,
      C.SERVICING_REPURCHASE_SANDBOX, C.SERVICING_WRITEOFF_SANDBOX,
      C.APPROVAL_PROPOSE, C.APPROVAL_READ, C.APPROVAL_CANCEL]) }),
  auditor: Object.freeze({ actorId: "actor_web027m_auditor", durableCredentialId: "credential_28f5c825-9118-460c-87d0-91c0dd614ca8", actorType: ActorType.AUDITOR,
    roleBundle: R.AUDITOR, port: 8940, hash: "#risk-operations",
    capabilities: Object.freeze([C.RISK_READ_TENANT, C.PILOT_CASE_READ_TENANT, C.APPROVAL_READ]) }),
  riskReviewer: Object.freeze({ actorId: "actor_web027m_risk_reviewer", durableCredentialId: "credential_f1edebc9-ca11-4e21-9bf2-49c12a38e41f", actorType: ActorType.RISK_OPERATOR,
    roleBundle: R.RISK_OPERATOR, port: 8941, hash: "#risk-operations",
    capabilities: Object.freeze([C.APPROVAL_READ, C.APPROVAL_DECIDE, C.SERVICING_QUEUE_READ]) })
});

export function assertLocalSpecialRoleDatabase(connectionString, basePort) {
  const url = new URL(connectionString);
  if (url.hostname !== "127.0.0.2" || url.port !== "55435" ||
      url.pathname !== "/ipo_one_web027_candidate" || basePort !== 8935) {
    throw new Error("WEB-027M requires the exact isolated candidate database and ports");
  }
}

export async function loadLocalSpecialRoleInvitations() {
  const path = process.env.IPO_ONE_LOCAL_SPECIAL_ROLE_INVITATIONS_FILE;
  if (!path) throw new Error("WEB-027M invited wallet bindings are required");
  const bindings = JSON.parse(await readFile(path, "utf8"));
  const names = Object.keys(LOCAL_SPECIAL_ROLE_SPECS);
  if (Object.keys(bindings).length !== names.length || names.some(name =>
    typeof bindings[name] !== "string" || !/^0x[0-9a-f]{40}$/.test(bindings[name])) ||
    new Set(Object.values(bindings)).size !== names.length) {
    throw new Error("WEB-027M requires three distinct exact invited wallets");
  }
  return Object.freeze(bindings);
}
