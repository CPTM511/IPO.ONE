import test from "node:test";
import assert from "node:assert/strict";
import {
  createOfficialReportCommandHandler,
  readOfficialReportQueryHandler,
  retrieveOfficialReportQueryHandler,
  revokeOfficialReportCommandHandler
} from "../src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";

const actor = Object.freeze({
  actorId: "actor_report_owner",
  actorType: "human",
  tenantId: "tenant_report",
  clientId: "client_report"
});
const now = new Date("2026-07-24T12:00:00.000Z");
const obligation = Object.freeze({
  obligationId: "obligation_report_handler",
  subjectId: "subject_report_handler",
  principalId: "principal_report_handler",
  assetId: "eip155:84532/erc20:0x1111111111111111111111111111111111111111",
  status: "active",
  originalPrincipalMinor: "10000",
  outstandingPrincipalMinor: "9000",
  totalRepaidMinor: "1000",
  accruedInterestMinor: "100",
  accruedFeesMinor: "25",
  outstandingFeesMinor: "20",
  originationFeeMinor: "5",
  maturityAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
  sandboxOnly: true,
  productionFundsMoved: false,
  schemaVersion: "obligation.v2"
});
const evidence = Object.freeze([{
  evidenceId: "evidence_report_handler",
  evidenceHash: `0x${"1".repeat(64)}`,
  eventType: "repayment_posted",
  aggregateType: "obligation",
  aggregateId: obligation.obligationId,
  aggregateVersion: 2,
  obligationId: obligation.obligationId,
  sourceFinality: "finalized",
  payloadHash: `0x${"2".repeat(64)}`,
  occurredAt: "2026-07-24T11:59:00.000Z",
  recordedAt: "2026-07-24T11:59:01.000Z",
  schemaVersion: "evidence_envelope.v1"
}]);

function referenceHasher() {
  return {
    hash() {
      return Buffer.alloc(32, 3).toString("base64url");
    }
  };
}

function directory({ allowed = true } = {}) {
  return {
    calls: 0,
    async listActiveResourceBindings() {
      this.calls += 1;
      return allowed
        ? [{
            actorId: actor.actorId,
            actorType: actor.actorType,
            relationship: "owner",
            version: 1
          }]
        : [{
            actorId: "actor_other",
            actorType: "human",
            relationship: "owner",
            version: 1
          }];
    }
  };
}

test("official report creation persists server bytes but returns metadata only", async () => {
  const handler = createOfficialReportCommandHandler();
  const authDirectory = directory();
  const plan = await handler.plan({
    client: {},
    coreRepository: {
      async getProjectionStateInTransaction(_client, type, id) {
        assert.equal(type, CoreProjectionType.OBLIGATION);
        assert.equal(id, obligation.obligationId);
        return { value: obligation, aggregateVersion: 2 };
      },
      async listObligationEvidenceInTransaction() {
        return structuredClone(evidence);
      },
      async countOfficialReportArtifactsForCapacityInTransaction() {
        return 0;
      }
    },
    directory: authDirectory,
    authenticationContext: actor,
    authorizationDecision: {
      resourceType: "obligation",
      resourceId: obligation.obligationId
    },
    referenceHasher: referenceHasher(),
    payload: {
      format: "csv",
      lifetimeSeconds: 900,
      schemaVersion: "official_report_create.v1"
    },
    now,
    requestId: "request-report-create",
    correlationId: "correlation-report-create"
  });
  assert.equal(authDirectory.calls, 1);
  assert.equal(plan.authorizationResource.resourceType, "official_report");
  assert.equal(plan.writes[0].value.browserAuthored, false);
  assert.equal(plan.writes[0].value.piiIncluded, false);
  assert.equal(plan.writes[0].value.feeAuditPolicy.productionPolicyAvailable, false);
  assert.match(plan.writes[0].value.contentBase64, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(Object.hasOwn(plan.response.report, "contentBase64"), false);
});

test("retrieval rechecks authorization, integrity, expiry, and non-enumeration", async () => {
  const createPlan = await createOfficialReportCommandHandler().plan({
    client: {},
    coreRepository: {
      async getProjectionStateInTransaction() {
        return { value: obligation, aggregateVersion: 2 };
      },
      async listObligationEvidenceInTransaction() {
        return structuredClone(evidence);
      },
      async countOfficialReportArtifactsForCapacityInTransaction() {
        return 0;
      }
    },
    directory: directory(),
    authenticationContext: actor,
    authorizationDecision: {
      resourceType: "obligation",
      resourceId: obligation.obligationId
    },
    referenceHasher: referenceHasher(),
    payload: {
      format: "json",
      lifetimeSeconds: 900,
      schemaVersion: "official_report_create.v1"
    },
    now,
    requestId: "request-report-retrieve",
    correlationId: "correlation-report-retrieve"
  });
  const artifact = createPlan.writes[0].value;
  const authDirectory = directory();
  const coreRepository = {
    async getProjectionStateInTransaction() {
      return { value: artifact, aggregateVersion: 1 };
    }
  };
  const resource = {
    resourceType: "official_report",
    resourceId: artifact.officialReportId
  };
  const result = await retrieveOfficialReportQueryHandler().execute({
    client: {},
    coreRepository,
    directory: authDirectory,
    authenticationContext: actor,
    resource,
    payload: {},
    now: new Date("2026-07-24T12:01:00.000Z")
  });
  assert.equal(authDirectory.calls, 1);
  assert.equal(result.integrityVerified, true);
  assert.equal(result.report.authorizationRevalidationRequired, true);
  await assert.rejects(
    retrieveOfficialReportQueryHandler().execute({
      client: {},
      coreRepository,
      directory: authDirectory,
      authenticationContext: actor,
      resource,
      payload: {},
      now: new Date("2026-07-24T12:16:00.000Z")
    }),
    { code: "tenant_resource_unavailable" }
  );
  await assert.rejects(
    readOfficialReportQueryHandler().execute({
      client: {},
      coreRepository,
      directory: directory({ allowed: false }),
      authenticationContext: actor,
      resource,
      payload: {},
      now
    }),
    { code: "tenant_resource_unavailable" }
  );
});

test("only the server-bound creator can revoke and close report access", async () => {
  const artifact = (await createOfficialReportCommandHandler().plan({
    client: {},
    coreRepository: {
      async getProjectionStateInTransaction() {
        return { value: obligation, aggregateVersion: 2 };
      },
      async listObligationEvidenceInTransaction() {
        return structuredClone(evidence);
      },
      async countOfficialReportArtifactsForCapacityInTransaction() {
        return 0;
      }
    },
    directory: directory(),
    authenticationContext: actor,
    authorizationDecision: {
      resourceType: "obligation",
      resourceId: obligation.obligationId
    },
    referenceHasher: referenceHasher(),
    payload: {
      format: "json",
      lifetimeSeconds: 900,
      schemaVersion: "official_report_create.v1"
    },
    now,
    requestId: "request-report-revoke",
    correlationId: "correlation-report-revoke"
  })).writes[0].value;
  const plan = await revokeOfficialReportCommandHandler().plan({
    client: {},
    coreRepository: {
      async getProjectionStateInTransaction(_client, type) {
        return type === CoreProjectionType.OFFICIAL_REPORT_ARTIFACT
          ? { value: artifact, aggregateVersion: 1 }
          : { value: obligation, aggregateVersion: 2 };
      },
      async getProjectionInTransaction() {
        return obligation;
      }
    },
    directory: directory(),
    authenticationContext: actor,
    authorizationDecision: {
      resourceType: "official_report",
      resourceId: artifact.officialReportId,
      resourceVersion: 1
    },
    referenceHasher: referenceHasher(),
    payload: {},
    reasonCode: "owner_withdrawal",
    now: new Date("2026-07-24T12:02:00.000Z"),
    requestId: "request-report-revoke-command",
    correlationId: "correlation-report-revoke-command"
  });
  assert.equal(plan.response.report.effectiveStatus, "revoked");
  assert.deepEqual(plan.authorizationResourceTransition, {
    resourceType: "official_report",
    resourceId: artifact.officialReportId,
    expectedStatus: "active",
    nextStatus: "closed",
    expectedVersion: 1
  });
});
