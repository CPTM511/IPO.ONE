import assert from "node:assert/strict";
import test from "node:test";
import {
  readCapitalPartnerPassportInboxQueryHandler,
  readCapitalPartnerSelfQueryHandler
} from "../src/index.js";

const authenticationContext = Object.freeze({
  tenantId: "tenant_test",
  actorId: "actor_capital_partner_test",
  actorType: "human"
});

const profile = Object.freeze({
  capitalPartnerId: "capital_partner_test",
  displayName: "Test Capital Partner",
  operatorActorId: authenticationContext.actorId,
  tenantId: authenticationContext.tenantId,
  status: "active",
  invitationOnly: true,
  sameTenantOnly: true,
  sandboxOnly: true,
  productionFundsAuthority: false,
  schemaVersion: "capital_partner_profile.v1"
});

function directory({ bound = true } = {}) {
  return {
    async resolveResource() {
      return bound ? {
        status: "active",
        actorAuthorized: true,
        bindingRelationship: "owner"
      } : undefined;
    }
  };
}

function referenceHasher() {
  return { hash: () => Buffer.alloc(32, 1).toString("base64url") };
}

test("Capital Partner self derives the exact active profile without caller scope", async () => {
  const response = await readCapitalPartnerSelfQueryHandler().execute({
    client: {},
    coreRepository: {
      async getCapitalPartnerProfileByOperatorInTransaction() { return profile; }
    },
    directory: directory(),
    authenticationContext,
    payload: {}
  });
  assert.deepEqual(response, {
    resource: {
      resourceType: "capital_partner_profile",
      resourceId: profile.capitalPartnerId
    },
    profile: {
      capitalPartnerId: profile.capitalPartnerId,
      displayName: profile.displayName
    },
    fundsAuthority: false,
    serverTruth: true,
    readOnly: true,
    schemaVersion: "tenant_capital_partner_self_view.v1"
  });
});

test("Capital Partner self fails closed on missing owner binding and caller payload", async () => {
  const base = {
    client: {},
    coreRepository: {
      async getCapitalPartnerProfileByOperatorInTransaction() { return profile; }
    },
    directory: directory({ bound: false }),
    authenticationContext
  };
  await assert.rejects(
    readCapitalPartnerSelfQueryHandler().execute({ ...base, payload: {} }),
    (error) => error.code === "workspace_recovery_unavailable"
  );
  await assert.rejects(
    readCapitalPartnerSelfQueryHandler().execute({ ...base, payload: { tenantId: "other" } }),
    (error) => error.code === "invalid_tenant_command_payload"
  );
});

function inboxCoreRepository() {
  const artifact = {
    creditPassportArtifactId: "credit_passport_artifact_test",
    artifactHash: `0x${"a".repeat(64)}`,
    version: 2,
    subjectId: "subject_test",
    sourceRiskDecisionId: "risk_decision_test",
    sourceDecisionHash: `0x${"b".repeat(64)}`,
    sourceDecisionPassportHash: `0x${"c".repeat(64)}`,
    verifierActorRefHash: `0x${"01".repeat(32)}`,
    purpose: "private_credit_review",
    selectedClaims: ["decision_outcome", "factor_authority"],
    issuedAt: "2026-08-13T00:00:00.000Z",
    expiresAt: "2026-08-13T01:00:00.000Z",
    status: "active",
    sameTenantOnly: true,
    sandboxOnly: true,
    productionAuthority: false,
    schemaVersion: "credit_passport_artifact.v1"
  };
  const decision = {
    riskDecisionId: "risk_decision_test",
    creditIntentId: "credit_intent_test",
    decisionHash: artifact.sourceDecisionHash,
    decisionPassport: { decisionPassportHash: artifact.sourceDecisionPassportHash },
    schemaVersion: "risk_decision.v3"
  };
  return {
    async getCapitalPartnerProfileByOperatorInTransaction() { return profile; },
    async getProjectionStateInTransaction(_client, type) {
      assert.equal(type, "credit_passport_artifact");
      return { value: artifact };
    },
    async getProjectionInTransaction(_client, type) {
      if (type === "risk_decision") return decision;
      if (type === "credit_intent") return {
        creditIntentId: decision.creditIntentId,
        subjectId: artifact.subjectId,
        status: "decided",
        sandboxOnly: true,
        productionFundsRequested: false,
        schemaVersion: "credit_intent.v1"
      };
      throw new Error(`unexpected projection ${type}`);
    }
  };
}

test("Capital Partner Passport inbox reverse-resolves only current verified authoring tuples", async () => {
  const calls = [];
  const response = await readCapitalPartnerPassportInboxQueryHandler().execute({
    client: {
      async query(text, values) {
        calls.push({ text, values });
        return {
          rowCount: 1,
          rows: [{
            artifact_id: "credit_passport_artifact_test",
            artifact_hash: `0x${"a".repeat(64)}`,
            artifact_version: 2
          }]
        };
      }
    },
    coreRepository: inboxCoreRepository(),
    directory: directory(),
    authenticationContext,
    referenceHasher: referenceHasher(),
    payload: {},
    now: new Date("2026-08-13T00:30:00.000Z")
  });
  assert.equal(response.count, 1);
  assert.equal(response.hasMore, false);
  assert.deepEqual(response.items[0], {
    resource: {
      resourceType: "credit_passport_artifact",
      resourceId: "credit_passport_artifact_test"
    },
    reviewContext: {
      creditIntentId: "credit_intent_test",
      artifactHash: `0x${"a".repeat(64)}`,
      artifactVersion: 2
    },
    summary: {
      claimCount: 2,
      purpose: "private_credit_review",
      issuedAt: "2026-08-13T00:00:00.000Z",
      expiresAt: "2026-08-13T01:00:00.000Z"
    }
  });
  assert.match(calls[0].text, /current_app_tenant_id\(\)/);
  assert.match(calls[0].text, /current_app_actor_id\(\)/);
  assert.match(calls[0].text, /relationship = 'verifier'/);
  assert.deepEqual(calls[0].values, [
    `0x${"01".repeat(32)}`,
    new Date("2026-08-13T00:30:00.000Z"),
    17
  ]);
});

test("Capital Partner Passport inbox fails closed on overflow or malformed candidate truth", async () => {
  for (const rows of [
    Array.from({ length: 17 }, (_, index) => ({
      artifact_id: `credit_passport_artifact_${index}`,
      artifact_hash: `0x${"a".repeat(64)}`,
      artifact_version: 1
    })),
    [{ artifact_id: "credit_passport_artifact_test", artifact_hash: "unsafe", artifact_version: 1 }]
  ]) {
    await assert.rejects(
      () => readCapitalPartnerPassportInboxQueryHandler().execute({
        client: { async query() { return { rows, rowCount: rows.length }; } },
        coreRepository: inboxCoreRepository(),
        directory: directory(),
        authenticationContext,
        referenceHasher: referenceHasher(),
        payload: {},
        now: new Date("2026-08-13T00:30:00.000Z")
      }),
      (error) => error.code === "workspace_recovery_unavailable"
    );
  }
});

test("Capital Partner Passport inbox fails closed on a duplicate durable binding row", async () => {
  const candidate = {
    artifact_id: "credit_passport_artifact_test",
    artifact_hash: `0x${"a".repeat(64)}`,
    artifact_version: 2
  };
  await assert.rejects(
    () => readCapitalPartnerPassportInboxQueryHandler().execute({
      client: {
        async query() {
          return { rowCount: 2, rows: [candidate, { ...candidate }] };
        }
      },
      coreRepository: inboxCoreRepository(),
      directory: directory(),
      authenticationContext,
      referenceHasher: referenceHasher(),
      payload: {},
      now: new Date("2026-08-13T00:30:00.000Z")
    }),
    (error) => error.code === "workspace_recovery_unavailable"
  );
});
