import { assertAuthenticationContext } from "../../authentication/src/index.js";
import { createAuthorizationAuditEvent } from "./authorization-audit-store.js";
import {
  authorizationError,
  cloneAuthorization
} from "./authorization-utils.js";

export class PostgresAuthorizationAuditStore {
  constructor({ client, authenticationContext, referenceHasher }) {
    if (!client || typeof client.query !== "function" || typeof referenceHasher?.hash !== "function") {
      throw authorizationError(
        "invalid_authorization_configuration",
        "PostgreSQL authorization audit requires an active transaction client"
      );
    }
    this.client = client;
    this.authenticationContext = assertAuthenticationContext(authenticationContext);
    this.referenceHasher = referenceHasher;
    Object.freeze(this);
  }

  async append(input) {
    const event = createAuthorizationAuditEvent(input);
    const context = this.authenticationContext;
    if (
      event.tenantId !== context.tenantId ||
      event.actorId !== context.actorId ||
      event.actorType !== context.actorType ||
      event.clientId !== context.clientId ||
      event.tokenJtiHash !== context.tokenJtiHash ||
      event.policyVersion !== context.policyVersion
    ) {
      throw authorizationError("invalid_authorization_audit", "authorization audit context does not match");
    }
    const clientRefHash = this.referenceHasher.hash(
      "authorization.client",
      `${event.tenantId}\0${event.clientId}`
    );
    await this.client.query(
      `INSERT INTO authorization_audit_events(
         id, tenant_id, occurred_at, request_id, correlation_id,
         actor_id, actor_type, client_ref_hash, token_jti_hash,
         operation_id, action, resource_type, resource_id,
         authorization_decision, authorization_decision_id,
         command_payload_hash, command_hash, policy_version, reason_code,
         approval_ids, approval_proposal_id, approval_proposal_version,
         membership_id, access_grant_id, source_network_ref_hash,
         schema_version
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12, $13,
         $14, $15,
         $16, $17, $18, $19,
         $20::jsonb, $21, $22,
         $23, $24, $25,
         $26
       )`,
      [
        event.eventId,
        event.tenantId,
        event.occurredAt,
        event.requestId,
        event.correlationId,
        event.actorId,
        event.actorType,
        clientRefHash,
        event.tokenJtiHash,
        event.operationId,
        event.action,
        event.resourceType,
        event.resourceId,
        event.authorizationDecision,
        event.authorizationDecisionId ?? null,
        event.commandPayloadHash ?? null,
        event.commandHash ?? null,
        event.policyVersion,
        event.reasonCode,
        JSON.stringify(event.approvalIds),
        event.approvalProposalId ?? null,
        event.approvalProposalVersion ?? null,
        event.membershipId,
        event.accessGrantId ?? null,
        event.sourceNetworkRefHash ?? null,
        event.schemaVersion
      ]
    );
    return cloneAuthorization(event);
  }
}
