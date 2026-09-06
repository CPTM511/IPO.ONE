import test from "node:test";
import assert from "node:assert/strict";
import { activateSandboxHumanSubjectCommandHandler } from "../src/human-subject-handlers.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import { isTenantProtocolRequest } from "../../../packages/api-contract/src/index.js";

const now = new Date("2026-09-07T12:00:00.000Z");
function fixture() {
  const subject = { subjectId: "subject_test", subjectHash: `0x${"a".repeat(64)}`, subjectType: "human", primaryPrincipalId: "principal_test", status: "pending", prototypeOnly: true, updatedAt: "2026-09-07T10:00:00.000Z" };
  const principal = { principalId: "principal_test", principalType: "human_self", status: "active" };
  const consent = { consentId: "consent_test", consentHash: "consent_hash", subjectId: subject.subjectId, principalId: principal.principalId, status: "active", validFrom: "2026-09-01T00:00:00Z", expiresAt: "2026-10-01T00:00:00Z", sandboxOnly: true, productionAuthority: false, purposes: ["identity_reference_use", "credit_decision"] };
  const reference = { ...consent, identityReferenceId: "identity_test", syntheticOnly: true, productionVerified: false, providerRef: "urn:ipo.one:private-pilot:synthetic-identity-provider:v1", providerVersion: "private_pilot_synthetic_provider.v1", assuranceLevel: "synthetic_provider_asserted", purposeCodes: consent.purposes };
  const state = { value: subject, aggregateVersion: 1, rootAggregateType: "subject", rootAggregateId: subject.subjectId };
  const data = { subject, principal, consent, reference, state, database: "ipo_one_web027_candidate", adverseCount: 0 };
  const context = { client: { async query(sql) { return sql.includes("current_database") ? { rows: [{ name: data.database }] } : { rowCount: data.adverseCount }; } },
    coreRepository: { async getProjectionStateInTransaction() { return state; }, async getProjectionInTransaction(client, type) { return type === CoreProjectionType.PRINCIPAL ? principal : data.reference; }, async getConsentRecordInTransaction() { return consent; } },
    payload: { consentId: consent.consentId, identityReferenceId: reference.identityReferenceId, expectedSubjectUpdatedAt: subject.updatedAt, acknowledgement: "activate_synthetic_profile_no_credit_or_funds" },
    authenticationContext: { actorType: "human", actorId: "actor_test", roles: ["human_borrower"] },
    authorizationDecision: { resourceType: "subject", resourceId: subject.subjectId }, now, requestId: "request_activation_test", correlationId: "correlation_activation_test" };
  return { data, context };
}
const handler = activateSandboxHumanSubjectCommandHandler({ localSandboxHumanActivation: true });
test("explicit activation appends the shared Subject stream with the current aggregate version", async () => {
  const { context } = fixture();
  const result = await handler.plan(context);
  assert.equal(result.writes[0].value.status, "active");
  assert.equal(result.events[0].expectedVersion, 1);
  assert.equal(result.events[0].event.payload.productionAuthority, false);
  assert.equal(result.events[0].event.payload.previousStatus, "pending");
});
for (const [name, mutate] of [
  ["ordinary Principal", ({context}) => context.authenticationContext.roles = ["principal_controller"]],
  ["Agent actor", ({context}) => context.authenticationContext.actorType = "agent"],
  ["unrelated database", ({data}) => data.database = "production"],
  ["frozen Subject", ({data}) => data.subject.status = "suspended"],
  ["already active", ({data}) => data.subject.status = "active"],
  ["unknown Subject state", ({data}) => data.subject.status = "unknown"],
  ["stale review", ({context}) => context.payload.expectedSubjectUpdatedAt = "2026-08-01T00:00:00Z"],
  ["wrong stream", ({data}) => data.state.rootAggregateId = "subject_other"],
  ["inactive Principal", ({data}) => data.principal.status = "suspended"],
  ["expired Consent", ({data}) => data.consent.expiresAt = now.toISOString()],
  ["future Consent", ({data}) => data.consent.validFrom = "2026-10-01T00:00:00Z"],
  ["wrong owner Consent", ({data}) => data.consent.subjectId = "subject_other"],
  ["revoked Consent", ({data}) => data.consent.status = "revoked"],
  ["missing identity", ({data}) => data.reference = null],
  ["wrong reference Consent", ({data}) => data.reference.consentHash = "other_hash"],
  ["wrong identity provider", ({data}) => data.reference.providerRef = "unapproved"],
  ["real identity claim", ({data}) => data.reference.productionVerified = true],
  ["expired reference", ({data}) => data.reference.expiresAt = now.toISOString()],
  ["adverse or frozen credit state", ({data}) => data.adverseCount = 1],
  ["implicit confirmation", ({context}) => delete context.payload.acknowledgement]
]) test(`activation rejects ${name}`, async () => {
  const f = fixture(); mutate(f);
  await assert.rejects(handler.plan(f.context), { code: "sandbox_human_activation_rejected" });
});
test("activation handler defaults closed", async () => {
  await assert.rejects(activateSandboxHumanSubjectCommandHandler().plan(fixture().context), { code: "sandbox_human_activation_rejected" });
});
test("activation protocol requires explicit closed payload and exact Subject reference", () => {
  const { context } = fixture();
  const request = { operationId: handler.operationId, resource: context.authorizationDecision, payload: context.payload,
    idempotencyKey: "activation_request_0001", requestId: context.requestId, correlationId: context.correlationId, schemaVersion: "tenant_protocol_request.v1" };
  assert.equal(isTenantProtocolRequest(request), true);
  assert.equal(isTenantProtocolRequest({ ...request, payload: {} }), false);
  assert.equal(isTenantProtocolRequest({ ...request, payload: { ...request.payload, status: "active" } }), false);
  assert.equal(isTenantProtocolRequest({ ...request, resource: undefined }), false);
});
