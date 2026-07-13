import assert from "node:assert/strict";
import test from "node:test";
import { ActorType } from "../../authentication/src/index.js";
import { PilotCapability, RoleBundle } from "../../authorization/src/index.js";
import {
  FIXED_NOW,
  createAuthorizationHarness
} from "../../authorization/test/support/authorization-fixture.js";
import {
  BreakGlassIncidentStatus,
  BreakGlassReviewStatus,
  BreakGlassService,
  InMemoryApprovalRepository,
  createBreakGlassRuntimeConfig
} from "../src/index.js";

function setup({ enabled = true, maximumSessionMs } = {}) {
  const harness = createAuthorizationHarness();
  const requester = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_break_glass_requester",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [PilotCapability.RISK_FREEZE]
  });
  const custodianOne = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_break_glass_custodian_one",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [PilotCapability.RISK_FREEZE]
  });
  const custodianTwo = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_break_glass_custodian_two",
    actorType: ActorType.OPERATIONS_OPERATOR,
    roleBundle: RoleBundle.OPERATIONS_OPERATOR,
    capabilities: [PilotCapability.PROVIDER_PAUSE]
  });
  const reviewer = harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_break_glass_reviewer",
    actorType: ActorType.AUDITOR,
    roleBundle: RoleBundle.AUDITOR,
    capabilities: [PilotCapability.EVIDENCE_READ]
  });
  const repository = new InMemoryApprovalRepository();
  const config = enabled
    ? createBreakGlassRuntimeConfig({
        enabled: true,
        environment: "test",
        deploymentApprovalRef: "approval:test:break-glass",
        requesterActorIds: [requester.authenticationContext.actorId],
        custodianActorIds: [
          custodianOne.authenticationContext.actorId,
          custodianTwo.authenticationContext.actorId
        ],
        reviewOwnerActorId: reviewer.authenticationContext.actorId,
        notificationTargetRef: "notification:test:security",
        ...(maximumSessionMs === undefined ? {} : { maximumSessionMs })
      })
    : createBreakGlassRuntimeConfig();
  const service = new BreakGlassService({
    repository,
    directory: harness.directory,
    credentialRegistry: harness.credentialRegistry,
    referenceHasher: harness.referenceHasher,
    config,
    clock: () => FIXED_NOW
  });
  return { custodianOne, custodianTwo, harness, repository, requester, reviewer, service };
}

async function activate(state, suffix = "001") {
  const declared = await state.service.declareIncident({
    authenticationContext: state.requester.authenticationContext,
    reasonCode: "security_incident",
    allowedActions: ["risk.freeze", "provider.pause"],
    resourceScopes: [
      { resourceType: "subject", resourceId: "subject_alpha" },
      { resourceType: "provider", resourceId: "provider_alpha" }
    ],
    idempotencyKey: `break-glass-declare-${suffix}`,
    now: FIXED_NOW
  });
  const first = await state.service.confirmCustodian({
    breakGlassIncidentId: declared.incident.breakGlassIncidentId,
    expectedVersion: 1,
    authenticationContext: state.custodianOne.authenticationContext,
    hardwareKeyRefHash: state.harness.referenceHasher.hash("hardware-key", `one-${suffix}`),
    idempotencyKey: `break-glass-confirm-one-${suffix}`,
    now: FIXED_NOW
  });
  const second = await state.service.confirmCustodian({
    breakGlassIncidentId: declared.incident.breakGlassIncidentId,
    expectedVersion: first.incident.version,
    authenticationContext: state.custodianTwo.authenticationContext,
    hardwareKeyRefHash: state.harness.referenceHasher.hash("hardware-key", `two-${suffix}`),
    idempotencyKey: `break-glass-confirm-two-${suffix}`,
    now: FIXED_NOW
  });
  return second;
}

test("break glass is deployment-gated and cannot acquire non-protective authority", async () => {
  const disabled = setup({ enabled: false });
  await assert.rejects(
    () => disabled.service.declareIncident({
      authenticationContext: disabled.requester.authenticationContext,
      reasonCode: "security_incident",
      allowedActions: ["risk.freeze"],
      resourceScopes: [{ resourceType: "subject", resourceId: "subject_alpha" }],
      idempotencyKey: "break-glass-disabled-001",
      now: FIXED_NOW
    }),
    (error) => error.code === "break_glass_deployment_gate_closed"
  );

  const state = setup();
  await assert.rejects(
    () => state.service.declareIncident({
      authenticationContext: state.requester.authenticationContext,
      reasonCode: "security_incident",
      allowedActions: ["risk.unfreeze"],
      resourceScopes: [{ resourceType: "subject", resourceId: "subject_alpha" }],
      idempotencyKey: "break-glass-prohibited-001",
      now: FIXED_NOW
    }),
    (error) => error.code === "break_glass_scope_prohibited"
  );
});

test("server-derived activation deadline is stable across a delayed idempotent retry", async () => {
  const state = setup();
  const input = {
    authenticationContext: state.requester.authenticationContext,
    reasonCode: "security_incident",
    allowedActions: ["risk.freeze"],
    resourceScopes: [{ resourceType: "subject", resourceId: "subject_alpha" }],
    idempotencyKey: "break-glass-delayed-declare-001"
  };
  const first = await state.service.declareIncident({ ...input, now: FIXED_NOW });
  const retry = await state.service.declareIncident({
    ...input,
    now: new Date(FIXED_NOW.getTime() + 1_000)
  });
  assert.equal(retry.replayed, true);
  assert.equal(retry.incident.breakGlassIncidentId, first.incident.breakGlassIncidentId);
  assert.equal(retry.incident.activationDeadline, first.incident.activationDeadline);
});

test("declared incidents retain their bounded session window across configuration drift", async () => {
  const state = setup({ maximumSessionMs: 5 * 60_000 });
  const declared = await state.service.declareIncident({
    authenticationContext: state.requester.authenticationContext,
    reasonCode: "security_incident",
    allowedActions: ["risk.freeze"],
    resourceScopes: [{ resourceType: "subject", resourceId: "subject_alpha" }],
    idempotencyKey: "break-glass-window-drift-declare-001",
    now: FIXED_NOW
  });
  assert.equal(declared.incident.maximumSessionMs, 5 * 60_000);
  const changedConfigService = new BreakGlassService({
    repository: state.repository,
    directory: state.harness.directory,
    credentialRegistry: state.harness.credentialRegistry,
    referenceHasher: state.harness.referenceHasher,
    config: createBreakGlassRuntimeConfig({
      enabled: true,
      environment: "test",
      deploymentApprovalRef: "approval:test:break-glass",
      requesterActorIds: [state.requester.authenticationContext.actorId],
      custodianActorIds: [
        state.custodianOne.authenticationContext.actorId,
        state.custodianTwo.authenticationContext.actorId
      ],
      reviewOwnerActorId: state.reviewer.authenticationContext.actorId,
      notificationTargetRef: "notification:test:security",
      maximumSessionMs: 30 * 60_000
    }),
    clock: () => FIXED_NOW
  });
  const first = await changedConfigService.confirmCustodian({
    breakGlassIncidentId: declared.incident.breakGlassIncidentId,
    expectedVersion: declared.incident.version,
    authenticationContext: state.custodianOne.authenticationContext,
    hardwareKeyRefHash: state.harness.referenceHasher.hash("hardware-key", "drift-one"),
    idempotencyKey: "break-glass-window-drift-one-001",
    now: FIXED_NOW
  });
  const active = await changedConfigService.confirmCustodian({
    breakGlassIncidentId: declared.incident.breakGlassIncidentId,
    expectedVersion: first.incident.version,
    authenticationContext: state.custodianTwo.authenticationContext,
    hardwareKeyRefHash: state.harness.referenceHasher.hash("hardware-key", "drift-two"),
    idempotencyKey: "break-glass-window-drift-two-001",
    now: FIXED_NOW
  });
  assert.equal(
    new Date(active.incident.expiresAt).getTime() - FIXED_NOW.getTime(),
    5 * 60_000
  );
});

test("runtime configuration drift cannot replace incident custodians or review owner", async () => {
  const state = setup();
  const replacementCustodian = state.harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_break_glass_replacement_custodian",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: [PilotCapability.RISK_FREEZE]
  });
  const replacementReviewer = state.harness.addIdentity({
    tenantId: "tenant_alpha",
    actorId: "actor_break_glass_replacement_reviewer",
    actorType: ActorType.AUDITOR,
    roleBundle: RoleBundle.AUDITOR,
    capabilities: [PilotCapability.EVIDENCE_READ]
  });
  const driftedService = new BreakGlassService({
    repository: state.repository,
    directory: state.harness.directory,
    credentialRegistry: state.harness.credentialRegistry,
    referenceHasher: state.harness.referenceHasher,
    config: createBreakGlassRuntimeConfig({
      enabled: true,
      environment: "test",
      deploymentApprovalRef: "approval:test:break-glass",
      requesterActorIds: [state.requester.authenticationContext.actorId],
      custodianActorIds: [
        replacementCustodian.authenticationContext.actorId,
        state.custodianTwo.authenticationContext.actorId
      ],
      reviewOwnerActorId: replacementReviewer.authenticationContext.actorId,
      notificationTargetRef: "notification:test:security"
    }),
    clock: () => FIXED_NOW
  });
  const declared = await state.service.declareIncident({
    authenticationContext: state.requester.authenticationContext,
    reasonCode: "security_incident",
    allowedActions: ["risk.freeze"],
    resourceScopes: [{ resourceType: "subject", resourceId: "subject_alpha" }],
    idempotencyKey: "break-glass-config-drift-declare-001",
    now: FIXED_NOW
  });
  await assert.rejects(
    () => driftedService.confirmCustodian({
      breakGlassIncidentId: declared.incident.breakGlassIncidentId,
      expectedVersion: declared.incident.version,
      authenticationContext: replacementCustodian.authenticationContext,
      hardwareKeyRefHash: state.harness.referenceHasher.hash("hardware-key", "replacement"),
      idempotencyKey: "break-glass-config-drift-confirm-001",
      now: FIXED_NOW
    }),
    (error) => error.code === "break_glass_confirmation_rejected"
  );

  const first = await state.service.confirmCustodian({
    breakGlassIncidentId: declared.incident.breakGlassIncidentId,
    expectedVersion: declared.incident.version,
    authenticationContext: state.custodianOne.authenticationContext,
    hardwareKeyRefHash: state.harness.referenceHasher.hash("hardware-key", "original-one"),
    idempotencyKey: "break-glass-config-drift-original-one-001",
    now: FIXED_NOW
  });
  const active = await state.service.confirmCustodian({
    breakGlassIncidentId: declared.incident.breakGlassIncidentId,
    expectedVersion: first.incident.version,
    authenticationContext: state.custodianTwo.authenticationContext,
    hardwareKeyRefHash: state.harness.referenceHasher.hash("hardware-key", "original-two"),
    idempotencyKey: "break-glass-config-drift-original-two-001",
    now: FIXED_NOW
  });
  const closed = await state.service.close({
    breakGlassIncidentId: declared.incident.breakGlassIncidentId,
    expectedVersion: active.incident.version,
    authenticationContext: state.requester.authenticationContext,
    idempotencyKey: "break-glass-config-drift-close-001",
    now: new Date(FIXED_NOW.getTime() + 1_000)
  });
  await assert.rejects(
    () => driftedService.review({
      breakGlassIncidentId: declared.incident.breakGlassIncidentId,
      expectedVersion: closed.incident.version,
      authenticationContext: replacementReviewer.authenticationContext,
      findingsRefHash: state.harness.referenceHasher.hash("break-glass-review", "replacement"),
      idempotencyKey: "break-glass-config-drift-review-001",
      now: new Date(FIXED_NOW.getTime() + 2_000)
    }),
    (error) => error.code === "break_glass_review_rejected"
  );
});

test("two configured hardware-key custodians activate one bounded incident and review it", async () => {
  const state = setup();
  const active = await activate(state);
  assert.equal(active.incident.status, BreakGlassIncidentStatus.ACTIVE);
  assert.equal(active.custodianDecisions.length, 2);
  assert.equal(
    new Date(active.incident.expiresAt).getTime() - FIXED_NOW.getTime(),
    30 * 60_000
  );

  const authorization = await state.service.assertProtectiveScope({
    breakGlassIncidentId: active.incident.breakGlassIncidentId,
    action: "risk.freeze",
    resourceType: "subject",
    resourceId: "subject_alpha",
    authenticationContext: state.requester.authenticationContext,
    now: new Date(FIXED_NOW.getTime() + 1_000)
  });
  assert.equal(await state.service.revalidateProtectiveAuthorization({
    breakGlassAuthorization: authorization,
    authenticationContext: state.requester.authenticationContext,
    now: new Date(FIXED_NOW.getTime() + 1_000)
  }), authorization);
  await assert.rejects(
    () => state.service.assertProtectiveScope({
      breakGlassIncidentId: active.incident.breakGlassIncidentId,
      action: "risk.freeze",
      resourceType: "subject",
      resourceId: "subject_alpha",
      authenticationContext: state.custodianOne.authenticationContext,
      now: new Date(FIXED_NOW.getTime() + 1_000)
    }),
    (error) => error.code === "break_glass_actor_rejected"
  );
  await assert.rejects(
    () => state.service.assertProtectiveScope({
      breakGlassIncidentId: active.incident.breakGlassIncidentId,
      action: "risk.unfreeze",
      resourceType: "subject",
      resourceId: "subject_alpha",
      authenticationContext: state.requester.authenticationContext,
      now: new Date(FIXED_NOW.getTime() + 1_000)
    }),
    (error) => error.code === "break_glass_scope_rejected"
  );

  const closed = await state.service.close({
    breakGlassIncidentId: active.incident.breakGlassIncidentId,
    expectedVersion: active.incident.version,
    authenticationContext: state.requester.authenticationContext,
    idempotencyKey: "break-glass-close-001",
    now: new Date(FIXED_NOW.getTime() + 60_000)
  });
  assert.equal(closed.incident.status, BreakGlassIncidentStatus.CLOSED);
  assert.equal(closed.incident.reviewStatus, BreakGlassReviewStatus.PENDING);
  await assert.rejects(
    () => state.service.revalidateProtectiveAuthorization({
      breakGlassAuthorization: authorization,
      authenticationContext: state.requester.authenticationContext,
      now: new Date(FIXED_NOW.getTime() + 60_001)
    }),
    (error) => error.code === "break_glass_authorization_stale"
  );
  const reviewed = await state.service.review({
    breakGlassIncidentId: active.incident.breakGlassIncidentId,
    expectedVersion: closed.incident.version,
    authenticationContext: state.reviewer.authenticationContext,
    findingsRefHash: state.harness.referenceHasher.hash("break-glass-review", "findings-001"),
    idempotencyKey: "break-glass-review-001",
    now: new Date(FIXED_NOW.getTime() + 2 * 60_000)
  });
  assert.equal(reviewed.incident.reviewStatus, BreakGlassReviewStatus.COMPLETED);
  assert.equal(state.repository.listEvents({
    aggregateType: "break_glass_incident",
    aggregateId: active.incident.breakGlassIncidentId
  }).length >= 4, true);
});

test("expiry is automatic, cannot be refreshed, and opens the review requirement", async () => {
  const state = setup();
  const active = await activate(state, "expiry");
  await assert.rejects(
    () => state.service.assertProtectiveScope({
      breakGlassIncidentId: active.incident.breakGlassIncidentId,
      action: "risk.freeze",
      resourceType: "subject",
      resourceId: "subject_alpha",
      authenticationContext: state.requester.authenticationContext,
      now: new Date(FIXED_NOW.getTime() + 30 * 60_000 + 1)
    }),
    (error) => error.code === "break_glass_incident_expired"
  );
  const expired = await state.repository.getBreakGlassIncident(active.incident.breakGlassIncidentId);
  assert.equal(expired.status, BreakGlassIncidentStatus.EXPIRED);
  assert.equal(expired.reviewStatus, BreakGlassReviewStatus.PENDING);
  assert.equal(expired.expiresAt, active.incident.expiresAt);
});
