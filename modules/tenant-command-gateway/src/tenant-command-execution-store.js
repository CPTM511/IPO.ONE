import { DomainError, hashId } from "../../../packages/domain/src/index.js";
import { assertAuthenticationContext } from "../../authentication/src/index.js";

function assertHash(name, value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new DomainError("invalid_tenant_command_execution", `${name} is invalid`);
  }
}

function assertReferenceHash(name, value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new DomainError("invalid_tenant_command_execution", `${name} is invalid`);
  }
}

function assertIdentifier(name, value, maximum = 2048) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new DomainError("invalid_tenant_command_execution", `${name} is invalid`);
  }
}

export class TenantCommandExecutionStore {
  constructor({ client, authenticationContext }) {
    if (!client || typeof client.query !== "function") {
      throw new DomainError(
        "postgres_client_required",
        "tenant command execution store requires an active transaction client"
      );
    }
    this.client = client;
    this.authenticationContext = assertAuthenticationContext(authenticationContext);
    Object.freeze(this);
  }

  async assertReplay({
    idempotencyKey,
    operationId,
    requestIdentityHash,
    commandPayloadHash,
    clientRefHash,
    response
  }) {
    for (const [name, value] of Object.entries({ idempotencyKey, operationId })) {
      assertIdentifier(name, value);
    }
    for (const [name, value] of Object.entries({ requestIdentityHash, commandPayloadHash })) {
      assertHash(name, value);
    }
    assertReferenceHash("clientRefHash", clientRefHash);
    const result = await this.client.query(
      `SELECT operation_id, actor_id, actor_type, client_ref_hash,
              command_payload_hash, command_hash, response_hash
         FROM tenant_command_executions
        WHERE tenant_id = $1 AND idempotency_key = $2`,
      [this.authenticationContext.tenantId, idempotencyKey]
    );
    const row = result.rows[0];
    if (!row) {
      throw new DomainError(
        "tenant_command_execution_missing",
        "durable command response is missing its execution authority record"
      );
    }
    const expectedResponseHash = hashId("command_response", response);
    if (
      row.operation_id !== operationId ||
      row.actor_id !== this.authenticationContext.actorId ||
      row.actor_type !== this.authenticationContext.actorType ||
      row.client_ref_hash !== clientRefHash ||
      row.command_payload_hash !== commandPayloadHash ||
      row.command_hash !== requestIdentityHash ||
      row.response_hash !== expectedResponseHash
    ) {
      throw new DomainError(
        "event_idempotency_conflict",
        "idempotency key was reused with a different authenticated command"
      );
    }
  }

  async record({
    idempotencyKey,
    operationId,
    requestIdentityHash,
    commandPayloadHash,
    clientRefHash,
    authorizationDecisionId,
    admissionId,
    businessEventId,
    response,
    completedAt
  }) {
    for (const [name, value] of Object.entries({
      idempotencyKey,
      operationId,
      authorizationDecisionId,
      admissionId,
      businessEventId
    })) {
      assertIdentifier(name, value);
    }
    for (const [name, value] of Object.entries({ requestIdentityHash, commandPayloadHash })) {
      assertHash(name, value);
    }
    assertReferenceHash("clientRefHash", clientRefHash);
    const when = completedAt instanceof Date ? completedAt : new Date(completedAt);
    if (!Number.isFinite(when.getTime())) {
      throw new DomainError("invalid_tenant_command_execution", "completedAt is invalid");
    }
    await this.client.query(
      `INSERT INTO tenant_command_executions(
         tenant_id, idempotency_key, operation_id, actor_id, actor_type,
         client_ref_hash, command_payload_hash, command_hash,
         authorization_decision_id, admission_id, business_event_id,
         response_hash, completed_at, version, schema_version
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9, $10, $11,
         $12, $13, 1, 'tenant_command_execution.v1'
       )`,
      [
        this.authenticationContext.tenantId,
        idempotencyKey,
        operationId,
        this.authenticationContext.actorId,
        this.authenticationContext.actorType,
        clientRefHash,
        commandPayloadHash,
        requestIdentityHash,
        authorizationDecisionId,
        admissionId,
        businessEventId,
        hashId("command_response", response),
        when
      ]
    );
  }
}
