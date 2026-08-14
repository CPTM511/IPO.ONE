import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  createM1BAgentForeignOfferSetupReceipt,
  createM1BAgentPhaseReceipt,
  m1BAgentPhaseJsonBytes,
  validateM1BAgentPhaseReceipt,
  validateM1BAgentForeignOfferSetupReceipt,
  writeM1BAgentPhaseArtifactSetNonOverwriting,
  writeM1BAgentPhaseReceiptNonOverwriting
} from "../../../scripts/m1-b-agent-phase-receipt.mjs";

const SHA = "a".repeat(40);
const IMAGE = `sha256:${"b".repeat(64)}`;
const DIGEST = "c".repeat(64);
const TREE = "d".repeat(40);

function foreignOfferSetup() {
  const workflowId = `m1b-agent-foreign-offer-${SHA}`;
  const references = {
    agentActorId: "actor_agent_foreign",
    subjectId: "subject_agent_foreign",
    canonicalMandateId: "mandate_agent_canonical",
    mandateId: "mandate_agent_foreign",
    creditIntentId: "credit_intent_agent_foreign",
    riskDecisionId: "risk_decision_agent_foreign",
    creditOfferId: "credit_offer_agent_foreign"
  };
  const resourceTargets = [
    ["subject", "subject", references.subjectId],
    ["mandate", "subject", references.mandateId],
    ["credit_intent", "owner", references.creditIntentId],
    ["credit_offer", "owner", references.creditOfferId]
  ];
  const ownedResources = resourceTargets.map(
    ([resourceType, relationship, resourceId]) => ({
      resourceType,
      resourceRefHash: hashId(
        "m1_b_agent_foreign_offer_resource_reference",
        { resourceType, resourceId }
      ),
      relationship,
      resourceVersion: 1,
      bindingVersion: 1,
      status: "active"
    })
  );
  return createM1BAgentForeignOfferSetupReceipt({
    candidateReleaseId: SHA,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt: "2026-08-15T00:00:00.000Z",
    createdBeforeRestartAt: "2026-08-15T00:01:30.000Z",
    applicationMcp: {
      schemaVersion: "agent_credit_offer_workflow_receipt.v1",
      status: "offer_ready",
      transportProfile: "mcp_stdio_local",
      workflowId,
      correlationId: `correlation_agent_offer:${workflowId}:credit`,
      operationCount: 4,
      operations: [
        ["ipo_one_read_self", "pilotReadAgentSelf", "tenant_agent_subject_view.v2"],
        ["ipo_one_request_credit", "pilotRequestCredit", "tenant_credit_intent_created.v1"],
        ["ipo_one_read_credit_application", "pilotReadCreditApplication", "tenant_credit_application_view.v2"],
        ["ipo_one_evaluate_credit_application", "pilotEvaluateCreditApplication", "tenant_credit_application_evaluated.v2"]
      ].map(([tool, operationId, responseSchemaVersion], index) => ({
        sequence: index + 1,
        tool,
        operationId,
        requestId: `request_agent_offer:${workflowId}:${String(index + 1).padStart(2, "0")}`,
        replayed: false,
        responseSchemaVersion
      })),
      nonAuthorizing: true,
      fundsAuthority: false,
      credentialsIncluded: false,
      remoteMcpEnabled: false
    },
    references,
    ownershipProof: {
      agentActorRefHash: hashId(
        "m1_b_agent_foreign_offer_actor_reference",
        { actorId: references.agentActorId }
      ),
      membershipRefHash: `0x${"2".repeat(64)}`,
      resourceManifestHash: hashId(
        "m1_b_agent_foreign_offer_resource_manifest",
        ownedResources
      ),
      ownedResources,
      activeAgentOwnership: true
    },
    offer: {
      creditOfferHash: `0x${"8".repeat(64)}`,
      termsHash: `0x${"9".repeat(64)}`,
      disclosureRef: "urn:ipo.one:disclosure:agent-foreign:v1",
      status: "offered",
      schemaVersion: "credit_offer.v1",
      validUntil: "2026-08-16T00:00:00.000Z",
      acceptedAt: null,
      sandboxOnly: true,
      productionFundsApproved: false
    },
    lifecycleAbsence: {
      acceptanceCount: 0,
      obligationCount: 0,
      executionCount: 0,
      repaymentCount: 0,
      ledgerTransactionCount: 0
    }
  });
}

function artifacts(phase) {
  const suffixes = phase === "before_restart"
    ? [
        "application_handoff",
        "offer_receipt",
        "runtime_handoff",
        "lifecycle_result",
        "mcp_receipt",
        "agent_foreign_offer_setup"
      ]
    : ["application_handoff", "offer_receipt", "runtime_handoff", "canonical_recovery", "recovery_receipt"];
  return suffixes.map((id, index) => ({
    id,
    relativePath: `.ipo-one/local-stack/agent-workflows/${phase}-${index}.json`,
    sha256: `${index}`.repeat(64)
  }));
}

function receipt(phase = "before_restart") {
  const foreignOfferSetupArtifact = {
    id: "agent_foreign_offer_setup",
    relativePath: ".ipo-one/local-stack/agent-workflows/foreign-setup.json",
    sha256: "f".repeat(64),
    completedAt: "2026-08-15T00:01:30.000Z"
  };
  const extractedArtifacts = artifacts(phase);
  if (phase === "before_restart") {
    extractedArtifacts[extractedArtifacts.length - 1] = {
      id: foreignOfferSetupArtifact.id,
      relativePath: foreignOfferSetupArtifact.relativePath,
      sha256: foreignOfferSetupArtifact.sha256
    };
  }
  return createM1BAgentPhaseReceipt({
    candidateReleaseId: SHA,
    acceptancePhase: phase,
    acceptanceMode: phase === "before_restart"
      ? "before_restart_executed"
      : "after_restart_recovered",
    runtimeImageId: IMAGE,
    databaseStartedAt: phase === "before_restart"
      ? "2026-08-15T00:00:00.000Z"
      : "2026-08-15T00:10:00.000Z",
    startedAt: phase === "before_restart"
      ? "2026-08-15T00:01:00.000Z"
      : "2026-08-15T00:11:00.000Z",
    completedAt: phase === "before_restart"
      ? "2026-08-15T00:02:00.000Z"
      : "2026-08-15T00:12:00.000Z",
    acceptanceArtifact: {
      id: phase === "before_restart" ? "agent_before" : "agent_after",
      relativePath: `.ipo-one/local-stack/agent-workflows/${phase}.acceptance.json`,
      sha256: DIGEST
    },
    foreignOfferSetupArtifact,
    extractedArtifacts
  });
}

test("Agent phase receipts bind exact before and recovery-only after completion", () => {
  const before = receipt();
  const after = receipt("after_restart");
  assert.equal(before.producerOwnedClock, true);
  assert.equal(before.recoveryOnly, false);
  assert.equal(after.recoveryOnly, true);
  assert.equal(
    validateM1BAgentPhaseReceipt(after, {
      candidateReleaseId: SHA,
      runtimeImageId: IMAGE,
      acceptancePhase: "after_restart",
      databaseStartedAt: "2026-08-15T00:10:00.000Z"
    }).acceptanceArtifact.sha256,
    DIGEST
  );
});

test("foreign Agent setup receipt seals exactly four application-only MCP requests and zero continuation", () => {
  const setup = foreignOfferSetup();
  assert.equal(setup.applicationMcp.operationCount, 4);
  assert.deepEqual(
    setup.applicationMcp.operations.map(({ operationId }) => operationId),
    [
      "pilotReadAgentSelf",
      "pilotRequestCredit",
      "pilotReadCreditApplication",
      "pilotEvaluateCreditApplication"
    ]
  );
  assert.equal(setup.lifecycleContinuationPerformed, false);
  assert.equal(Object.values(setup.lifecycleAbsence).every((count) => count === 0), true);
  assert.equal(
    validateM1BAgentForeignOfferSetupReceipt(setup, {
      candidateReleaseId: SHA,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE
    }).references.creditOfferId,
    "credit_offer_agent_foreign"
  );
});

test("foreign Agent setup rejects candidate, operation, Offer, and lifecycle tampering", () => {
  const valid = foreignOfferSetup();
  const changed = [
    { ...valid, candidateReleaseId: "e".repeat(40) },
    {
      ...valid,
      applicationMcp: {
        ...valid.applicationMcp,
        operations: valid.applicationMcp.operations.map((operation, index) =>
          index === 2 ? { ...operation, operationId: "pilotAcceptCreditOffer" } : operation)
      }
    },
    { ...valid, offer: { ...valid.offer, status: "accepted" } },
    { ...valid, offer: { ...valid.offer, schemaVersion: "credit_offer.v2" } },
    {
      ...valid,
      lifecycleAbsence: { ...valid.lifecycleAbsence, obligationCount: 1 }
    }
  ];
  for (const receipt of changed) {
    assert.throws(
      () => validateM1BAgentForeignOfferSetupReceipt(receipt),
      /invalid/
    );
  }
});

test("Agent phase receipt rejects timestamp, phase, digest, and extra-key tampering", () => {
  const valid = receipt();
  for (const changed of [
    { ...valid, completedAt: "2026-08-15T00:00:30.000Z" },
    { ...valid, acceptanceMode: "after_restart_recovered" },
    {
      ...valid,
      acceptanceArtifact: { ...valid.acceptanceArtifact, sha256: "not-a-digest" }
    },
    { ...valid, sessionToken: "forbidden" }
  ]) {
    assert.throws(() => validateM1BAgentPhaseReceipt(changed), /invalid/);
  }
});

test("Agent phase receipt write is 0600, atomic, and refuses overwrite", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "ipo-one-agent-phase-"));
  const path = resolve(directory, "phase.json");
  try {
    await writeM1BAgentPhaseReceiptNonOverwriting(path, receipt());
    const metadata = await lstat(path);
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(path, "utf8")).candidateReleaseId, SHA);
    await assert.rejects(
      writeM1BAgentPhaseReceiptNonOverwriting(path, receipt()),
      /Refused to overwrite/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Agent exact phase retry leaves every already sealed target byte unchanged", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "ipo-one-agent-phase-set-"));
  const acceptancePath = resolve(directory, "acceptance.json");
  const extractedPath = resolve(directory, "mcp.json");
  const first = [
    { path: acceptancePath, bytes: m1BAgentPhaseJsonBytes({ version: 1 }) },
    { path: extractedPath, bytes: m1BAgentPhaseJsonBytes({ version: 1, mcp: true }) }
  ];
  try {
    await writeM1BAgentPhaseArtifactSetNonOverwriting(first);
    const before = await Promise.all(first.map(({ path }) => readFile(path)));
    await assert.rejects(
      writeM1BAgentPhaseArtifactSetNonOverwriting(first.map(({ path }) => ({
        path,
        bytes: m1BAgentPhaseJsonBytes({ version: 2 })
      }))),
      /Refused to overwrite/
    );
    const after = await Promise.all(first.map(({ path }) => readFile(path)));
    assert.deepEqual(after, before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
