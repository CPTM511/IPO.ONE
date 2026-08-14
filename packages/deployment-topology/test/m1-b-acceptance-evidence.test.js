import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  M1_B_ACCEPTANCE_ROLES,
  M1_B_BROWSER_CHECKS,
  M1_B_JOURNEY_STEPS,
  M1_B_NEGATIVE_CASES,
  M1_B_RISK_MFA_OPERATION_IDS,
  M1BAcceptanceEvidenceError,
  verifyM1BAcceptanceEvidence,
  verifyM1BAcceptanceEvidenceV1Historical,
  verifyM1BHostedCapabilityDocument,
  verifyM1BHostedReadinessDocument
} from "../../release-governance/src/m1-b-acceptance-evidence.js";
import { ActorType } from "../../../modules/authentication/src/index.js";
import { AuthorizationPolicyRegistry } from "../../../modules/authorization/src/index.js";
import { MAX_LAUNCH_JSON_BYTES } from "../../release-governance/src/index.js";

const SHA = "a".repeat(40);
const TREE = "b".repeat(40);

function artifact(id, kind = "runtime_receipt", sourceRuntime = "hosted_exact_commit") {
  return {
    id,
    kind,
    relativePath: `output/playwright/m1-b-p0-5/${id}.json`,
    sha256: createHash("sha256").update(id).digest("hex"),
    sourceRuntime,
    redacted: true,
    containsSecrets: false,
    containsRawPii: false,
    containsSessionMaterial: false,
    fixtureGenerated: false
  };
}

function validEvidence() {
  const artifacts = [];
  let counter = 0;
  const nextArtifact = (kind = "runtime_receipt", source = "hosted_exact_commit") => {
    counter += 1;
    const id = `artifact_${String(counter).padStart(3, "0")}`;
    artifacts.push(artifact(id, kind, source));
    return [id];
  };
  const browserMatrix = (source, roles = M1_B_ACCEPTANCE_ROLES) => roles.flatMap((role) =>
    M1_B_BROWSER_CHECKS.map((check) => ({
      role,
      check,
      status: "passed",
      artifactIds: [
        ...nextArtifact("screenshot", source),
        ...nextArtifact("runtime_receipt", source)
      ]
    }))
  );
  const journeys = Object.fromEntries(
    M1_B_ACCEPTANCE_ROLES.map((role) => [
      role,
      M1_B_JOURNEY_STEPS[role].map((id) => ({
        id,
        status: "passed",
        transport: role === "principal_agent" && new Set([
          "agent_application",
          "offer",
          "acceptance",
          "mcp_execution",
          "repayment",
          "evidence"
        ]).has(id)
          ? "agent_mcp"
          : "human_web",
        canonicalPersistence: "postgresql",
        fixtureUsed: false,
        artifactIds: role === "principal_agent" && new Set([
          "agent_application",
          "offer",
          "acceptance",
          "mcp_execution",
          "repayment",
          "evidence"
        ]).has(id)
          ? [
              ...nextArtifact("runtime_receipt", "local_exact_commit"),
              ...nextArtifact("agent_mcp_receipt", "local_exact_commit")
            ]
          : nextArtifact("runtime_receipt", "local_exact_commit")
      }))
    ])
  );
  const negativeCases = Object.fromEntries(
    Object.entries(M1_B_NEGATIVE_CASES).map(([group, ids]) => [
      group,
      ids.map((id) => ({
        id,
        status: group === "human" && id === "duplicate_acceptance"
          ? "passed_exact_replay"
          : "passed_fail_closed",
        additionalEffectCount: 0,
        nonEnumerating: !(group === "human" && id === "duplicate_acceptance"),
        artifactIds: nextArtifact("negative_receipt", "local_exact_commit")
      }))
    ])
  );
  const restartArtifacts = [
    ...nextArtifact("restart_log", "local_exact_commit"),
    ...nextArtifact("postgres_receipt", "local_exact_commit")
  ];
  const agentBeforeAcceptance = nextArtifact(
    "runtime_receipt",
    "local_exact_commit"
  )[0];
  const agentApplicationMcp = nextArtifact(
    "agent_mcp_receipt",
    "local_exact_commit"
  )[0];
  const agentRuntimeMcp = nextArtifact(
    "agent_mcp_receipt",
    "local_exact_commit"
  )[0];
  const agentAfterAcceptance = nextArtifact(
    "runtime_receipt",
    "local_exact_commit"
  )[0];
  const agentRecoveryReceipt = nextArtifact(
    "runtime_receipt",
    "local_exact_commit"
  )[0];
  const localReleaseIdentity = nextArtifact(
    "release_identity",
    "local_exact_commit"
  )[0];
  const riskBoundaryArtifact = nextArtifact(
    "negative_receipt",
    "local_exact_commit"
  )[0];
  const humanCriticalArtifact = nextArtifact(
    "postgres_receipt",
    "local_exact_commit"
  )[0];
  const capitalPartnerCriticalArtifact = nextArtifact(
    "postgres_receipt",
    "local_exact_commit"
  )[0];
  restartArtifacts.push(riskBoundaryArtifact);
  return {
    schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v2",
    status: "passed",
    capturedAt: "2026-08-13T12:00:00.000Z",
    source: {
      commitSha: SHA,
      treeSha: TREE,
      sourceMaterialization: "tracked_git_archive",
      untrackedInputIncluded: false,
      trackedWorktreeClean: true,
      headMatchesCommit: true
    },
    runtime: {
      canonicalProductTruth: "tenant_protocol_gateway_shared_kernel_postgresql",
      local: {
        status: "passed",
        releaseId: SHA,
        imageRevision: SHA,
        pilotRevision: SHA,
        workerRevision: SHA,
        portBase: 8787,
        postgresBacked: true,
        fixtureHost: false,
        releaseIdentityArtifactId: localReleaseIdentity,
        beforeRestartAcceptance: "passed",
        afterRestartAcceptance: "passed",
        agentAcceptance: {
          schemaVersion: "local_agent_release_acceptance_linkage.v1",
          status: "passed",
          candidateReleaseId: SHA,
          candidateMarker: `m1b.agent.${SHA}`,
          accountHash: `0x${"1".repeat(64)}`,
          subjectId: "subject_candidate",
          mandateId: "mandate_candidate",
          creditIntentId: "credit_intent_candidate",
          creditOfferId: "credit_offer_candidate",
          obligationId: "obligation_candidate",
          facilityId: "facility_candidate",
          creditLineId: "credit_line_candidate",
          beforeRestart: {
            acceptanceMode: "before_restart_executed",
            databaseStartedAt: "2026-08-13T11:00:00.000Z",
            acceptanceArtifactId: agentBeforeAcceptance,
            applicationMcpArtifactId: agentApplicationMcp,
            runtimeMcpArtifactId: agentRuntimeMcp
          },
          afterRestart: {
            acceptanceMode: "after_restart_recovered",
            databaseStartedAt: "2026-08-13T11:30:00.000Z",
            acceptanceArtifactId: agentAfterAcceptance,
            recoveryReceiptArtifactId: agentRecoveryReceipt
          }
        },
        humanAcceptance: {
          schemaVersion: "local_human_release_acceptance_linkage.v1",
          status: "passed",
          candidateReleaseId: SHA,
          databaseStartedAt: "2026-08-13T11:30:00.000Z",
          subjectId: "subject_human_candidate",
          consentId: "consent_human_candidate",
          creditIntentId: "credit_intent_human_candidate",
          riskDecisionId: "risk_decision_human_candidate",
          creditOfferId: "credit_offer_human_current",
          creditOfferHash: `0x${"2".repeat(64)}`,
          termsHash: `0x${"3".repeat(64)}`,
          offerAggregateVersion: 2,
          creditOfferAcceptanceId: "credit_offer_acceptance_human_candidate",
          obligationId: "obligation_human_candidate",
          repaymentId: "repayment_human_candidate",
          artifactId: humanCriticalArtifact
        },
        capitalPartnerAcceptance: {
          schemaVersion: "local_capital_partner_release_acceptance_linkage.v1",
          status: "passed",
          candidateReleaseId: SHA,
          databaseStartedAt: "2026-08-13T11:30:00.000Z",
          capitalPartnerId: "capital_partner_candidate",
          currentLineage: {
            creditIntentId: "credit_intent_cp_current",
            creditPassportArtifactId: "credit_passport_cp_current",
            preliminaryOfferId: "credit_offer_cp_preliminary",
            currentOfferId: "credit_offer_cp_current",
            currentOfferHash: `0x${"4".repeat(64)}`,
            currentTermsHash: `0x${"5".repeat(64)}`,
            currentOfferAggregateVersion: 1
          },
          withdrawalLineage: {
            creditIntentId: "credit_intent_cp_withdrawal",
            creditPassportArtifactId: "credit_passport_cp_withdrawal",
            withdrawnOfferId: "credit_offer_cp_withdrawn"
          },
          artifactId: capitalPartnerCriticalArtifact
        },
        origins: {
          human: "http://127.0.0.1:8787/",
          principal_agent: "http://127.0.0.1:8788/",
          capital_partner: "http://127.0.0.1:8790/",
          risk_operations: "http://127.0.0.1:8789/"
        }
      },
      hosted: {
        status: "passed",
        releaseId: SHA,
        productProfile: "deployable_sandbox_vertical_slice",
        postgresBacked: true,
        fixtureHost: false,
        surfaces: ["primary"].map((deploymentRole) => ({
          deploymentRole,
          origin: `https://${deploymentRole}.ipo.one/`,
          capabilityUrl: `https://${deploymentRole}.ipo.one/.well-known/ipo-one.json`,
          readinessUrl: `https://${deploymentRole}.ipo.one/readyz`,
          reportedReleaseId: SHA,
          fixtureHost: false,
          postgresBacked: true
        }))
      }
    },
    browser: {
      driver: "playwright_cli",
      realBrowser: true,
      humanRoleAuthentication: "operator_confirmed_invited_wallet_siwe",
      authenticationBypassUsed: false,
      browserStorageAuthority: false,
      consoleErrors: 0,
      networkErrors: 0,
      localMatrix: browserMatrix("local_exact_commit"),
      hostedMatrix: browserMatrix("hosted_exact_commit", ["principal_agent"])
    },
    journeys,
    negativeCases,
    riskBoundary: {
      schemaVersion: "m1_b_risk_boundary_linkage.v1",
      status: "passed_fail_closed",
      releaseLevel: "L1_PUBLIC_SANDBOX",
      candidateReleaseId: SHA,
      surfaceDisposition: "private_unavailable",
      hostedSurfaceDeployed: false,
      strongMfaTopologyComposed: false,
      siweOnlySessionObserved: true,
      requiresRecentMfaPolicyPreserved: true,
      weakAuthFallbackAvailable: false,
      weakAuthFallbackUsed: false,
      protectedReadDecision: "deny",
      protectedMutationDecision: "deny",
      denialReasonCode: "actor_capability_rejected",
      privilegedMutationCount: 0,
      postRestartFailClosed: true,
      deferredGate: "M1_C_L2_CLOSED_NO_FUNDS",
      artifactId: riskBoundaryArtifact
    },
    restart: {
      databaseRetained: true,
      pilotRestarted: true,
      workerRestarted: true,
      humanRecovered: true,
      agentRecovered: true,
      capitalPartnerRecovered: true,
      riskFailClosedAfterRestart: true,
      outboxDuplicateEffects: 0,
      artifactIds: restartArtifacts
    },
    authority: {
      realFundsEnabled: false,
      externalFundsMovementEnabled: false,
      productionSignerAuthorityEnabled: false,
      arbitraryWithdrawalEnabled: false,
      venueWriteAuthorityEnabled: false,
      realHumanLendingEnabled: false,
      mainnetEnabled: false,
      protocolFeesEnabled: false,
      browserCredentialCaptureEnabled: false
    },
    artifacts
  };
}

function historicalV1Evidence() {
  const evidence = validEvidence();
  evidence.schemaVersion = "ipo.one.m1-b-p0-5-acceptance-evidence/v1";
  const duplicateAcceptance = evidence.negativeCases.human.find(
    ({ id }) => id === "duplicate_acceptance"
  );
  duplicateAcceptance.status = "passed_fail_closed";
  duplicateAcceptance.nonEnumerating = true;
  delete evidence.riskBoundary;
  delete evidence.runtime.local.humanAcceptance;
  delete evidence.runtime.local.capitalPartnerAcceptance;
  evidence.runtime.hosted.surfaces.push({
    deploymentRole: "risk",
    origin: "https://risk.ipo.one/",
    capabilityUrl: "https://risk.ipo.one/.well-known/ipo-one.json",
    readinessUrl: "https://risk.ipo.one/readyz",
    reportedReleaseId: SHA,
    fixtureHost: false,
    postgresBacked: true
  });
  for (const check of M1_B_BROWSER_CHECKS) {
    const suffix = `historical_risk_${check}`;
    const browserId = `${suffix}_browser`;
    const runtimeId = `${suffix}_runtime`;
    evidence.artifacts.push(
      artifact(browserId, "screenshot", "local_exact_commit"),
      artifact(runtimeId, "runtime_receipt", "local_exact_commit")
    );
    evidence.browser.localMatrix.push({
      role: "risk_operations",
      check,
      status: "passed",
      artifactIds: [browserId, runtimeId]
    });
    const hostedBrowserId = `${suffix}_hosted_browser`;
    const hostedRuntimeId = `${suffix}_hosted_runtime`;
    evidence.artifacts.push(
      artifact(hostedBrowserId, "screenshot", "hosted_exact_commit"),
      artifact(hostedRuntimeId, "runtime_receipt", "hosted_exact_commit")
    );
    evidence.browser.hostedMatrix.push({
      role: "risk_operations",
      check,
      status: "passed",
      artifactIds: [hostedBrowserId, hostedRuntimeId]
    });
  }
  evidence.journeys.risk_operations = [
    "risk_sign_in",
    "portfolio_queue_recovery",
    "protective_control",
    "audit_evidence"
  ].map((id) => {
    const artifactId = `historical_${id}_runtime`;
    evidence.artifacts.push(
      artifact(artifactId, "runtime_receipt", "local_exact_commit")
    );
    return {
      id,
      status: "passed",
      transport: "human_web",
      canonicalPersistence: "postgresql",
      fixtureUsed: false,
      artifactIds: [artifactId]
    };
  });
  evidence.restart.riskRecovered = true;
  delete evidence.restart.riskFailClosedAfterRestart;
  return evidence;
}

function hasIssue(fragment) {
  return (error) =>
    error instanceof M1BAcceptanceEvidenceError &&
    error.issues.some((issue) => issue.includes(fragment));
}

test("complete exact-commit P0-5 Evidence verifies", () => {
  const evidence = validEvidence();
  assert.deepEqual(
    verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA }),
    {
      status: "verified",
      commitSha: SHA,
      roleCount: 4,
      positiveJourneyRoleCount: 3,
      browserCheckCount: 32,
      journeyStepCount: 28,
      negativeCaseCount: 16,
      riskBoundaryCheckCount: 4,
      artifactCount: evidence.artifacts.length,
      canonicalProductTruth: "tenant_protocol_gateway_shared_kernel_postgresql",
      deploymentStatus: "passed",
      realFundsEnabled: false
    }
  );
});

test("v2 accepts captured TAP artifacts and exact duplicate replay while v1 stays historical", () => {
  const evidence = validEvidence();
  evidence.artifacts.push(
    artifact("negative_duplicate_tap", "tap_log", "local_exact_commit")
  );
  assert.equal(
    verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA }).status,
    "verified"
  );

  const mislabeledReplay = validEvidence();
  const duplicate = mislabeledReplay.negativeCases.human.find(
    ({ id }) => id === "duplicate_acceptance"
  );
  duplicate.status = "passed_fail_closed";
  duplicate.nonEnumerating = true;
  assert.throws(
    () => verifyM1BAcceptanceEvidence(mislabeledReplay, { expectedCommitSha: SHA }),
    (error) => hasIssue("duplicate_acceptance")(error) ||
      hasIssue("passed_exact_replay")(error) || hasIssue("nonEnumerating")(error)
  );

  const historical = historicalV1Evidence();
  historical.artifacts.push(
    artifact("historical_tap", "tap_log", "local_exact_commit")
  );
  assert.throws(
    () => verifyM1BAcceptanceEvidenceV1Historical(historical, {
      expectedCommitSha: SHA
    }),
    hasIssue("kind is not accepted")
  );
});

test("v2 accepts sealed negative source proofs while v1 stays historical", () => {
  const evidence = validEvidence();
  evidence.artifacts.push(
    artifact(
      "negative_source_proof_human_wrong_tenant",
      "negative_source_proof",
      "local_exact_commit"
    )
  );
  assert.equal(
    verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA }).status,
    "verified"
  );

  const historical = historicalV1Evidence();
  historical.artifacts.push(
    artifact(
      "negative_source_proof_human_wrong_tenant",
      "negative_source_proof",
      "local_exact_commit"
    )
  );
  assert.throws(
    () => verifyM1BAcceptanceEvidenceV1Historical(historical, {
      expectedCommitSha: SHA
    }),
    hasIssue("kind is not accepted")
  );
});

test("Risk boundary operation registry cannot drift from Risk and Operations MFA policy", () => {
  const protectedOperationIds = new AuthorizationPolicyRegistry()
    .list()
    .filter((policy) => policy.requiresRecentMfaActorTypes.some((actorType) =>
      [ActorType.RISK_OPERATOR, ActorType.OPERATIONS_OPERATOR].includes(actorType)
    ))
    .map(({ operationId }) => operationId)
    .sort();
  assert.deepEqual(M1_B_RISK_MFA_OPERATION_IDS, protectedOperationIds);
});

test("complete dual-runtime Evidence fits the canonical private JSON bound", () => {
  const canonicalJson = `${JSON.stringify(validEvidence(), null, 2)}\n`;
  assert.ok(Buffer.byteLength(canonicalJson, "utf8") <= MAX_LAUNCH_JSON_BYTES);
});

test("deployment-pending Evidence requires no hosted surfaces or browser rows", () => {
  const evidence = validEvidence();
  evidence.runtime.hosted.status = "deployment_pending";
  evidence.runtime.hosted.releaseId = null;
  evidence.runtime.hosted.postgresBacked = false;
  evidence.runtime.hosted.surfaces = [];
  evidence.browser.hostedMatrix = [];
  const result = verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA });
  assert.equal(result.browserCheckCount, 24);
  assert.equal(result.deploymentStatus, "deployment_pending");

  const mixed = validEvidence();
  mixed.runtime.hosted.status = "deployment_pending";
  mixed.runtime.hosted.releaseId = null;
  mixed.runtime.hosted.postgresBacked = false;
  assert.throws(
    () => verifyM1BAcceptanceEvidence(mixed, { expectedCommitSha: SHA }),
    hasIssue("must be empty while deployment is pending")
  );
  const falseDeploymentClaim = validEvidence();
  falseDeploymentClaim.runtime.hosted.status = "deployment_pending";
  falseDeploymentClaim.runtime.hosted.postgresBacked = false;
  falseDeploymentClaim.runtime.hosted.surfaces = [];
  falseDeploymentClaim.browser.hostedMatrix = [];
  assert.throws(
    () => verifyM1BAcceptanceEvidence(falseDeploymentClaim, {
      expectedCommitSha: SHA
    }),
    hasIssue("hosted.releaseId")
  );
});

test("operator wallet acceptance may use controlled Chrome as the real browser", () => {
  const evidence = validEvidence();
  evidence.browser.driver = "chrome_control";
  assert.equal(
    verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA }).status,
    "verified"
  );
});

test("wrong source/runtime SHA and dirty source fail closed", () => {
  const wrongSource = validEvidence();
  wrongSource.source.commitSha = "d".repeat(40);
  assert.throws(
    () => verifyM1BAcceptanceEvidence(wrongSource, { expectedCommitSha: SHA }),
    hasIssue("source.commitSha")
  );
  const wrongRuntime = validEvidence();
  wrongRuntime.runtime.local.workerRevision = "e".repeat(40);
  assert.throws(
    () => verifyM1BAcceptanceEvidence(wrongRuntime, { expectedCommitSha: SHA }),
    hasIssue("workerRevision")
  );
  const dirty = validEvidence();
  dirty.source.trackedWorktreeClean = false;
  assert.throws(
    () => verifyM1BAcceptanceEvidence(dirty, { expectedCommitSha: SHA }),
    hasIssue("trackedWorktreeClean")
  );
  const unsafeContext = validEvidence();
  unsafeContext.source.untrackedInputIncluded = true;
  assert.throws(
    () => verifyM1BAcceptanceEvidence(unsafeContext, { expectedCommitSha: SHA }),
    hasIssue("untrackedInputIncluded")
  );
});

test("Agent release linkage requires exact phases, identifiers, and local artifacts", () => {
  const staleRestart = validEvidence();
  staleRestart.runtime.local.agentAcceptance.afterRestart.databaseStartedAt =
    staleRestart.runtime.local.agentAcceptance.beforeRestart.databaseStartedAt;
  assert.throws(
    () => verifyM1BAcceptanceEvidence(staleRestart, { expectedCommitSha: SHA }),
    hasIssue("must be later than the pre-restart PostgreSQL start")
  );

  const wrongCandidate = validEvidence();
  wrongCandidate.runtime.local.agentAcceptance.candidateMarker =
    `m1b.agent.${"d".repeat(40)}`;
  assert.throws(
    () => verifyM1BAcceptanceEvidence(wrongCandidate, { expectedCommitSha: SHA }),
    hasIssue("candidateMarker")
  );

  const hostedReceipt = validEvidence();
  const applicationId = hostedReceipt.runtime.local.agentAcceptance
    .beforeRestart.applicationMcpArtifactId;
  hostedReceipt.artifacts.find(
    (artifact) => artifact.id === applicationId
  ).sourceRuntime = "hosted_exact_commit";
  assert.throws(
    () => verifyM1BAcceptanceEvidence(hostedReceipt, { expectedCommitSha: SHA }),
    hasIssue("incompatible runtime source")
  );
});

test("isolated local ports derive exact role origins", () => {
  const evidence = validEvidence();
  evidence.runtime.local.portBase = 18887;
  evidence.runtime.local.origins = {
    human: "http://127.0.0.1:18887/",
    principal_agent: "http://127.0.0.1:18888/",
    risk_operations: "http://127.0.0.1:18889/",
    capital_partner: "http://127.0.0.1:18890/"
  };
  assert.equal(
    verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA }).status,
    "verified"
  );
  evidence.runtime.local.origins.risk_operations = "http://127.0.0.1:8789/";
  assert.throws(
    () => verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA }),
    hasIssue("origins.risk_operations")
  );
});

test("current M1-B rejects hosted Risk while the historical v1 verifier remains callable", () => {
  const current = validEvidence();
  current.runtime.hosted.surfaces.push({
    deploymentRole: "risk",
    origin: "https://risk.ipo.one/",
    capabilityUrl: "https://risk.ipo.one/.well-known/ipo-one.json",
    readinessUrl: "https://risk.ipo.one/readyz",
    reportedReleaseId: SHA,
    fixtureHost: false,
    postgresBacked: true
  });
  assert.throws(
    () => verifyM1BAcceptanceEvidence(current, { expectedCommitSha: SHA }),
    hasIssue("one to 1")
  );

  const historical = historicalV1Evidence();
  assert.equal(
    verifyM1BAcceptanceEvidenceV1Historical(historical, {
      expectedCommitSha: SHA
    }).status,
    "verified"
  );
  const inventedRole = validEvidence();
  inventedRole.runtime.hosted.surfaces[0].deploymentRole = "capital_partner";
  assert.throws(
    () => verifyM1BAcceptanceEvidence(inventedRole, { expectedCommitSha: SHA }),
    hasIssue("deploymentRole")
  );
});

test("fixture and loopback hosted surfaces cannot become release Evidence", () => {
  const fixture = validEvidence();
  fixture.runtime.hosted.fixtureHost = true;
  fixture.artifacts[0].fixtureGenerated = true;
  assert.throws(
    () => verifyM1BAcceptanceEvidence(fixture, { expectedCommitSha: SHA }),
    (error) => hasIssue("fixtureHost")(error) && hasIssue("fixtureGenerated")(error)
  );
  const loopback = validEvidence();
  loopback.runtime.hosted.surfaces[0].origin = "http://127.0.0.1:8787/";
  loopback.runtime.hosted.surfaces[0].capabilityUrl = "http://127.0.0.1:8787/.well-known/ipo-one.json";
  loopback.runtime.hosted.surfaces[0].readinessUrl = "http://127.0.0.1:8787/readyz";
  assert.throws(
    () => verifyM1BAcceptanceEvidence(loopback, { expectedCommitSha: SHA }),
    hasIssue("non-loopback HTTPS origin")
  );
});

test("v2 permits only the exact private Agent workflow artifact prefix", () => {
  const current = validEvidence();
  const currentAgentId = current.runtime.local.agentAcceptance.beforeRestart
    .acceptanceArtifactId;
  current.artifacts.find(({ id }) => id === currentAgentId).relativePath =
    `.ipo-one/local-stack/agent-workflows/${SHA}.agent-before.acceptance.v1.json`;
  assert.equal(
    verifyM1BAcceptanceEvidence(current, { expectedCommitSha: SHA }).status,
    "verified"
  );

  const outside = validEvidence();
  const outsideAgentId = outside.runtime.local.agentAcceptance.beforeRestart
    .acceptanceArtifactId;
  outside.artifacts.find(({ id }) => id === outsideAgentId).relativePath =
    `.ipo-one/local-stack/other/${SHA}.agent-before.acceptance.v1.json`;
  assert.throws(
    () => verifyM1BAcceptanceEvidence(outside, { expectedCommitSha: SHA }),
    hasIssue("relativePath")
  );

  const historical = historicalV1Evidence();
  const historicalAgentId = historical.runtime.local.agentAcceptance.beforeRestart
    .acceptanceArtifactId;
  historical.artifacts.find(({ id }) => id === historicalAgentId).relativePath =
    `.ipo-one/local-stack/agent-workflows/${SHA}.agent-before.acceptance.v1.json`;
  assert.throws(
    () => verifyM1BAcceptanceEvidenceV1Historical(historical, {
      expectedCommitSha: SHA
    }),
    hasIssue("relativePath")
  );
});

test("missing local or hosted browser/recovery and incomplete journey rows fail closed", () => {
  const browser = validEvidence();
  browser.browser.localMatrix.pop();
  assert.throws(
    () => verifyM1BAcceptanceEvidence(browser, { expectedCommitSha: SHA }),
    hasIssue("localMatrix must contain exactly 24")
  );
  const hostedBrowser = validEvidence();
  hostedBrowser.browser.hostedMatrix.pop();
  assert.throws(
    () => verifyM1BAcceptanceEvidence(hostedBrowser, { expectedCommitSha: SHA }),
    hasIssue("hostedMatrix must contain exactly 8")
  );
  const journey = validEvidence();
  journey.journeys.human[5].canonicalPersistence = "browser_storage";
  journey.browser.browserStorageAuthority = true;
  assert.throws(
    () => verifyM1BAcceptanceEvidence(journey, { expectedCommitSha: SHA }),
    (error) => hasIssue("canonicalPersistence")(error) && hasIssue("browserStorageAuthority")(error)
  );
});

test("hosted browser matrix is exact for the actually deployed surfaces", () => {
  const extra = validEvidence();
  extra.browser.hostedMatrix.push(structuredClone(extra.browser.hostedMatrix[0]));
  assert.throws(
    () => verifyM1BAcceptanceEvidence(extra, { expectedCommitSha: SHA }),
    hasIssue("hostedMatrix must contain exactly 8")
  );

  const wrongRole = validEvidence();
  for (const entry of wrongRole.browser.hostedMatrix) {
    if (entry.role === "principal_agent") entry.role = "human";
  }
  assert.throws(
    () => verifyM1BAcceptanceEvidence(wrongRole, { expectedCommitSha: SHA }),
    (error) =>
      hasIssue("role is not required by a deployed surface")(error) &&
      hasIssue("missing principal_agent:desktop")(error)
  );
});

test("row evidence kind rules reject screenshots without durable receipts", () => {
  const browser = validEvidence();
  browser.browser.localMatrix[0].artifactIds = [
    browser.browser.localMatrix[0].artifactIds[0]
  ];
  assert.throws(
    () => verifyM1BAcceptanceEvidence(browser, { expectedCommitSha: SHA }),
    hasIssue("runtime_receipt or postgres_receipt")
  );
  const journey = validEvidence();
  const screenshot = journey.artifacts.find((entry) => entry.kind === "screenshot");
  journey.journeys.human[0].artifactIds = [screenshot.id];
  assert.throws(
    () => verifyM1BAcceptanceEvidence(journey, { expectedCommitSha: SHA }),
    hasIssue("runtime_receipt or postgres_receipt")
  );
  const negative = validEvidence();
  const receipt = negative.artifacts.find((entry) => entry.kind === "runtime_receipt");
  negative.negativeCases.human[0].artifactIds = [receipt.id];
  assert.throws(
    () => verifyM1BAcceptanceEvidence(negative, { expectedCommitSha: SHA }),
    hasIssue("negative_receipt")
  );
  const mcp = validEvidence();
  const mcpStep = mcp.journeys.principal_agent.find(
    (entry) => entry.id === "mcp_execution"
  );
  mcpStep.artifactIds = mcpStep.artifactIds.filter(
    (artifactId) =>
      mcp.artifacts.find((artifact) => artifact.id === artifactId).kind !==
        "agent_mcp_receipt"
  );
  assert.throws(
    () => verifyM1BAcceptanceEvidence(mcp, { expectedCommitSha: SHA }),
    hasIssue("agent_mcp_receipt")
  );
  const mislabeledMcpStep = validEvidence();
  mislabeledMcpStep.journeys.principal_agent.find(
    (entry) => entry.id === "agent_application"
  ).transport = "human_web";
  assert.throws(
    () => verifyM1BAcceptanceEvidence(mislabeledMcpStep, { expectedCommitSha: SHA }),
    hasIssue("machine-facing agent_mcp path")
  );
  const mixedSource = validEvidence();
  const browserArtifacts = mixedSource.browser.localMatrix[0].artifactIds;
  mixedSource.artifacts.find(
    (artifact) => artifact.id === browserArtifacts[0]
  ).sourceRuntime = "hosted_exact_commit";
  assert.throws(
    () => verifyM1BAcceptanceEvidence(mixedSource, { expectedCommitSha: SHA }),
    (error) =>
      hasIssue("incompatible runtime source")(error) &&
      hasIssue("aligned runtime source")(error)
  );
  const wrongHostedSource = validEvidence();
  const hostedArtifacts = wrongHostedSource.browser.hostedMatrix[0].artifactIds;
  for (const artifactId of hostedArtifacts) {
    wrongHostedSource.artifacts.find(
      (artifact) => artifact.id === artifactId
    ).sourceRuntime = "local_exact_commit";
  }
  assert.throws(
    () => verifyM1BAcceptanceEvidence(wrongHostedSource, { expectedCommitSha: SHA }),
    hasIssue("incompatible runtime source")
  );
});

test("browser matrix rows cannot reuse one screenshot and receipt as complete Evidence", () => {
  const evidence = validEvidence();
  const reusedArtifactIds = [...evidence.browser.localMatrix[0].artifactIds];
  for (const entry of evidence.browser.localMatrix) {
    entry.artifactIds = [...reusedArtifactIds];
  }
  assert.throws(
    () => verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA }),
    (error) =>
      hasIssue("browser artifact unique to this matrix row")(error) &&
      hasIssue("runtime/PostgreSQL receipt unique to this matrix row")(error)
  );
});

test("browser matrix rows cannot clone proof bytes behind unique IDs and paths", () => {
  const evidence = validEvidence();
  const firstIds = evidence.browser.localMatrix[0].artifactIds;
  const firstBrowserDigest = evidence.artifacts.find(
    (artifact) => artifact.id === firstIds[0]
  ).sha256;
  const firstRuntimeDigest = evidence.artifacts.find(
    (artifact) => artifact.id === firstIds[1]
  ).sha256;
  for (const entry of evidence.browser.localMatrix) {
    const [browserId, runtimeId] = entry.artifactIds;
    evidence.artifacts.find(
      (artifact) => artifact.id === browserId
    ).sha256 = firstBrowserDigest;
    evidence.artifacts.find(
      (artifact) => artifact.id === runtimeId
    ).sha256 = firstRuntimeDigest;
  }
  assert.throws(
    () => verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA }),
    (error) =>
      hasIssue("browser artifact unique to this matrix row")(error) &&
      hasIssue("runtime/PostgreSQL receipt unique to this matrix row")(error)
  );
});

test("local and hosted matrices cannot relabel cloned proof bytes", () => {
  const evidence = validEvidence();
  const localArtifactIds = evidence.browser.localMatrix[0].artifactIds;
  const hostedArtifactIds = evidence.browser.hostedMatrix[0].artifactIds;
  assert.notDeepEqual(hostedArtifactIds, localArtifactIds);

  const localArtifacts = localArtifactIds.map((artifactId) =>
    evidence.artifacts.find((artifact) => artifact.id === artifactId)
  );
  const hostedArtifacts = hostedArtifactIds.map((artifactId) =>
    evidence.artifacts.find((artifact) => artifact.id === artifactId)
  );
  assert.ok(localArtifacts.every(
    (artifact) => artifact.sourceRuntime === "local_exact_commit"
  ));
  assert.ok(hostedArtifacts.every(
    (artifact) => artifact.sourceRuntime === "hosted_exact_commit"
  ));

  hostedArtifacts[0].sha256 = localArtifacts[1].sha256;
  hostedArtifacts[1].sha256 = localArtifacts[0].sha256;

  assert.throws(
    () => verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA }),
    hasIssue("must not reuse proof bytes across local and hosted runtimes")
  );
});

test("negative mutation and authority escalation fail closed", () => {
  const negative = validEvidence();
  negative.negativeCases.agent[0].additionalEffectCount = 1;
  assert.throws(
    () => verifyM1BAcceptanceEvidence(negative, { expectedCommitSha: SHA }),
    hasIssue("additionalEffectCount")
  );
  const funds = validEvidence();
  funds.authority.realFundsEnabled = true;
  assert.throws(
    () => verifyM1BAcceptanceEvidence(funds, { expectedCommitSha: SHA }),
    hasIssue("realFundsEnabled")
  );
});

test("Risk boundary rejects policy weakening, fallback, exposure, mutation, and wrong receipts", () => {
  const mutations = [
    ["requiresRecentMfaPolicyPreserved", false, "requiresRecentMfaPolicyPreserved"],
    ["weakAuthFallbackAvailable", true, "weakAuthFallbackAvailable"],
    ["weakAuthFallbackUsed", true, "weakAuthFallbackUsed"],
    ["hostedSurfaceDeployed", true, "hostedSurfaceDeployed"],
    ["strongMfaTopologyComposed", true, "strongMfaTopologyComposed"],
    ["privilegedMutationCount", 1, "privilegedMutationCount"],
    ["postRestartFailClosed", false, "postRestartFailClosed"]
  ];
  for (const [field, value, issue] of mutations) {
    const evidence = validEvidence();
    evidence.riskBoundary[field] = value;
    assert.throws(
      () => verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA }),
      hasIssue(issue)
    );
  }

  const allowedRead = validEvidence();
  allowedRead.riskBoundary.protectedReadDecision = "allow";
  assert.throws(
    () => verifyM1BAcceptanceEvidence(allowedRead, { expectedCommitSha: SHA }),
    hasIssue("protectedReadDecision")
  );
  const allowedMutation = validEvidence();
  allowedMutation.riskBoundary.protectedMutationDecision = "allow";
  assert.throws(
    () => verifyM1BAcceptanceEvidence(allowedMutation, { expectedCommitSha: SHA }),
    hasIssue("protectedMutationDecision")
  );
  const hostedReceipt = validEvidence();
  hostedReceipt.artifacts.find(
    (entry) => entry.id === hostedReceipt.riskBoundary.artifactId
  ).sourceRuntime = "hosted_exact_commit";
  assert.throws(
    () => verifyM1BAcceptanceEvidence(hostedReceipt, { expectedCommitSha: SHA }),
    hasIssue("incompatible runtime source")
  );

  const restartUnlinked = validEvidence();
  restartUnlinked.restart.artifactIds = restartUnlinked.restart.artifactIds.filter(
    (artifactId) => artifactId !== restartUnlinked.riskBoundary.artifactId
  );
  assert.throws(
    () => verifyM1BAcceptanceEvidence(restartUnlinked, { expectedCommitSha: SHA }),
    hasIssue("post-restart Risk boundary receipt")
  );
});

test("Risk is a topology boundary, not a positive L1 journey or browser matrix", () => {
  const journey = validEvidence();
  journey.journeys.risk_operations = [];
  assert.throws(
    () => verifyM1BAcceptanceEvidence(journey, { expectedCommitSha: SHA }),
    hasIssue("risk_operations is not allowed")
  );

  const matrix = validEvidence();
  matrix.browser.localMatrix.push({
    role: "risk_operations",
    check: "desktop",
    status: "passed",
    artifactIds: matrix.browser.localMatrix[0].artifactIds
  });
  assert.throws(
    () => verifyM1BAcceptanceEvidence(matrix, { expectedCommitSha: SHA }),
    hasIssue("localMatrix must contain exactly 24")
  );
});

test("hosted capability and readiness require exact disabled release identity", () => {
  const capability = {
    schemaVersion: "ipo_one_deployment_capability.v1",
    deployment: {
      releaseId: SHA,
      deploymentRole: "primary",
      productProfile: "deployable_sandbox_vertical_slice"
    },
    realValue: {
      activationStatus: "DISABLED",
      realFundsEnabled: false,
      productionFundsMoved: false
    },
    safety: {
      realFundsEnabled: false,
      externalProviderExecutionEnabled: false,
      productionSignerAuthorityEnabled: false,
      withdrawalAuthorityEnabled: false,
      venueWriteAuthorityEnabled: false
    }
  };
  const readiness = {
    schemaVersion: "production_readiness.v1",
    status: "ready",
    releaseId: SHA,
    deploymentRole: "primary",
    realFundsEnabled: false
  };
  assert.equal(verifyM1BHostedCapabilityDocument(capability, { expectedCommitSha: SHA }), true);
  assert.equal(verifyM1BHostedReadinessDocument(readiness, { expectedCommitSha: SHA }), true);
  capability.safety.withdrawalAuthorityEnabled = true;
  readiness.releaseId = "f".repeat(40);
  assert.throws(
    () => verifyM1BHostedCapabilityDocument(capability, { expectedCommitSha: SHA }),
    hasIssue("withdrawalAuthorityEnabled")
  );
  assert.throws(
    () => verifyM1BHostedReadinessDocument(readiness, { expectedCommitSha: SHA }),
    hasIssue("readiness.releaseId")
  );
});

test("current hosted identity is primary-bound while historical v1 remains compatible", () => {
  const capability = {
    schemaVersion: "ipo_one_deployment_capability.v1",
    deployment: {
      releaseId: SHA,
      deploymentRole: "primary",
      productProfile: "deployable_sandbox_vertical_slice"
    },
    realValue: {
      activationStatus: "DISABLED",
      realFundsEnabled: false,
      productionFundsMoved: false
    },
    safety: {
      realFundsEnabled: false,
      externalProviderExecutionEnabled: false,
      productionSignerAuthorityEnabled: false,
      withdrawalAuthorityEnabled: false,
      venueWriteAuthorityEnabled: false
    }
  };
  const readiness = {
    schemaVersion: "production_readiness.v1",
    status: "ready",
    releaseId: SHA,
    deploymentRole: "primary",
    realFundsEnabled: false
  };

  assert.throws(
    () => verifyM1BHostedCapabilityDocument(capability, {
      expectedCommitSha: SHA,
      expectedDeploymentRole: "risk"
    }),
    hasIssue("surface.deploymentRole")
  );
  assert.throws(
    () => verifyM1BHostedReadinessDocument(readiness, {
      expectedCommitSha: SHA,
      expectedDeploymentRole: "risk"
    }),
    hasIssue("surface.deploymentRole")
  );

  capability.deployment.deploymentRole = "risk";
  readiness.deploymentRole = "risk";
  assert.throws(
    () => verifyM1BHostedCapabilityDocument(capability, {
      expectedCommitSha: SHA,
      expectedDeploymentRole: "primary"
    }),
    hasIssue("capability.deployment.deploymentRole")
  );
  assert.throws(
    () => verifyM1BHostedReadinessDocument(readiness, {
      expectedCommitSha: SHA,
      expectedDeploymentRole: "primary"
    }),
    hasIssue("readiness.deploymentRole")
  );

  const historicalCapability = structuredClone(capability);
  const historicalReadiness = structuredClone(readiness);
  delete historicalCapability.deployment.deploymentRole;
  delete historicalReadiness.deploymentRole;
  assert.equal(verifyM1BHostedCapabilityDocument(historicalCapability, {
    expectedCommitSha: SHA,
    expectedDeploymentRole: "risk",
    evidenceSchemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v1"
  }), true);
  assert.equal(verifyM1BHostedReadinessDocument(historicalReadiness, {
    expectedCommitSha: SHA,
    expectedDeploymentRole: "risk",
    evidenceSchemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v1"
  }), true);
});
