import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  M1_B_ACCEPTANCE_ROLES,
  M1_B_BROWSER_CHECKS,
  M1_B_JOURNEY_STEPS,
  M1_B_NEGATIVE_CASES,
  M1BAcceptanceEvidenceError,
  verifyM1BAcceptanceEvidence,
  verifyM1BHostedCapabilityDocument,
  verifyM1BHostedReadinessDocument
} from "../../release-governance/src/m1-b-acceptance-evidence.js";
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
        status: "passed_fail_closed",
        additionalEffectCount: 0,
        nonEnumerating: true,
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
  return {
    schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v1",
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
        surfaces: ["primary", "risk"].map((deploymentRole) => ({
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
      hostedMatrix: browserMatrix("hosted_exact_commit", [
        "principal_agent",
        "risk_operations"
      ])
    },
    journeys,
    negativeCases,
    restart: {
      databaseRetained: true,
      pilotRestarted: true,
      workerRestarted: true,
      humanRecovered: true,
      agentRecovered: true,
      capitalPartnerRecovered: true,
      riskRecovered: true,
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
      browserCheckCount: 48,
      journeyStepCount: 32,
      negativeCaseCount: 16,
      artifactCount: evidence.artifacts.length,
      canonicalProductTruth: "tenant_protocol_gateway_shared_kernel_postgresql",
      realFundsEnabled: false
    }
  );
});

test("complete dual-runtime Evidence fits the canonical private JSON bound", () => {
  const canonicalJson = `${JSON.stringify(validEvidence(), null, 2)}\n`;
  assert.ok(Buffer.byteLength(canonicalJson, "utf8") <= MAX_LAUNCH_JSON_BYTES);
});

test("primary-only hosted Evidence requires exactly the Principal Agent matrix", () => {
  const evidence = validEvidence();
  evidence.runtime.hosted.surfaces = evidence.runtime.hosted.surfaces.filter(
    (surface) => surface.deploymentRole === "primary"
  );
  evidence.browser.hostedMatrix = evidence.browser.hostedMatrix.filter(
    (entry) => entry.role === "principal_agent"
  );
  assert.equal(
    verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: SHA }).browserCheckCount,
    40
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

test("hosted evidence models only actually deployed primary and optional risk surfaces", () => {
  const primaryOnly = validEvidence();
  primaryOnly.runtime.hosted.surfaces.pop();
  primaryOnly.browser.hostedMatrix = primaryOnly.browser.hostedMatrix.filter(
    (entry) => entry.role === "principal_agent"
  );
  assert.equal(
    verifyM1BAcceptanceEvidence(primaryOnly, { expectedCommitSha: SHA }).status,
    "verified"
  );
  const inventedRole = validEvidence();
  inventedRole.runtime.hosted.surfaces[1].deploymentRole = "capital_partner";
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

test("missing local or hosted browser/recovery and incomplete journey rows fail closed", () => {
  const browser = validEvidence();
  browser.browser.localMatrix.pop();
  assert.throws(
    () => verifyM1BAcceptanceEvidence(browser, { expectedCommitSha: SHA }),
    hasIssue("localMatrix must contain exactly 32")
  );
  const hostedBrowser = validEvidence();
  hostedBrowser.browser.hostedMatrix = hostedBrowser.browser.hostedMatrix.filter(
    (entry) => entry.role === "principal_agent"
  );
  assert.throws(
    () => verifyM1BAcceptanceEvidence(hostedBrowser, { expectedCommitSha: SHA }),
    hasIssue("hostedMatrix must contain exactly 16")
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
  extra.runtime.hosted.surfaces = extra.runtime.hosted.surfaces.filter(
    (surface) => surface.deploymentRole === "primary"
  );
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

test("hosted capability and readiness require exact disabled release identity", () => {
  const capability = {
    schemaVersion: "ipo_one_deployment_capability.v1",
    deployment: {
      releaseId: SHA,
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
