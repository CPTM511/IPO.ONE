import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RoleBundle } from "../../authorization/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import { readWorkspaceResumeQueryHandler } from "../src/workspace-resume-handlers.js";

const humanOfferFixture = JSON.parse(await readFile(
  new URL(
    "../../../api/tenant-protocol/conformance/human-credit-offer-workflow-receipt.v1.fixtures.json",
    import.meta.url
  ),
  "utf8"
)).valid[0];

function context(roles = [RoleBundle.HUMAN_BORROWER]) {
  return {
    tenantId: "tenant_workspace_test",
    actorId: "actor_workspace_test",
    roles
  };
}

function row(index, resourceType = "subject") {
  return {
    resource_type: resourceType,
    resource_id: `${resourceType}_workspace_${String(index).padStart(2, "0")}`,
    relationship: resourceType === "subject" ? "owner" : "owner"
  };
}

test("workspace recovery returns only bounded resources already bound to the authenticated Human", async () => {
  const calls = [];
  const handler = readWorkspaceResumeQueryHandler();
  const result = await handler.execute({
    client: {
      async query(text, values) {
        calls.push({ text, values });
        return { rows: [row(1), row(2, "consent"), row(3, "obligation")] };
      }
    },
    payload: {},
    authenticationContext: context()
  });

  assert.equal(result.workspaceKind, "human_borrower");
  assert.equal(result.serverTruth, true);
  assert.equal(result.hasMore, false);
  assert.equal(result.resources.length, 3);
  assert.deepEqual(calls[0].values.slice(0, 2), ["tenant_workspace_test", "actor_workspace_test"]);
  assert.match(calls[0].text, /b\.actor_id = \$2/);
  assert.match(calls[0].text, /r\.status = 'active'/);
  assert.match(calls[0].text, /\$6::text = 'human_borrower'/);
  assert.match(calls[0].text, /b\.relationship = 'owner'/);
  assert.match(calls[0].text, /\$6::text = 'principal_controller'/);
  assert.match(calls[0].text, /b\.relationship = 'controller'/);
  assert.match(calls[0].text, /\$6::text = 'agent_runtime'/);
  assert.equal(calls[0].values[5], "human_borrower");
  assert.match(calls[0].text, /ROW_NUMBER\(\) OVER/);
  assert.match(calls[0].text, /PARTITION BY b\.resource_type/);
  assert.match(
    calls[0].text,
    /ORDER BY b\.updated_at DESC, b\.resource_id ASC\s+\) AS type_rank/,
    "the bounded recovery window must retain the latest authorized resource from every available type"
  );
  assert.match(calls[0].text, /potentially_actionable OR type_rank = 1/);
  assert.match(calls[0].text, /o\.status = 'offered'/);
  assert.match(calls[0].text, /offer_b\.actor_id = \$2/);
  assert.equal(JSON.stringify(result).includes("credential"), false);
});

test("Human workspace recovery derives one exact non-authorizing Offer review from current server truth", async () => {
  const intent = {
    ...structuredClone(humanOfferFixture.creditIntent),
    authorityRef: humanOfferFixture.creditIntent.authorityId,
    principalId: "principal_workspace_test",
    schemaVersion: "credit_intent.v1"
  };
  delete intent.authorityId;
  const decision = {
    ...structuredClone(humanOfferFixture.decision),
    authorityRef: humanOfferFixture.decision.authorityId,
    createdAt: humanOfferFixture.decision.decidedAt,
    limitMinor: humanOfferFixture.decision.approvedPrincipalMinor,
    modelVersion: humanOfferFixture.decision.policyVersion,
    principalId: intent.principalId,
    reasons: humanOfferFixture.decision.reasonCodes.map((code) => ({ code })),
    schemaVersion: "risk_decision.v2"
  };
  delete decision.approvedPrincipalMinor;
  delete decision.authorityId;
  delete decision.decidedAt;
  delete decision.decisionPassport;
  delete decision.policyVersion;
  delete decision.reasonCodes;
  const offer = {
    ...structuredClone(humanOfferFixture.offer),
    validUntil: "2026-07-20T02:00:00.000Z",
    schemaVersion: "credit_offer.v1"
  };
  const consent = {
    consentId: intent.authorityRef,
    subjectId: intent.subjectId,
    principalId: intent.principalId,
    purposes: [
      "credit_application",
      "credit_decision",
      "credit_offer_acceptance",
      "obligation_servicing",
      "identity_reference_use"
    ],
    allowedAssetIds: [intent.assetId],
    allowedCreditPurposeCodes: [intent.purposeCode],
    allowedRepaymentFrequencies: [offer.repaymentFrequency],
    maxRequestedPrincipalMinor: intent.requestedPrincipalMinor,
    maxRequestedTermDays: intent.requestedTermDays,
    maxInstallmentCount: intent.installmentCount,
    validFrom: "2026-07-19T00:00:00.000Z",
    expiresAt: "2026-07-21T00:00:00.000Z",
    status: "active",
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "consent_record.v1"
  };
  const states = new Map([
    [`${CoreProjectionType.CREDIT_INTENT}:${intent.creditIntentId}`, { value: intent, aggregateVersion: 2 }],
    [`${CoreProjectionType.RISK_DECISION}:${decision.riskDecisionId}`, { value: decision, aggregateVersion: 1 }],
    [`${CoreProjectionType.CREDIT_OFFER}:${offer.creditOfferId}`, { value: offer, aggregateVersion: 1 }],
    [`${CoreProjectionType.CONSENT_RECORD}:${consent.consentId}`, { value: consent, aggregateVersion: 1 }]
  ]);
  const result = await readWorkspaceResumeQueryHandler().execute({
    client: {
      async query() {
        return { rows: [
          { ...row(1), resource_id: intent.subjectId },
          { ...row(2, "consent"), resource_id: consent.consentId },
          { ...row(3, "credit_intent"), resource_id: intent.creditIntentId }
        ] };
      }
    },
    coreRepository: {
      async getProjectionStateInTransaction(_client, type, id) {
        return states.get(`${type}:${id}`);
      },
      async findRiskDecisionByCreditIntentInTransaction() {
        return decision;
      },
      async findCreditOfferByIntentInTransaction() {
        return offer;
      }
    },
    directory: {
      async resolveResource() {
        return {
          status: "active",
          actorAuthorized: true,
          bindingRelationship: "owner",
          version: 1
        };
      }
    },
    payload: {},
    authenticationContext: context(),
    now: new Date("2026-07-20T00:00:00.000Z")
  });

  assert.equal(result.humanOfferReview.offer.creditOfferId, offer.creditOfferId);
  assert.equal(result.humanOfferReview.offerSchemaVersion, "credit_offer.v1");
  assert.equal(result.humanOfferReview.offerAggregateVersion, 1);
  assert.equal(result.humanOfferReview.serverTruth, true);
  assert.equal(result.humanOfferReview.nonAuthorizing, true);
  assert.equal(result.humanOfferReview.fundsAuthority, false);
});

test("Human workspace recovery returns no acceptance review for stale or unauthorized server truth", async () => {
  const handler = readWorkspaceResumeQueryHandler();
  const creditIntentId = humanOfferFixture.creditIntent.creditIntentId;
  const execute = ({
    offerStatus = "offered",
    unauthorizedResourceType
  }) => handler.execute({
    client: {
      async query() {
        return { rows: [{
          ...row(1, "credit_intent"),
          resource_id: creditIntentId
        }] };
      }
    },
    coreRepository: {
      async getProjectionStateInTransaction(_client, type) {
        if (type === CoreProjectionType.CREDIT_INTENT) return {
          aggregateVersion: 2,
          value: {
            creditIntentId,
            subjectId: humanOfferFixture.subjectId,
            principalId: "principal_workspace_test",
            authorityType: "consent",
            authorityRef: humanOfferFixture.consentId,
            status: "decided",
            sandboxOnly: true,
            productionFundsRequested: false
          }
        };
        return undefined;
      },
      async findRiskDecisionByCreditIntentInTransaction() {
        return { riskDecisionId: humanOfferFixture.decision.riskDecisionId };
      },
      async findCreditOfferByIntentInTransaction() {
        return {
          ...humanOfferFixture.offer,
          status: offerStatus,
          schemaVersion: "credit_offer.v1"
        };
      }
    },
    directory: {
      async resolveResource({ resourceType }) {
        const actorAuthorized = resourceType !== unauthorizedResourceType;
        return {
          status: "active",
          actorAuthorized,
          bindingRelationship: actorAuthorized ? "owner" : undefined
        };
      }
    },
    payload: {},
    authenticationContext: context(),
    now: new Date("2026-07-15T03:00:00.000Z")
  });

  assert.equal((await execute({ offerStatus: "declined" })).humanOfferReview, null);
  for (const unauthorizedResourceType of ["credit_offer", "subject", "consent"]) {
    assert.equal((await execute({ unauthorizedResourceType })).humanOfferReview, null);
  }
});

test("Human workspace recovery scans historical Intents and fails closed unless one Offer is actionable", async () => {
  const currentIntentId = humanOfferFixture.creditIntent.creditIntentId;
  const historicalIntentId = "credit_intent_historical_workspace";
  const currentIntent = {
    ...structuredClone(humanOfferFixture.creditIntent),
    authorityRef: humanOfferFixture.creditIntent.authorityId,
    principalId: "principal_workspace_test",
    schemaVersion: "credit_intent.v1"
  };
  delete currentIntent.authorityId;
  const historicalIntent = {
    ...currentIntent,
    creditIntentId: historicalIntentId,
    status: "expired"
  };
  const decision = {
    ...structuredClone(humanOfferFixture.decision),
    authorityRef: humanOfferFixture.decision.authorityId,
    createdAt: humanOfferFixture.decision.decidedAt,
    limitMinor: humanOfferFixture.decision.approvedPrincipalMinor,
    modelVersion: humanOfferFixture.decision.policyVersion,
    principalId: currentIntent.principalId,
    reasons: humanOfferFixture.decision.reasonCodes.map((code) => ({ code })),
    schemaVersion: "risk_decision.v2"
  };
  delete decision.approvedPrincipalMinor;
  delete decision.authorityId;
  delete decision.decidedAt;
  delete decision.decisionPassport;
  delete decision.policyVersion;
  delete decision.reasonCodes;
  const offer = {
    ...structuredClone(humanOfferFixture.offer),
    validUntil: "2026-07-20T02:00:00.000Z",
    schemaVersion: "credit_offer.v1"
  };
  const consent = {
    consentId: currentIntent.authorityRef,
    subjectId: currentIntent.subjectId,
    principalId: currentIntent.principalId,
    purposes: [
      "credit_application",
      "credit_decision",
      "credit_offer_acceptance",
      "obligation_servicing",
      "identity_reference_use"
    ],
    allowedAssetIds: [currentIntent.assetId],
    allowedCreditPurposeCodes: [currentIntent.purposeCode],
    allowedRepaymentFrequencies: [offer.repaymentFrequency],
    maxRequestedPrincipalMinor: currentIntent.requestedPrincipalMinor,
    maxRequestedTermDays: currentIntent.requestedTermDays,
    maxInstallmentCount: currentIntent.installmentCount,
    validFrom: "2026-07-19T00:00:00.000Z",
    expiresAt: "2026-07-21T00:00:00.000Z",
    status: "active",
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "consent_record.v1"
  };
  let ambiguous = false;
  const resultFor = () => readWorkspaceResumeQueryHandler().execute({
    client: {
      async query() {
        return { rows: [
          { ...row(1), resource_id: currentIntent.subjectId },
          { ...row(2, "consent"), resource_id: consent.consentId },
          { ...row(3, "credit_intent"), resource_id: historicalIntentId },
          { ...row(4, "credit_intent"), resource_id: currentIntentId }
        ] };
      }
    },
    coreRepository: {
      async getProjectionStateInTransaction(_client, type, id) {
        if (type === CoreProjectionType.CREDIT_INTENT) {
          if (id === historicalIntentId) return {
            value: ambiguous ? { ...currentIntent, creditIntentId: historicalIntentId } : historicalIntent,
            aggregateVersion: 2
          };
          return { value: currentIntent, aggregateVersion: 2 };
        }
        if (type === CoreProjectionType.RISK_DECISION) return {
          value: id === historicalIntentId && ambiguous
            ? { ...decision, creditIntentId: historicalIntentId }
            : decision,
          aggregateVersion: 1
        };
        if (type === CoreProjectionType.CREDIT_OFFER) return {
          value: id === historicalIntentId && ambiguous
            ? { ...offer, creditIntentId: historicalIntentId }
            : offer,
          aggregateVersion: 1
        };
        if (type === CoreProjectionType.CONSENT_RECORD) return { value: consent, aggregateVersion: 1 };
        return undefined;
      },
      async findRiskDecisionByCreditIntentInTransaction(_client, id) {
        return id === historicalIntentId && ambiguous
          ? { ...decision, creditIntentId: historicalIntentId }
          : decision;
      },
      async findCreditOfferByIntentInTransaction(_client, id) {
        return id === historicalIntentId && ambiguous
          ? { ...offer, creditIntentId: historicalIntentId }
          : offer;
      }
    },
    directory: {
      async resolveResource() {
        return { status: "active", actorAuthorized: true, bindingRelationship: "owner" };
      }
    },
    payload: {},
    authenticationContext: context(),
    now: new Date("2026-07-20T00:00:00.000Z")
  });

  assert.equal((await resultFor()).humanOfferReview.creditIntent.creditIntentId, currentIntentId);
  ambiguous = true;
  assert.equal((await resultFor()).humanOfferReview, null);
});

test("workspace recovery is capped and recognizes one Principal Controller role", async () => {
  const handler = readWorkspaceResumeQueryHandler();
  const rows = Array.from({ length: 33 }, (_, index) => row(index, index % 2 ? "mandate" : "subject"));
  const calls = [];
  const result = await handler.execute({
    client: {
      async query(text, values) {
        calls.push({ text, values });
        return text.includes("controller_actor_id")
          ? { rows: [{ actor_id: "actor_agent_controlled" }] }
          : { rows };
      }
    },
    coreRepository: {
      async listActiveWorkspaceContinuationReceiptsInTransaction() {
        return [];
      }
    },
    payload: {},
    authenticationContext: context([RoleBundle.PRINCIPAL_CONTROLLER]),
    now: new Date("2026-07-20T00:00:00.000Z")
  });
  assert.equal(result.workspaceKind, "principal_controller");
  assert.equal(result.resources.length, 32);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.controlledAgentActorIds, ["actor_agent_controlled"]);
  assert.match(calls[1].text, /m\.controller_actor_id = \$2/);
  assert.match(calls[1].text, /a\.actor_type = 'agent'/);
  assert.deepEqual(calls[1].values.slice(0, 2), ["tenant_workspace_test", "actor_workspace_test"]);
  assert.equal(calls[0].values[5], "principal_controller");
});

test("same-Human multi-role recovery binds resources to the selected role instead of actor union", async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      return text.includes("controller_actor_id") ? { rows: [] } : { rows: [] };
    }
  };
  await readWorkspaceResumeQueryHandler().execute({
    client,
    payload: {},
    authenticationContext: context([RoleBundle.HUMAN_BORROWER]),
    now: new Date("2026-07-20T00:00:00.000Z")
  });
  await readWorkspaceResumeQueryHandler().execute({
    client,
    coreRepository: {
      async listActiveWorkspaceContinuationReceiptsInTransaction() {
        return [];
      }
    },
    payload: {},
    authenticationContext: context([RoleBundle.PRINCIPAL_CONTROLLER]),
    now: new Date("2026-07-20T00:00:00.000Z")
  });
  assert.equal(calls[0].values[5], "human_borrower");
  assert.equal(calls[1].values[5], "principal_controller");
  assert.match(calls[0].text, /human_borrower'[\s\S]*?b\.relationship = 'owner'/);
  assert.match(calls[1].text, /principal_controller'[\s\S]*?b\.relationship = 'controller'/);
});

test("workspace recovery fails closed on caller scope, ambiguous role, or invalid durable rows", async () => {
  const handler = readWorkspaceResumeQueryHandler();
  await assert.rejects(
    handler.execute({
      client: { async query() { return { rows: [] }; } },
      payload: { actorId: "actor_other" },
      authenticationContext: context()
    }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
  await assert.rejects(
    handler.execute({
      client: { async query() { return { rows: [] }; } },
      payload: {},
      authenticationContext: context([RoleBundle.HUMAN_BORROWER, RoleBundle.PRINCIPAL_CONTROLLER])
    }),
    (error) => error.code === "workspace_recovery_unavailable"
  );
  await assert.rejects(
    handler.execute({
      client: { async query() { return { rows: [{ ...row(1), resource_type: "credential" }] }; } },
      payload: {},
      authenticationContext: context()
    }),
    (error) => error.code === "workspace_recovery_unavailable"
  );
  await assert.rejects(
    handler.execute({
      client: {
        async query(text) {
          return text.includes("controller_actor_id")
            ? { rows: [{ actor_id: "not valid" }] }
            : { rows: [] };
        }
      },
      payload: {},
      authenticationContext: context([RoleBundle.PRINCIPAL_CONTROLLER]),
      now: new Date("2026-07-20T00:00:00.000Z")
    }),
    (error) => error.code === "workspace_recovery_unavailable"
  );
});
