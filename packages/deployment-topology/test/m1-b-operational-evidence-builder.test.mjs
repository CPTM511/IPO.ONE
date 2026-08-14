import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { EventEmitter } from "node:events";
import { lstat, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { relative, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { hashId } from "../../domain/src/index.js";
import {
  verifyM1BAcceptanceEvidence
} from "../../release-governance/src/m1-b-acceptance-evidence.js";
import {
  M1_B_OPERATIONAL_BROWSER_ASSERTIONS,
  M1_B_OPERATIONAL_BROWSER_CHECKS,
  M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS,
  M1_B_OPERATIONAL_NEGATIVE_CASES,
  M1_B_OPERATIONAL_ROLES,
  assertM1BCanonicalOperationalArtifactSet,
  assertM1BOperationalPreRiskArtifactSet,
  assertM1BOperationalRuntimeMatchesRestart,
  collectM1BOperationalBrowserMeasurements,
  collectM1BExpiredOfferSetupOutput,
  collectM1BBrowserRuntimeObservation,
  createM1BExpiredOfferSetupRunnerArguments,
  createM1BExpiredOfferSetupSafetyLatch,
  createM1BOperationalJourneyBindings,
  createM1BOperationalJourneyReceipts,
  createM1BOperationalBrowserRowDocuments,
  createM1BCanonicalOperationalAcceptanceEvidence,
  createM1BOperationalLiveNegativeRunnerArguments,
  createM1BOperationalNegativeRunDocuments,
  createM1BOperationalNegativeCaseReceipt,
  createM1BOperationalNegativeCaseManifest,
  createM1BOperationalPreRiskCollectionReceipt,
  createM1BOperationalRestartLinkageDocument,
  createM1BOperationalRuntimeReaderArguments,
  createM1BRestartContext,
  createM1BRestartEventSummary,
  ensureM1BOperationalOutputDirectory,
  missingM1BDerivedNegativeCases,
  parseM1BOperationalEvidenceArguments,
  parseM1BOperationalObservations,
  readM1BExpiredOfferSetupState,
  readM1BOperationalNegativeRunEvidence,
  validateM1BAgentAcceptanceChronology,
  validateM1BOperationalPreRiskChronology,
  validateM1BOperationalBrowserRowDocuments,
  validateM1BOperationalJourneyReceipts,
  validateM1BOperationalNegativeCaseReceipt,
  validateM1BOperationalNegativeCaseManifest,
  validateM1BExpiredOfferSetupSafetyLatch,
  writeM1BOperationalDocumentsAtomic
} from "../../../scripts/m1-b-operational-evidence-builder.mjs";
import {
  createM1BExpiredOfferAuthorBrowserExpression,
  createM1BExpiredOfferInboxBrowserExpression,
  readM1BExpiredOfferSetupCliContext,
  readM1BExpiredOfferSetupCliEnvironment
} from "../../../apps/private-pilot/src/m1-b-expired-offer-setup-cli.js";
import {
  M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES
} from "../../../apps/private-pilot/src/m1-b-operational-browser-measurement.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const RELEASE_SHA = "a".repeat(40);
const IMAGE_ID = `sha256:${"b".repeat(64)}`;
const HASH = `0x${"c".repeat(64)}`;

function browserPhaseToken(phase) {
  return {
    authenticated: "auth",
    signed_out: "signedout",
    before_sign_out: "before"
  }[phase];
}

function exactPreRiskReferences() {
  const output = "output/playwright/m1-b-p0-5";
  const agent = ".ipo-one/local-stack/agent-workflows";
  const workflowKey = "f".repeat(24);
  const values = [];
  const add = (id, kind, relativePath) => values.push(Object.freeze({
    id,
    kind,
    relativePath,
    sha256: createHash("sha256").update(id).digest("hex")
  }));
  const outputPath = (name) => `${output}/${name}`;
  const agentPath = (name) => `${agent}/${name}`;
  add("operational_restart_pending", "restart_log", outputPath(
    `${RELEASE_SHA}.operational-restart.pending.json`
  ));
  add("operational_restart", "restart_log", outputPath(
    `${RELEASE_SHA}.operational-restart.json`
  ));
  add("release_identity", "release_identity", outputPath(
    `${RELEASE_SHA}.local-release-identity.json`
  ));
  add("agent_before", "runtime_receipt", agentPath(
    `${RELEASE_SHA}.before-restart.acceptance.json`
  ));
  add("agent_after", "runtime_receipt", agentPath(
    `${RELEASE_SHA}.after-restart.acceptance.json`
  ));
  add("human_critical", "postgres_receipt", outputPath(
    `${RELEASE_SHA}.human-critical-receipt.json`
  ));
  add("capital_partner_critical", "postgres_receipt", outputPath(
    `${RELEASE_SHA}.capital-partner-critical-receipt.json`
  ));
  add("agent_application_mcp", "agent_mcp_receipt", agentPath(
    `m1-b-${RELEASE_SHA}.before_restart.${workflowKey}.offer-receipt.json`
  ));
  add("agent_runtime_mcp", "agent_mcp_receipt", agentPath(
    `m1-b-${RELEASE_SHA}.before_restart.${workflowKey}.mcp-receipt.json`
  ));
  add("agent_foreign_offer_setup", "postgres_receipt", agentPath(
    `${RELEASE_SHA}.agent-foreign-offer-setup.receipt.v1.json`
  ));
  add("agent_before_phase", "runtime_receipt", agentPath(
    `${RELEASE_SHA}.before-restart.phase-receipt.v2.json`
  ));
  add("agent_after_phase", "runtime_receipt", agentPath(
    `${RELEASE_SHA}.after-restart.phase-receipt.v2.json`
  ));
  add("agent_recovery_receipt", "runtime_receipt", agentPath(
    `m1-b-${RELEASE_SHA}.after_restart.${workflowKey}.recovery-receipt.json`
  ));
  for (const definition of M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    ({ sourceMode }) => sourceMode !== "live_post_restart"
  )) {
    add(
      `negative_source_proof_${definition.group}_${definition.id}`,
      "negative_source_proof",
      outputPath(
        `${RELEASE_SHA}.negative-source-proof.${definition.group}.${definition.id}.json`
      )
    );
    add(
      `negative_tap_${definition.group}_${definition.id}`,
      "tap_log",
      outputPath(`${RELEASE_SHA}.negative.${definition.group}.${definition.id}.tap`)
    );
  }
  add(
    "operational_negative_exact_source_execution",
    "runtime_receipt",
    outputPath(`${RELEASE_SHA}.negative-exact-source-execution.json`)
  );
  add(
    "operational_negative_run",
    "negative_receipt",
    outputPath(`${RELEASE_SHA}.exact-source-negative-run.json`)
  );
  for (const definition of M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    ({ sourceMode, id }) =>
      sourceMode === "live_post_restart" && id !== "replaced_stale_offer"
  )) {
    add(
      `negative_live_attempt_${definition.group}_${definition.id}`,
      "negative_receipt",
      outputPath(
        `${RELEASE_SHA}.negative-live-attempt.${definition.group}.${definition.id}.json`
      )
    );
    add(
      `negative_live_source_proof_${definition.group}_${definition.id}`,
      "negative_source_proof",
      outputPath(
        `${RELEASE_SHA}.negative-live-source-proof.${definition.group}.${definition.id}.json`
      )
    );
  }
  add("expired_offer_setup", "postgres_receipt", outputPath(
    `${RELEASE_SHA}.expired-offer-setup.receipt.v1.json`
  ));
  for (const role of M1_B_OPERATIONAL_ROLES) {
    for (const check of M1_B_OPERATIONAL_BROWSER_CHECKS) {
      const prefix = `browser_${role}_${check}`;
      for (const phase of M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES[check]) {
        add(`${prefix}_${browserPhaseToken(phase)}_shot`, "screenshot", outputPath(
          `${RELEASE_SHA}.browser.${role}.${check}.${phase}.png`
        ));
      }
      add(`${prefix}_runtime`, "runtime_receipt", outputPath(
        `${RELEASE_SHA}.browser.${role}.${check}.runtime.json`
      ));
      add(`${prefix}_audit`, "browser_audit", outputPath(
        `${RELEASE_SHA}.browser.${role}.${check}.audit.json`
      ));
    }
    add(`journey_${role}_receipt`, "runtime_receipt", outputPath(
      `${RELEASE_SHA}.journey.${role}.json`
    ));
  }
  for (const definition of M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS) {
    add(
      `negative_${definition.group}_${definition.id}`,
      "negative_receipt",
      outputPath(`${RELEASE_SHA}.negative.${definition.group}.${definition.id}.json`)
    );
  }
  add("operational_negative_cases", "negative_receipt", outputPath(
    `${RELEASE_SHA}.negative-cases.json`
  ));
  add("operational_restart_linkage", "restart_log", outputPath(
    `${RELEASE_SHA}.operational-restart-linkage.v2.json`
  ));
  assert.equal(values.length, 148);
  return values;
}

function expiredCriticalLineage(suffix, status, digit) {
  return {
    consentId: `consent_${suffix}`,
    creditIntentId: `credit_intent_${suffix}`,
    riskDecisionId: `risk_decision_${suffix}`,
    passportArtifactId: `passport_${suffix}`,
    preliminaryOfferId: `credit_offer_preliminary_${suffix}`,
    creditOfferId: `credit_offer_${suffix}`,
    creditOfferHash: `0x${digit.repeat(64)}`,
    termsHash: `0x${String(Number(digit) + 1).repeat(64)}`,
    aggregateVersion: status === "offered" ? 1 : 2,
    status
  };
}

function expiredOfferCliContext() {
  const humanActorId = "actor_human_borrower_pilot";
  const capitalPartnerActorId = "actor_capital_partner_pilot";
  return {
    schemaVersion: "m1_b_expired_offer_setup_cli_context.v1",
    candidateReleaseId: RELEASE_SHA,
    sourceTreeHash: "d".repeat(40),
    runtimeImageId: IMAGE_ID,
    databaseStartedAt: "2026-08-15T00:10:10.000Z",
    tenantId: "tenant_ipo_one_local_pilot",
    humanActorId,
    capitalPartnerActorId,
    capitalPartnerOrigin: "http://127.0.0.1:18890/",
    capitalPartnerCriticalBinding: {
      schemaVersion: "m1_b_expired_offer_critical_binding.v1",
      artifactId: "capital_partner_critical",
      sha256: "1".repeat(64),
      candidateReleaseId: RELEASE_SHA,
      databaseStartedAt: "2026-08-15T00:10:10.000Z",
      capturedAt: "2026-08-15T00:13:00.000Z",
      subjectId: "subject_human_candidate",
      borrowerActorRefHash: hashId(
        "m1_b_acceptance_actor_reference",
        { actorId: humanActorId }
      ),
      capitalPartnerActorRefHash: hashId(
        "m1_b_acceptance_actor_reference",
        { actorId: capitalPartnerActorId }
      ),
      capitalPartnerId: "capital_partner_candidate",
      currentLineage: expiredCriticalLineage("a", "offered", "4"),
      withdrawalLineage: expiredCriticalLineage("b", "withdrawn", "6")
    }
  };
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function projectionHash(value) {
  return `0x${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function measuredBrowserResponse(prompt) {
  const authenticated = prompt.expected.authentication.active;
  const projection = prompt.role === "capital_partner"
    ? {
        schemaVersion: "tenant_capital_partner_self_view.v1",
        resourceType: "capital_partner_profile",
        serverTruth: true,
        readOnly: true,
        fundsAuthority: false
      }
    : {
        schemaVersion: "tenant_workspace_resume_view.v2",
        workspaceKind: prompt.expected.workspaceKind,
        serverTruth: true,
        resourceCount: 1,
        continuationCount: 1,
        hasMore: false,
        controlledAgentCount: prompt.role === "principal_agent" ? 1 : 0,
        humanOfferReviewPresent: prompt.role === "human"
      };
  const startHash = prompt.role === "capital_partner"
    ? "#capital-partners"
    : "#overview";
  const intermediateHash = prompt.role === "capital_partner"
    ? "#mainContent"
    : "#request-credit";
  const backForward = prompt.check === "back_forward";
  return {
    schemaVersion: "m1_b_operational_browser_measurement_response.v1",
    promptId: prompt.promptId,
    challenge: prompt.capture.challenge,
    role: prompt.role,
    check: prompt.check,
    phase: prompt.phase,
    origin: prompt.origin,
    measurement: {
      authentication: { ...prompt.expected.authentication },
      document: {
        workspaceName: prompt.expected.workspaceName,
        activeView: prompt.expected.activeView,
        connectionState: authenticated ? "Secure session active" : "Sign-in required",
        privacyShieldState: authenticated ? "hidden" : "visible",
        runtimeGateState: "hidden",
        privateSurfaceState: authenticated ? "visible" : "hidden",
        primaryAction: {
          code: prompt.expected.primaryActionCode,
          rendered: authenticated,
          enabled: authenticated
        },
        dialogOpen: false,
        technicalDetailsOpenCount: 0
      },
      viewport: {
        class: prompt.expected.viewportClass,
        innerWidth: prompt.expected.viewportClass === "mobile" ? 390 : 1280,
        innerHeight: prompt.expected.viewportClass === "mobile" ? 844 : 720,
        clientWidth: prompt.expected.viewportClass === "mobile" ? 390 : 1280,
        scrollWidth: prompt.expected.viewportClass === "mobile" ? 390 : 1280,
        innerHeightVisible: true,
        devicePixelRatio: 1,
        horizontalOverflow: false,
        mobileMenuRendered: prompt.expected.viewportClass === "mobile"
      },
      navigation: {
        kind: prompt.check === "reload"
          ? "reload"
          : backForward ? "same_document_history" : "navigate",
        startHash: backForward ? startHash : "",
        intermediateHash: backForward ? intermediateHash : null,
        backHash: backForward ? startHash : null,
        forwardHash: backForward ? intermediateHash : null,
        sameDocument: backForward
      },
      privateRead: authenticated ? {
        operationId: prompt.readRequest.operationId,
        requestId: prompt.readRequest.requestId,
        correlationId: prompt.readRequest.correlationId,
        httpStatus: 200,
        responseRequestId: prompt.readRequest.requestId,
        projection,
        projectionHash: projectionHash(projection)
      } : null,
      marker: {
        rendered: true,
        challengeHash: prompt.capture.challengeHash
      }
    },
    browserControl: {
      driver: "chrome_control",
      consoleErrorCount: 0,
      failedNetworkRequestCount: 0
    }
  };
}

function browserAppRoleRead(context) {
  const auditEvents = [1, 2].map((sequence) => ({
    sequence,
    eventId: `${context.requestId}_event_${sequence}`,
    decisionId: `${context.requestId}_decision_${sequence}`,
    occurredAt: new Date(
      Date.parse(context.promptIssuedAt) + sequence * 200
    ).toISOString()
  }));
  const manifest = {
    requestId: context.requestId,
    correlationId: context.correlationId,
    operationId: context.operationId,
    events: auditEvents
  };
  return {
    schemaVersion: "m1_b_operational_browser_app_role_read.v1",
    candidateReleaseId: context.candidateReleaseId,
    runtimeImageId: context.runtimeImageId,
    databaseStartedAt: context.expectedDatabaseStartedAt,
    databaseObservedAt: new Date(
      Date.parse(context.promptIssuedAt) + 1_500
    ).toISOString(),
    databaseRole: "ipo_one_private_pilot_app",
    databaseName: "ipo_one_private_pilot",
    role: context.role,
    promptIssuedAt: context.promptIssuedAt,
    operationId: context.operationId,
    responseSchemaVersion: context.role === "capital_partner"
      ? "tenant_capital_partner_self_view.v1"
      : "tenant_workspace_resume_view.v2",
    requestId: context.requestId,
    correlationId: context.correlationId,
    authorizationAuditEvents: auditEvents,
    authorizationAuditEventCount: 2,
    authorizationAuditManifestSha256: createHash("sha256")
      .update(canonicalJson(manifest)).digest("hex"),
    authorizationAttemptCount: 1,
    authorizationBinding: {
      exactRequestAttempt: true,
      tenantBound: true,
      reviewedActorBound: true,
      operationBound: true,
      exactTwoAllowAuditSetBound: true
    },
    authenticationAssurance: {
      authTime: context.promptIssuedAt,
      activeReviewedActorCount: 1,
      activeSiweSessionCount: 1,
      activeInvitedWalletCredentialCount: 1,
      activeMembershipCount: 1,
      boundClientCount: 1,
      requiredCapabilityCount: 1,
      invitedCredentialRegistrationCount: 1,
      auditSessionBindingVerified: true,
      clientBindingVerified: true,
      capabilityBindingVerified: true
    },
    runtimeBinding: {
      candidateReleaseUnchanged: true,
      runtimeImageUnchanged: true,
      databaseStartUnchanged: true
    },
    readOnlyEvidenceRole: true,
    databaseInRecovery: false,
    credentialsIncluded: false,
    sessionMaterialIncluded: false,
    actorIdentifiersIncluded: false,
    rawPiiIncluded: false,
    authorizationEvidenceSource: "postgresql_server_truth",
    schemaVersionSource: "reviewed_protocol_registry"
  };
}

function identity(service, phase) {
  const digit = { postgres: "1", pilot: "2", worker: "3" }[service];
  const second = { postgres: "00", pilot: "20", worker: "40" }[service];
  return Object.freeze({
    containerId: digit.repeat(64),
    imageId: service === "postgres" ? `sha256:${"d".repeat(64)}` : IMAGE_ID,
    startedAt: phase === "before"
      ? `2026-08-15T00:00:${second}.000Z`
      : `2026-08-15T00:10:${second}.000Z`,
    configHash: HASH
  });
}

function snapshot(phase) {
  const before = phase === "before";
  return Object.freeze({
    capturedAt: before
      ? "2026-08-15T00:01:00.000Z"
      : "2026-08-15T00:11:00.000Z",
    databaseStartedAt: before
      ? "2026-08-15T00:00:10.000Z"
      : "2026-08-15T00:10:10.000Z",
    engine: Object.freeze({
      observedAt: before
        ? "2026-08-15T00:01:00.000Z"
        : "2026-08-15T00:11:00.000Z",
      receipt: Object.freeze({
        engineIdHash: HASH,
        serverVersion: "28.3.3",
        securityOptionsHash: HASH,
        rootless: true
      })
    }),
    volume: Object.freeze({
      name: "ipo-one-local-postgres-data",
      receipt: Object.freeze({
        name: "ipo-one-local-postgres-data",
        driver: "local",
        createdAt: "2026-08-14T00:00:00.000Z",
        scope: "local",
        labelsHash: HASH,
        optionsHash: HASH,
        destination: "/var/lib/postgresql/data",
        readWrite: true,
        metadataHash: HASH
      })
    }),
    services: Object.freeze(Object.fromEntries(
      ["postgres", "pilot", "worker"].map((service) => [
        service,
        identity(service, phase)
      ])
    ))
  });
}

function containerEvent(service, action) {
  return JSON.stringify({
    Action: action,
    Actor: {
      ID: identity(service, "before").containerId,
      Attributes: { "com.docker.compose.service": service }
    }
  });
}

function restartEvidence() {
  const before = snapshot("before");
  const after = snapshot("after");
  const containerLines = ["postgres", "pilot", "worker"].flatMap((service) =>
    ["kill", "die", "stop", "start"].map((action) => containerEvent(service, action))
  );
  const summary = createM1BRestartEventSummary(before, after, {
    containerLines,
    volumeLines: []
  });
  return {
    before,
    after,
    summary,
    restart: createM1BRestartContext(before, after, summary)
  };
}

test("operational runtime reader argv is least-authority and executable in the distroless image", () => {
  const args = createM1BOperationalRuntimeReaderArguments({
    runtimeImageId: IMAGE_ID,
    candidateReleaseId: RELEASE_SHA,
    databaseUrl: "postgresql://127.0.0.2:55432/ipo_one_private_pilot"
  });
  assert.deepEqual(args.slice(-3), [
    "/nodejs/bin/node",
    IMAGE_ID,
    "apps/private-pilot/src/m1-b-operational-runtime-read.js"
  ]);
  assert.equal(args[args.indexOf("--entrypoint") + 1], "/nodejs/bin/node");
  assert.equal(args.filter((value) => value === "--mount").length, 1);
  assert.equal(args.some((value) => /owner|password|authentication|agent-key/.test(value)), false);
  const labels = args.flatMap((value, index) =>
    value === "--label" ? [args[index + 1]] : []
  );
  assert.deepEqual(labels, [
    "com.docker.compose.project=ipo-one-m1-b-evidence-reader",
    "com.docker.compose.service=runtime-reader",
    `ipo.one.candidate=${RELEASE_SHA}`,
    "ipo.one.evidence=m1-b-operational-runtime-read"
  ]);
  assert.equal(labels.includes("com.docker.compose.project=ipo-one-local"), false);
  assert.equal(labels.includes("com.docker.compose.service=pilot"), false);
  const environment = args.flatMap((value, index) =>
    value === "--env" ? [args[index + 1]] : []
  );
  assert.deepEqual(environment, [
    "DATABASE_URL=postgresql://127.0.0.2:55432/ipo_one_private_pilot",
    `IPO_ONE_M1_B_RELEASE_SHA=${RELEASE_SHA}`,
    "IPO_ONE_PILOT_DB_SECRET_FILE=/run/secrets/private-pilot-db-secret"
  ]);
  assert.throws(
    () => createM1BOperationalRuntimeReaderArguments({
      runtimeImageId: IMAGE_ID,
      candidateReleaseId: RELEASE_SHA,
      databaseUrl: "postgresql://owner:secret@127.0.0.2:55432/ipo_one_private_pilot"
    }),
    /credential-free/
  );
});

test("live-negative argv runs only the closed CLI in the exact image without credentials", () => {
  const context = {
    schemaVersion: "m1_b_operational_live_negative_cli_context.v1",
    group: "authorization",
    id: "cross_role_private_read",
    candidateReleaseId: RELEASE_SHA,
    sourceTreeHash: "d".repeat(40),
    runtimeImageId: IMAGE_ID,
    supportingArtifacts: [
      { id: "capital_partner_critical", sha256: "1".repeat(64) },
      { id: "human_critical", sha256: "2".repeat(64) }
    ],
    tenantId: "tenant_ipo_one_local_pilot",
    actorId: "actor_capital_partner_pilot",
    authentication: { safe: true },
    databaseStartedAt: "2026-08-15T00:10:10.000Z",
    resourceType: "obligation",
    resourceId: "obligation_human_critical"
  };
  const args = createM1BOperationalLiveNegativeRunnerArguments({
    runtimeImageId: IMAGE_ID,
    databaseUrl: "postgresql://127.0.0.2:55432/ipo_one_private_pilot",
    context
  });
  assert.deepEqual(args.slice(-4, -1), [
    IMAGE_ID,
    "apps/private-pilot/src/m1-b-operational-live-negative-cli.js",
    "--context"
  ]);
  assert.equal(args.at(-2), "--context");
  assert.deepEqual(
    JSON.parse(Buffer.from(args.at(-1), "base64url")),
    context
  );
  assert.equal(args.includes("-i"), true);
  assert.equal(args.includes("--read-only"), true);
  assert.equal(args.includes("ALL"), true);
  assert.equal(
    args.some((value) => /owner:|password|cookie|signature|session=/i.test(value)),
    false
  );
  assert.throws(
    () => createM1BOperationalLiveNegativeRunnerArguments({
      runtimeImageId: IMAGE_ID,
      databaseUrl: "postgresql://owner:secret@127.0.0.2:55432/test",
      context
    }),
    /credential-free/
  );
});

test("expired-Offer exact-image argv is credential-free and binds the closed context", () => {
  const context = expiredOfferCliContext();
  const encoded = Buffer.from(JSON.stringify(context)).toString("base64url");
  assert.deepEqual(readM1BExpiredOfferSetupCliContext(encoded), context);
  assert.deepEqual(
    readM1BExpiredOfferSetupCliEnvironment({
      DATABASE_URL: "postgresql://127.0.0.2:55432/ipo_one_private_pilot",
      IPO_ONE_PILOT_DB_SECRET_FILE:
        "/run/secrets/private-pilot-db-secret"
    }),
    {
      databaseUrl: "postgresql://127.0.0.2:55432/ipo_one_private_pilot",
      secretPath: "/run/secrets/private-pilot-db-secret"
    }
  );
  const args = createM1BExpiredOfferSetupRunnerArguments({
    runtimeImageId: IMAGE_ID,
    databaseUrl: "postgresql://127.0.0.2:55432/ipo_one_private_pilot",
    context
  });
  assert.deepEqual(args.slice(-4, -1), [
    IMAGE_ID,
    "apps/private-pilot/src/m1-b-expired-offer-setup-cli.js",
    "--context"
  ]);
  assert.deepEqual(JSON.parse(Buffer.from(args.at(-1), "base64url")), context);
  assert.equal(args.includes("--read-only"), true);
  assert.equal(args.includes("ALL"), true);
  assert.equal(args.filter((value) => value === "--mount").length, 1);
  assert.deepEqual(args.flatMap((value, index) =>
    value === "--env" ? [args[index + 1]] : []
  ), [
    "DATABASE_URL=postgresql://127.0.0.2:55432/ipo_one_private_pilot",
    "IPO_ONE_PILOT_DB_SECRET_FILE=/run/secrets/private-pilot-db-secret"
  ]);
  assert.equal(
    args.some((value) => /owner:|password|cookie|signature|session=/i.test(value)),
    false
  );
  assert.throws(
    () => createM1BExpiredOfferSetupRunnerArguments({
      runtimeImageId: IMAGE_ID,
      databaseUrl: "postgresql://owner:secret@127.0.0.2:55432/test",
      context
    }),
    /credential-free/
  );
  assert.throws(
    () => readM1BExpiredOfferSetupCliContext(Buffer.from(JSON.stringify({
      ...context,
      capitalPartnerActorId: context.humanActorId
    })).toString("base64url")),
    /reviewed identities/
  );
});

test("expired-Offer child output is byte-exact across chunks and fails closed on overflow or exit", async () => {
  function childProcess() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.killedWith = null;
    child.kill = (signal) => {
      child.killedWith = signal;
      return true;
    };
    return child;
  }

  const success = childProcess();
  const successPromise = collectM1BExpiredOfferSetupOutput(success, {
    maximumBytes: 128
  });
  success.stdout.emit("data", Buffer.from('{"schemaVersion":"'));
  success.stdout.emit("data", Buffer.from('receipt.v1","safe":true}'));
  success.emit("close", 0, null);
  assert.deepEqual(await successPromise, {
    schemaVersion: "receipt.v1",
    safe: true
  });

  const oversized = childProcess();
  const oversizedPromise = collectM1BExpiredOfferSetupOutput(oversized, {
    maximumBytes: 8
  });
  oversized.stdout.emit("data", Buffer.from("123456789"));
  await assert.rejects(oversizedPromise, /closed bound/);
  assert.equal(oversized.killedWith, "SIGKILL");

  const failed = childProcess();
  const failedPromise = collectM1BExpiredOfferSetupOutput(failed);
  failed.emit("close", 17, null);
  await assert.rejects(failedPromise, /failed closed/);

  const invalid = childProcess();
  const invalidPromise = collectM1BExpiredOfferSetupOutput(invalid);
  invalid.stdout.emit("data", Buffer.from("{}{}"));
  invalid.emit("close", 0, null);
  await assert.rejects(invalidPromise, /invalid JSON/);
});

test("expired-Offer browser expressions keep CSRF in page memory and submit one exact safe author request", async () => {
  const context = expiredOfferCliContext();
  const freshPassport = {
    resource: {
      resourceType: "credit_passport_artifact",
      resourceId: "passport_c"
    },
    reviewContext: {
      creditIntentId: "credit_intent_c",
      artifactHash: HASH,
      artifactVersion: 1
    },
    summary: {
      claimCount: 3,
      purpose: "private_credit_review",
      issuedAt: "2026-08-15T00:14:00.000Z",
      expiresAt: "2026-08-15T01:14:00.000Z"
    }
  };
  const inboxResponse = {
    items: [freshPassport],
    count: 1,
    hasMore: false,
    fundsAuthority: false,
    serverTruth: true,
    readOnly: true,
    schemaVersion: "tenant_capital_partner_passport_inbox_view.v1"
  };
  const secretCsrf = "Ab9_-safePageMemoryCsrf_1234567890xyzABCDE";
  class FakeInput {
    constructor(value) {
      this.value = value;
    }
  }
  const inputs = new Map(Object.entries({
    capitalPartnerFacilityLimit: "250",
    capitalPartnerPrincipal: "120",
    capitalPartnerPerDrawCap: "120",
    capitalPartnerAnnualRate: "12",
    capitalPartnerOriginationFee: "0",
    capitalPartnerInstallments: "2",
    capitalPartnerFirstPaymentAt: "2026-09-15T12:00",
    capitalPartnerMaturityAt: "2026-10-15T12:00"
  }).map(([id, value]) => [id, new FakeInput(value)]));
  let uuidIndex = 0;
  let capturedRequest;
  let healthRequest;
  const logged = [];
  const sandbox = (response) => ({
    location: { origin: "http://127.0.0.1:18890" },
    document: {
      querySelector(selector) {
        return selector === 'meta[name="ipo-one-csrf-token"]'
          ? { content: secretCsrf }
          : null;
      },
      getElementById(id) {
        return inputs.get(id) ?? null;
      }
    },
    HTMLInputElement: FakeInput,
    crypto: {
      subtle: webcrypto.subtle,
      randomUUID() {
        uuidIndex += 1;
        return `00000000-0000-4000-8000-${String(uuidIndex).padStart(12, "0")}`;
      }
    },
    TextEncoder,
    fetch: async (url, options) => {
      if (url === "/tenant/v1/healthz") {
        healthRequest = { url, options };
        const serverDate = new Date().toUTCString();
        return {
          ok: true,
          headers: {
            get(name) {
              return {
                "x-request-id": options.headers["x-request-id"],
                "cache-control": "no-store",
                date: serverDate
              }[name] ?? null;
            }
          },
          json: async () => ({
            status: "ready",
            transport: "authenticated_http_loopback",
            public: false,
            schemaVersion: "tenant_transport_health.v1"
          })
        };
      }
      capturedRequest = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        headers: {
          get(name) {
            return name === "x-request-id"
              ? capturedRequest.body.requestId
              : null;
          }
        },
        json: async () => response
      };
    },
    console: { log(value) { logged.push(value); } }
  });

  const inboxExpression = createM1BExpiredOfferInboxBrowserExpression({
    expectedOrigin: context.capitalPartnerOrigin
  });
  const inboxEnvelope = await runInNewContext(
    inboxExpression,
    sandbox(inboxResponse),
    { timeout: 1_000 }
  );
  assert.equal(capturedRequest.url, "/tenant/v1/operations");
  assert.equal(
    capturedRequest.options.headers["x-csrf-token"],
    secretCsrf
  );
  assert.deepEqual(capturedRequest.body, {
    operationId: "pilotReadCapitalPartnerPassportInbox",
    payload: {},
    requestId: inboxEnvelope.requestId,
    correlationId: inboxEnvelope.correlationId,
    schemaVersion: "tenant_protocol_request.v1"
  });
  assert.equal(JSON.stringify(inboxEnvelope).includes(secretCsrf), false);

  const author = createM1BExpiredOfferAuthorBrowserExpression({
    expectedOrigin: context.capitalPartnerOrigin,
    inboxResponse,
    criticalBinding: context.capitalPartnerCriticalBinding
  });
  const authoredResponse = {
    offer: { creditOfferId: "credit_offer_c", schemaVersion: "credit_offer.v2" },
    fundsAuthority: false,
    schemaVersion: "tenant_capital_partner_offer_authored.v1"
  };
  const before = Date.now();
  const authorEnvelope = await runInNewContext(
    author.browserExpression,
    sandbox(authoredResponse),
    { timeout: 1_000 }
  );
  const after = Date.now();
  const request = capturedRequest.body;
  assert.equal(healthRequest.url, "/tenant/v1/healthz");
  assert.equal(healthRequest.options.credentials, "omit");
  assert.equal(request.operationId, "pilotAuthorCapitalPartnerOffer");
  assert.deepEqual(request.resource, {
    resourceType: "credit_passport_artifact",
    resourceId: "passport_c"
  });
  assert.match(request.idempotencyKey, /^m1b_expired_author_idempotency_/);
  assert.equal(request.payload.creditIntentId, "credit_intent_c");
  assert.equal(request.payload.artifactHash, HASH);
  assert.equal(request.payload.artifactVersion, 1);
  assert.equal(request.payload.facilityLimitMinor, "25000");
  assert.equal(request.payload.approvedPrincipalMinor, "12000");
  assert.equal(request.payload.installmentCount, 2);
  assert.equal(
    Date.parse(request.payload.validUntil) >= before + 103_000 &&
      Date.parse(request.payload.validUntil) <= after + 106_000,
    true
  );
  const termKeys = [
    "assetId", "facilityLimitMinor", "approvedPrincipalMinor",
    "perDrawCapMinor", "annualRateBps", "originationFeeMinor",
    "repaymentFrequency", "installmentCount", "firstPaymentAt",
    "maturityAt", "permittedPurposeCode", "conditions",
    "undrawnRevocationRule", "validUntil", "reasonCodes", "disclosureRef"
  ];
  const terms = Object.fromEntries(termKeys.map((key) => [
    key,
    request.payload[key]
  ]));
  const expectedSnapshotHash = `0x${createHash("sha256").update(JSON.stringify({
    creditIntentId: request.payload.creditIntentId,
    passportId: request.resource.resourceId,
    artifactHash: request.payload.artifactHash,
    artifactVersion: request.payload.artifactVersion,
    terms
  })).digest("hex")}`;
  assert.equal(request.payload.underwritingSnapshotHash, expectedSnapshotHash);
  assert.equal(authorEnvelope.response, authoredResponse);
  assert.equal(JSON.stringify(authorEnvelope).includes(secretCsrf), false);
  assert.equal(logged.every((line) => !line.includes(secretCsrf)), true);
  assert.doesNotMatch(author.browserExpression, /document\.cookie|localStorage|signature|wallet/i);
});

test("restart receipt binds same containers, later starts, exact events, Engine, and retained volume", () => {
  const { after, restart, summary } = restartEvidence();
  assert.equal(summary.services.postgres.start, 1);
  assert.equal(summary.services.pilot.die, 1);
  assert.equal(restart.services.every(({ before, after: next }) =>
    before.containerId === next.containerId && before.startedAt < next.startedAt
  ), true);
  assert.equal(restart.volume.createDestroyEventCount, 0);
  const receipt = {
    schemaVersion: "m1_b_restart_receipt.v2",
    status: "passed",
    restartCount: 1,
    capturedAt: restart.capturedAt,
    beforeDatabaseStartedAt: restart.beforeDatabaseStartedAt,
    afterDatabaseStartedAt: restart.afterDatabaseStartedAt,
    eventWindow: restart.eventWindow,
    engine: restart.engine,
    volume: restart.volume,
    services: restart.services
  };
  assert.equal(assertM1BOperationalRuntimeMatchesRestart(receipt, after), true);
});

test("restart proof rejects recreation, extra start, and volume destruction", () => {
  const { before, after } = restartEvidence();
  const baseLines = ["postgres", "pilot", "worker"].flatMap((service) =>
    ["kill", "die", "stop", "start"].map((action) => containerEvent(service, action))
  );
  const extraStart = createM1BRestartEventSummary(before, after, {
    containerLines: [...baseLines, containerEvent("pilot", "start")],
    volumeLines: []
  });
  assert.throws(
    () => createM1BRestartContext(before, after, extraStart),
    /event binding/
  );
  for (const action of ["start", "create", "destroy"]) {
    const inheritedPilotLabelReader = JSON.stringify({
      Action: action,
      Actor: {
        ID: "9".repeat(64),
        Attributes: { "com.docker.compose.service": "pilot" }
      }
    });
    assert.throws(
      () => createM1BRestartEventSummary(before, after, {
        containerLines: [...baseLines, inheritedPilotLabelReader],
        volumeLines: []
      }),
      /pilot restart events do not bind the captured container/
    );
  }
  for (const action of ["create", "destroy"]) {
    const unexpectedProjectContainer = JSON.stringify({
      Action: action,
      Actor: {
        ID: "8".repeat(64),
        Attributes: { "com.docker.compose.service": "runtime-reader" }
      }
    });
    assert.throws(
      () => createM1BRestartEventSummary(before, after, {
        containerLines: [...baseLines, unexpectedProjectContainer],
        volumeLines: []
      }),
      /unexpected project container/
    );
  }
  assert.throws(
    () => createM1BRestartEventSummary(before, after, {
      containerLines: baseLines,
      volumeLines: [JSON.stringify({ Action: "destroy" })]
    }),
    /created or destroyed/
  );
  const recreated = structuredClone(after);
  recreated.services.pilot.containerId = "4".repeat(64);
  assert.throws(
    () => createM1BRestartContext(
      before,
      recreated,
      createM1BRestartEventSummary(before, after, {
        containerLines: baseLines,
        volumeLines: []
      })
    ),
    /without recreation/
  );
  const outOfOrder = structuredClone(after);
  outOfOrder.services.pilot.startedAt = "2026-08-15T00:10:05.000Z";
  assert.throws(
    () => createM1BRestartContext(
      before,
      outOfOrder,
      createM1BRestartEventSummary(before, after, {
        containerLines: baseLines,
        volumeLines: []
      })
    ),
    /startup chronology/
  );
});

test("Agent phase completion receipts enforce the sole-restart acceptance chronology", () => {
  const { restart } = restartEvidence();
  const values = {
    beforePhase: { completedAt: "2026-08-15T00:00:59.000Z" },
    restart,
    afterPhase: {
      startedAt: "2026-08-15T00:11:01.000Z",
      completedAt: "2026-08-15T00:12:00.000Z"
    },
    humanCapturedAt: "2026-08-15T00:13:00.000Z",
    capitalPartnerCapturedAt: "2026-08-15T00:14:00.000Z",
    riskCapturedAt: "2026-08-15T00:20:00.000Z"
  };
  assert.equal(
    validateM1BAgentAcceptanceChronology(values).riskCapturedAt,
    Date.parse(values.riskCapturedAt)
  );
  for (const changed of [
    { beforePhase: { completedAt: restart.eventWindow.engineBeforeAt } },
    { afterPhase: { ...values.afterPhase, startedAt: restart.eventWindow.engineAfterAt } },
    { afterPhase: { ...values.afterPhase, completedAt: values.humanCapturedAt } },
    { riskCapturedAt: values.capitalPartnerCapturedAt },
    { humanCapturedAt: "not-a-timestamp" }
  ]) {
    assert.throws(
      () => validateM1BAgentAcceptanceChronology({ ...values, ...changed }),
      /chronology is invalid/
    );
  }
});

test("safe NDJSON rejects operator browser, journey, and negative self-attestation", () => {
  const browser = {
    type: "browser_row",
    role: "human",
    check: "desktop",
    capturedAt: "2026-08-15T01:00:00.000Z",
    origin: "http://127.0.0.1:18887/",
    driver: "playwright_cli",
    authentication: {
      mode: "human_invited_wallet_siwe",
      bypassUsed: false,
      sessionMaterialCaptured: false
    },
    diagnostics: {
      consoleErrorCount: 0,
      failedNetworkRequestCount: 0,
      observationMethod: "playwright_console_and_network"
    },
    assertions: M1_B_OPERATIONAL_BROWSER_ASSERTIONS.desktop.map((id) => ({
      id,
      passed: true
    })),
    negativeCase: null,
    visualArtifact: {
      kind: "screenshot",
      relativePath: "output/playwright/m1-b-p0-5/example.png"
    }
  };
  const journey = {
    type: "journey_step",
    role: "principal_agent",
    step: "mcp_execution",
    observedAt: "2026-08-15T01:01:00.000Z",
    transport: "agent_mcp"
  };
  assert.throws(
    () => parseM1BOperationalObservations(`${JSON.stringify(browser)}\n`),
    /operator row claims are forbidden/
  );
  assert.throws(
    () => parseM1BOperationalObservations(`${JSON.stringify(journey)}\n`),
    /operator timestamps are forbidden/
  );
  assert.throws(
    () => parseM1BOperationalObservations(
      `${JSON.stringify({ ...browser, cookie: "session=secret" })}\n`
    ),
    /forbidden/
  );
  assert.throws(
    () => parseM1BOperationalObservations(
      `${JSON.stringify({ type: "negative_case" })}\n`
    ),
    /cannot be supplied as operator NDJSON/
  );
});

test("journey bindings use Agent before receipts for first ten steps and after only for recovery", () => {
  const operation = (operationId) => ({
    operationId,
    requestId: `request_${operationId}`,
    correlationId: `correlation_${operationId}`,
    responseSchemaVersion: `response_${operationId}.v1`,
    occurredAt: "2026-08-15T00:05:00.000Z"
  });
  const sourceFiles = [
    ["human_critical", "postgres_receipt"],
    ["capital_partner_critical", "postgres_receipt"],
    ["agent_before", "runtime_receipt"],
    ["agent_after", "runtime_receipt"]
  ].map(([id, kind], index) => ({
    id,
    kind,
    relativePath: `output/playwright/m1-b-p0-5/${id}.json`,
    sha256: String(index + 1).repeat(64)
  }));
  const supportingFiles = [
    "agent_application_mcp",
    "agent_runtime_mcp"
  ].map((id, index) => ({
    id,
    kind: "agent_mcp_receipt",
    relativePath: `output/playwright/m1-b-p0-5/${id}.json`,
    sha256: String(index + 5).repeat(64)
  }));
  const agentSteps = [
    "pilotAcceptCreditOffer",
    "pilotExecuteSandboxObligation",
    "pilotPostSandboxRepayment",
    "pilotReadOwnObligationEvidence"
  ].map((operationId) => ({
    operationId,
    requestId: `request_${operationId}`,
    responseSchemaVersion: `response_${operationId}.v1`
  }));
  const criticalDocuments = {
    human_critical: {
      capturedAt: "2026-08-15T00:13:00.000Z",
      authentication: { mode: "siwe" },
      actorScope: { actorRefHash: HASH },
      originLineage: {
        commandReceipts: Array.from({ length: 4 }, (_, index) => ({
          operationId: `origin_${index}`,
          completedAt: "2026-08-15T00:01:00.000Z"
        }))
      },
      recovery: {
        operationId: "pilotReadWorkspaceResume",
        requestId: "request_human_recovery",
        correlationId: "correlation_human_recovery",
        responseSchemaVersion: "tenant_workspace_resume_view.v2",
        offerProjectionProof: { sourceEventId: "event_offer" }
      },
      operations: [
        operation("pilotReadWorkspaceResume"),
        operation("pilotAcceptCreditOffer"),
        operation("pilotExecuteSandboxObligation"),
        operation("pilotPostSandboxRepayment"),
        operation("pilotReadOwnObligationEvidence")
      ],
      linkage: { obligationId: "obligation_human" },
      durability: {
        economicReadBack: { obligationStatus: "fully_repaid" },
        evidenceCompleteness: { finalHasMore: false }
      }
    },
    capital_partner_critical: {
      capturedAt: "2026-08-15T00:14:00.000Z",
      authentication: { capitalPartner: { mode: "siwe" } },
      profile: { selfQueryProof: { operationId: "pilotReadCapitalPartnerSelf" } },
      currentLineage: {
        passport: { artifactId: "passport_a" },
        authoredOffer: { creditOfferId: "offer_a" },
        replacement: { eventId: "event_replace_a" },
        borrowerRecovery: { creditOfferId: "offer_a" }
      },
      withdrawalLineage: {
        passport: { artifactId: "passport_b" },
        authoredOffer: { creditOfferId: "offer_b" },
        replacement: { eventId: "event_replace_b" },
        withdrawal: {
          requestId: "request_withdraw_b",
          correlationId: "correlation_withdraw_b",
          responseSchemaVersion: "tenant_capital_partner_offer_transitioned.v1"
        },
        borrowerRecovery: { creditOfferId: "offer_a" }
      },
      durability: {
        commandReceipts: [
          { operationId: "pilotAuthorCapitalPartnerOffer" },
          { operationId: "pilotAuthorCapitalPartnerOffer" },
          { operationId: "pilotTransitionCapitalPartnerOffer" }
        ]
      }
    },
    agent_before: {
      candidateReleaseId: RELEASE_SHA,
      candidateMarker: `m1b.agent.${RELEASE_SHA}`,
      accountHash: HASH,
      subjectId: "subject_agent",
      mandateId: "mandate_agent",
      applicationHandoff: { subjectId: "subject_agent", mandateId: "mandate_agent" },
      runtimeHandoff: { subjectId: "subject_agent", mandateId: "mandate_agent" },
      offerReceipt: {
        steps: [
          { operationId: "pilotReadAgentSelf" },
          { operationId: "pilotRequestCredit" },
          { operationId: "pilotReadCreditApplication" },
          { operationId: "pilotEvaluateCreditApplication" }
        ],
        decision: { riskDecisionId: "decision_agent" },
        offer: { creditOfferId: "offer_agent" }
      },
      lifecycle: {
        workflowReceipt: {
          correlationId: "correlation_agent_workflow",
          acceptance: { creditOfferId: "offer_agent" },
          executionReceipt: { obligationId: "obligation_agent" },
          repayment: { repaymentId: "repayment_agent" }
        },
        mcpReceipt: { steps: agentSteps },
        evidence: { obligationId: "obligation_agent", hasMore: false }
      }
    },
    agent_after: {
      recoveryReceipt: {
        status: "recovered",
        obligationId: "obligation_agent",
        capturedAt: "2026-08-15T00:12:30.000Z"
      },
      canonicalRecovery: { obligation: { obligationId: "obligation_agent" } },
      lifecycleMutationPerformed: false
    }
  };
  const bindings = createM1BOperationalJourneyBindings({
    criticalArtifacts: sourceFiles,
    supportingArtifacts: supportingFiles,
    criticalDocuments
  });
  const agent = bindings.principal_agent;
  for (const step of Object.keys(agent).slice(0, 4)) {
    assert.equal(agent[step].sourceBindings[0].sourceArtifact.id, "agent_before");
    assert.equal(agent[step].executionPhase, "pre_restart");
  }
  for (const step of ["agent_application", "offer"]) {
    assert.equal(agent[step].sourceBindings[0].sourceArtifact.id, "agent_application_mcp");
    assert.equal(agent[step].executionPhase, "pre_restart");
  }
  for (const step of ["acceptance", "mcp_execution", "repayment", "evidence"]) {
    assert.deepEqual(
      agent[step].sourceBindings.map(({ sourceArtifact }) => sourceArtifact.id),
      ["agent_runtime_mcp", "agent_before"]
    );
    assert.equal(agent[step].executionPhase, "pre_restart");
  }
  assert.equal(agent.agent_application.sourceBindings[0].sourcePointer, "/steps");
  assert.equal(agent.offer.sourceBindings[0].sourcePointer, "/decision+/offer");
  assert.equal(
    agent.acceptance.sourceBindings[0].sourcePointer,
    "/steps/pilotAcceptCreditOffer"
  );
  assert.equal(
    agent.acceptance.sourceBindings[1].sourcePointer,
    "/lifecycle/workflowReceipt/acceptance"
  );
  assert.equal(agent.restart_recovery.sourceBindings[0].sourceArtifact.id, "agent_after");
  assert.equal(agent.restart_recovery.executionPhase, "post_restart_recovery");
  assert.equal(agent.principal_sign_in.requestId, null);
  assert.equal(agent.account_proof.requestId, null);
  assert.equal(agent.mandate.requestId, null);
  assert.equal(agent.mcp_execution.operationId, "pilotExecuteSandboxObligation");
  assert.equal(agent.mcp_execution.requestId, "request_pilotExecuteSandboxObligation");
  for (const binding of Object.values(agent)) {
    for (const sourceBinding of binding.sourceBindings) {
      assert.notEqual(sourceBinding.sourceProjection, undefined);
      assert.equal(
        sourceBinding.sourceProjectionHash,
        projectionHash(sourceBinding.sourceProjection)
      );
    }
    assert.equal(binding.combinedSourceProjectionHash, projectionHash(binding.sourceBindings));
  }

  const browserAuditRecords = M1_B_OPERATIONAL_ROLES.flatMap((role) =>
    M1_B_OPERATIONAL_BROWSER_CHECKS.map((check) => {
      const document = {
        schemaVersion: "m1_b_browser_row_audit.v2",
        role,
        check,
        capturedAt: "2026-08-15T00:15:00.000Z"
      };
      return {
        artifact: {
          id: `browser_${role}_${check}_audit`,
          kind: "browser_audit",
          relativePath:
            `output/playwright/m1-b-p0-5/${RELEASE_SHA}.browser.${role}.${check}.audit.json`,
          sha256: createHash("sha256")
            .update(`${JSON.stringify(document, null, 2)}\n`)
            .digest("hex")
        },
        document
      };
    })
  );
  const { restart } = restartEvidence();
  const receiptContext = {
    candidateReleaseId: RELEASE_SHA,
    sourceTreeHash: "d".repeat(40),
    runtimeImageId: IMAGE_ID,
    databaseStartedAt: restart.afterDatabaseStartedAt,
    criticalDocuments,
    criticalArtifacts: sourceFiles,
    supportingArtifacts: supportingFiles,
    browserAuditRecords,
    restart,
    restartArtifact: {
      id: "operational_restart",
      kind: "restart_log",
      relativePath: "output/playwright/m1-b-p0-5/restart.json",
      sha256: "7".repeat(64)
    },
    releaseIdentityArtifact: {
      id: "release_identity",
      kind: "release_identity",
      relativePath: "output/playwright/m1-b-p0-5/release.json",
      sha256: "8".repeat(64)
    },
    reconciledAt: "2026-08-15T00:16:00.000Z"
  };
  const receipts = createM1BOperationalJourneyReceipts(receiptContext);
  assert.deepEqual(Object.keys(receipts), M1_B_OPERATIONAL_ROLES);
  assert.equal(
    Object.values(receipts).reduce((count, receipt) => count + receipt.steps.length, 0),
    28
  );
  assert.equal(
    validateM1BOperationalJourneyReceipts(receipts, receiptContext),
    receipts
  );
  const tampered = structuredClone(receipts);
  tampered.principal_agent.steps[6].previousStepHash = HASH;
  assert.throws(
    () => validateM1BOperationalJourneyReceipts(tampered, receiptContext),
    /do not reconstruct/
  );
});

test("browser runtime proof performs one credential-omitted exact Tenant health request", async () => {
  const calls = [];
  const body = {
    status: "ready",
    transport: "authenticated_http_loopback",
    public: false,
    schemaVersion: "tenant_transport_health.v1"
  };
  const bodyText = JSON.stringify(body);
  const times = [
    "2026-08-15T00:10:30.000Z",
    "2026-08-15T00:10:31.000Z"
  ];
  const observation = await collectM1BBrowserRuntimeObservation({
    candidateReleaseId: RELEASE_SHA,
    role: "human",
    check: "desktop",
    origin: "http://127.0.0.1:18887/",
    databaseStartedAt: "2026-08-15T00:10:10.000Z",
    runtimeImageId: IMAGE_ID
  }, {
    requestIdFactory: () => "m1b_ready_browser_desktop_001",
    now: () => times.shift(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        status: 200,
        headers: {
          get(name) {
            return {
              "x-request-id": "m1b_ready_browser_desktop_001",
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "content-length": String(Buffer.byteLength(bodyText))
            }[name] ?? null;
          }
        },
        async text() {
          return bodyText;
        }
      };
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:18887/tenant/v1/healthz");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(Object.hasOwn(calls[0].options.headers, "cookie"), false);
  assert.equal(Object.hasOwn(calls[0].options.headers, "authorization"), false);
  assert.equal(observation.candidateReleaseId, RELEASE_SHA);
  assert.equal(observation.response.body.transport, "authenticated_http_loopback");
  assert.equal(observation.response.requestId, observation.request.requestId);
});

test("measured browser collection reconciles each authenticated phase immediately and reconstructs row documents", async () => {
  let tick = 0;
  const events = [];
  const databaseStartedAt = "2026-08-15T00:10:10.000Z";
  const collection = await collectM1BOperationalBrowserMeasurements({
    candidateReleaseId: RELEASE_SHA,
    sourceTreeHash: "d".repeat(40),
    runtimeImageId: IMAGE_ID,
    databaseStartedAt,
    portBase: 18_887,
    outputRoot: resolve(ROOT, "output/playwright/m1-b-p0-5"),
    clock: () => new Date(
      Date.parse(databaseStartedAt) + (++tick * 1_000)
    ).toISOString(),
    async exchange(prompt) {
      events.push(`exchange:${prompt.role}:${prompt.check}:${prompt.phase}`);
      return JSON.stringify(measuredBrowserResponse(prompt));
    },
    async reconcileAuthenticatedRead(context) {
      events.push(`reconcile:${context.role}:${context.operationId}`);
      return browserAppRoleRead(context);
    }
  });
  assert.equal(collection.browserRows.length, 24);
  assert.equal(events.filter((value) => value.startsWith("exchange:")).length, 33);
  assert.equal(events.filter((value) => value.startsWith("reconcile:")).length, 27);
  const before = events.indexOf(
    "exchange:human:sign_out_relogin:before_sign_out"
  );
  const signedOut = events.indexOf(
    "exchange:human:sign_out_relogin:signed_out"
  );
  assert.match(events[before + 1], /^reconcile:human:/);
  assert.equal(signedOut > before + 1, true);

  const row = collection.browserRows.find(
    ({ role, check }) => role === "human" && check === "desktop"
  );
  const body = {
    status: "ready",
    transport: "authenticated_http_loopback",
    public: false,
    schemaVersion: "tenant_transport_health.v1"
  };
  const bodyText = JSON.stringify(body);
  const readiness = await collectM1BBrowserRuntimeObservation({
    candidateReleaseId: RELEASE_SHA,
    role: "human",
    check: "desktop",
    origin: "http://127.0.0.1:18887/",
    databaseStartedAt,
    runtimeImageId: IMAGE_ID
  }, {
    requestIdFactory: () => "m1b_ready_browser_document_001",
    now: (() => {
      const values = [
        "2026-08-15T00:20:00.000Z",
        "2026-08-15T00:20:00.100Z"
      ];
      return () => values.shift();
    })(),
    fetchImpl: async () => ({
      status: 200,
      headers: { get: (name) => ({
        "x-request-id": "m1b_ready_browser_document_001",
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "content-length": String(Buffer.byteLength(bodyText))
      })[name] ?? null },
      text: async () => bodyText
    })
  });
  const visualArtifacts = row.phaseEvidence.map(({ prompt, response }) => ({
    phase: prompt.phase,
    id: "browser_human_desktop_auth_shot",
    kind: "screenshot",
    relativePath:
      `output/playwright/m1-b-p0-5/${RELEASE_SHA}.browser.human.desktop.` +
      `${prompt.phase}.png`,
    sha256: "7".repeat(64),
    challengeHash: prompt.capture.challengeHash,
    png: {
      width: response.measurement.viewport.innerWidth,
      height: response.measurement.viewport.innerHeight,
      idatCount: 1
    }
  }));
  const context = {
    candidateReleaseId: RELEASE_SHA,
    sourceTreeHash: "d".repeat(40),
    runtimeImageId: IMAGE_ID,
    databaseStartedAt,
    row,
    releaseIdentityArtifact: {
      id: "release_identity",
      sha256: "8".repeat(64)
    },
    criticalArtifact: {
      id: "human_critical",
      kind: "postgres_receipt",
      sha256: "9".repeat(64)
    },
    visualArtifacts,
    readinessObservation: readiness,
    outputRootRelativePath: "output/playwright/m1-b-p0-5"
  };
  const documents = createM1BOperationalBrowserRowDocuments(context);
  assert.equal(documents.runtimeDocument.queryReconciliation.runtimeCapturedProjection, true);
  assert.equal(
    documents.runtimeDocument.queryReconciliation.durableQueryResponseTableAvailable,
    false
  );
  assert.equal(
    documents.auditDocument.runtimeArtifact.sha256,
    documents.runtimeArtifact.sha256
  );
  assert.equal(validateM1BOperationalBrowserRowDocuments(documents, context), documents);
  const tampered = structuredClone(documents);
  tampered.runtimeDocument.queryReconciliation.exactRequestTwoAuditReconciled = false;
  assert.throws(
    () => validateM1BOperationalBrowserRowDocuments(tampered, context),
    /do not reconstruct/
  );

  let staleTick = 0;
  let currentPrompt;
  await assert.rejects(
    collectM1BOperationalBrowserMeasurements({
      candidateReleaseId: RELEASE_SHA,
      sourceTreeHash: "d".repeat(40),
      runtimeImageId: IMAGE_ID,
      databaseStartedAt,
      portBase: 18_887,
      outputRoot: resolve(ROOT, "output/playwright/m1-b-p0-5"),
      clock: () => new Date(
        Date.parse(databaseStartedAt) + (++staleTick * 1_000)
      ).toISOString(),
      async exchange(prompt) {
        currentPrompt = prompt;
        return JSON.stringify(measuredBrowserResponse(prompt));
      },
      async reconcileAuthenticatedRead(readContext) {
        const receipt = browserAppRoleRead(readContext);
        if (
          currentPrompt.check === "fresh_browser_context" &&
          currentPrompt.phase === "authenticated"
        ) receipt.authenticationAssurance.authTime = databaseStartedAt;
        return receipt;
      }
    }),
    /fresh SIWE ceremony/
  );
});

test("negative registry is closed and missing-case error preserves split provenance", () => {
  assert.equal(M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.length, 16);
  assert.deepEqual(
    M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
      ({ sourceMode }) => sourceMode === "exact_source_transport"
    ).map(({ group, id }) => `${group}:${id}`),
    ["authorization:signed_out_private_read"]
  );
  assert.equal(
    M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
      ({ sourceMode }) => sourceMode === "exact_source_disposable_postgres"
    ).length,
    10
  );
  assert.deepEqual(
    Object.fromEntries([
      "live_post_restart",
      "exact_source_disposable_postgres",
      "exact_source_ui_binding",
      "exact_source_transport"
    ].map((sourceMode) => [sourceMode,
      M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
        (definition) => definition.sourceMode === sourceMode
      ).length
    ])),
    {
      live_post_restart: 4,
      exact_source_disposable_postgres: 10,
      exact_source_ui_binding: 1,
      exact_source_transport: 1
    }
  );
  assert.equal(
    M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.find(
      ({ group, id }) => group === "human" && id === "duplicate_acceptance"
    ).sourceMode,
    "exact_source_disposable_postgres"
  );
  assert.equal(
    M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.find(
      ({ group, id }) => group === "human" && id === "changed_version"
    ).sourceMode,
    "exact_source_ui_binding"
  );
  const missing = missingM1BDerivedNegativeCases([{
    group: "human",
    id: "replaced_stale_offer"
  }]);
  assert.equal(missing.length, 15);
  assert.equal(missing.includes("exact_source_transport:authorization:signed_out_private_read"), true);
  assert.equal(missing.includes("exact_source_disposable_postgres:agent:revoked_mandate"), true);
});

const NEGATIVE_PROTECTED_TABLES = Object.freeze([
  "command_idempotency",
  "command_events",
  "tenant_command_executions",
  "mandates",
  "authorization_resources",
  "authorization_resource_bindings",
  "domain_events",
  "credit_events",
  "evidence_envelopes",
  "projection_registry",
  "projection_snapshots",
  "credit_offers",
  "credit_offer_acceptances",
  "obligations",
  "obligation_installments",
  "ledger_accounts",
  "ledger_transactions",
  "ledger_entries",
  "sandbox_execution_receipts",
  "repayment_events",
  "lockboxes",
  "credit_lines"
]);

function protectedStateManifest() {
  return Object.fromEntries(NEGATIVE_PROTECTED_TABLES.map((table, index) => [
    table,
    {
      rowCount: index + 1,
      manifestHash: `0x${String(index + 1).padStart(64, "0")}`
    }
  ]));
}

async function exactSourceNegativeSuite(outputRoot) {
  const definitions = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    ({ sourceMode }) => sourceMode !== "live_post_restart"
  );
  const cases = await Promise.all(definitions.map(async (definition, index) => {
    const tapBytes = Buffer.from(`TAP version 13\n# exact case ${index + 1}\n`);
    const tapSha256 = createHash("sha256").update(tapBytes).digest("hex");
    const tapId = `negative_tap_${definition.group}_${definition.id}`
      .replace(/[^a-z0-9_]/g, "_");
    const transport = definition.sourceMode === "exact_source_transport";
    const disposable = definition.sourceMode === "exact_source_disposable_postgres";
    const duplicate = definition.group === "human" && definition.id === "duplicate_acceptance";
    const protectedState = disposable ? protectedStateManifest() : null;
    const protectedStateHash = disposable ? projectionHash(protectedState) : null;
    const outwardStatus = transport ? 401 : disposable ? (duplicate ? 200 : 404) : null;
    const outwardCode = transport
      ? "authentication_required"
      : disposable
        ? (duplicate ? "idempotent_replay" : "authorization_denied")
        : null;
    const outwardResponseHash = outwardStatus === null ? null : HASH;
    const sourceFiles = await Promise.all(definition.sourcePaths.map(async (path) => ({
      path,
      sha256: createHash("sha256").update(await readFile(resolve(ROOT, path))).digest("hex")
    })));
    const authorizationDecision = transport
      ? "transport_rejected"
      : duplicate
        ? "idempotent_replay"
        : definition.sourceMode === "exact_source_ui_binding"
          ? "ui_preflight_rejected"
          : "deny";
    const auditEvents = disposable && !duplicate
      ? [{ eventId: `audit_negative_${index + 1}`, decision: "deny" }]
      : [];
    const databaseReadback = disposable ? {
      schemaVersion: "m1_b_negative_database_readback.v2",
      outwardResponseHash,
      authorizationAuditRows: auditEvents.length,
      authorizationAuditEvents: auditEvents,
      authorizationAuditSetHash: projectionHash(auditEvents),
      protectedStateBefore: protectedState,
      protectedStateAfter: protectedState,
      protectedStateBeforeHash: protectedStateHash,
      protectedStateAfterHash: protectedStateHash
    } : null;
    return {
      proof: {
        proofKind: transport
          ? "runtime_observation"
          : disposable
            ? "exact_source_postgres_observation"
            : "exact_source_regression_assertion",
        group: definition.group,
        id: definition.id,
        sourceMode: definition.sourceMode,
        caseDefinitionHash: definition.caseDefinitionHash,
        candidateReleaseId: RELEASE_SHA,
        sourceTreeHash: "d".repeat(40),
        runtimeImageId: IMAGE_ID,
        capturedAt: `2026-08-15T01:00:${String(index + 1).padStart(2, "0")}.000Z`,
        requestId: `request_negative_case_${String(index + 1).padStart(2, "0")}`,
        correlationId: `correlation_negative_case_${String(index + 1).padStart(2, "0")}`,
        outwardStatus,
        outwardCode,
        outwardResponseHash,
        authorizationAuditEventId: authorizationDecision === "deny"
          ? auditEvents[0].eventId
          : null,
        authorizationDecision,
        authorizationReasonCode: outwardCode ?? "ui_preflight_rejected",
        protectedStateBeforeHash: protectedStateHash,
        protectedStateAfterHash: protectedStateHash,
        databaseProof: transport
          ? "not_applicable_transport_boundary"
          : disposable
            ? "disposable_postgres_owner_readback"
            : "exact_source_ui_binding_regression",
        additionalEffectCount: 0,
        nonEnumerating: !duplicate,
        duplicateSemantics: duplicate
          ? "exact_replay_status_200_no_second_effects"
          : null,
        regressionAssertions: transport ? null : {
          schemaVersion: "m1_b_negative_regression_assertions.v2",
          assertedOutwardStatus: duplicate ? 200 : 404,
          assertedOutwardCode: duplicate ? "idempotent_replay" : "authorization_denied",
          protectedStateEqualityAsserted: true,
          additionalEffectCountAsserted: 0,
          responseBytesCaptured: false,
          databaseSnapshotHashesCaptured: disposable,
          actualDatabaseReadback: disposable,
          databaseReadback,
          sourceAssertionHash: HASH,
          compositeConfirmationRegression: false
        },
        sourceEvidence: {
          operationId: definition.operationId,
          subtestName: definition.subtestName,
          supportingArtifacts: [],
          testCommand: definition.testCommand,
          tapSha256,
          exitCode: 0,
          tapParser: "node_test_tap_v13",
          sourceFiles
        },
        producerVerified: true
      },
      tapArtifact: {
        id: tapId,
        kind: "tap_log",
        relativePath: relative(
          ROOT,
          resolve(
            outputRoot,
            `${RELEASE_SHA}.negative.${definition.group}.${definition.id}.tap`
          )
        ),
        sha256: tapSha256,
        bytes: tapBytes
      },
      executionCase: {
        group: definition.group,
        id: definition.id,
        sourceMode: definition.sourceMode,
        caseDefinitionHash: definition.caseDefinitionHash,
        runnerContainerIdHash: `0x${String(index + 1).padStart(64, "0")}`,
        tapArtifact: { id: tapId, sha256: tapSha256 }
      }
    };
  }));
  return {
    proofs: cases.map(({ proof }) => proof),
    tapArtifacts: cases.map(({ tapArtifact }) => tapArtifact),
    manifest: {
      schemaVersion: "m1_b_negative_exact_source_execution_manifest.v2",
      candidateReleaseId: RELEASE_SHA,
      sourceTreeHash: "d".repeat(40),
      runtimeImageId: IMAGE_ID,
      capturedAt: "2026-08-15T01:00:30.000Z",
      postgres: {
        publishedPortCount: 0,
        retainedRuntimeAttached: false,
        internallyGeneratedCredentialsRemoved: true,
        containerRemoved: true,
        volumeRemoved: true,
        networkRemoved: true
      },
      exactCandidateRunner: {
        imageId: IMAGE_ID,
        readOnlyRootFilesystem: true,
        capDropAll: true,
        noNewPrivileges: true,
        rawTapPersistedPerCase: true
      },
      cases: cases.map(({ executionCase }) => executionCase),
      caseCount: cases.length,
      productionFundsMoved: false,
      redaction: {
        containsSecrets: false,
        containsRawPii: false,
        containsSessionMaterial: false
      }
    }
  };
}

test("pre-Risk exact-source negative-run seals 12 compact proofs, 12 TAP logs, manifest, and receipt", async () => {
  const outputRoot = await mkdtemp(resolve(ROOT, "output/playwright/m1-b-negative-run-test-"));
  try {
    const suite = await exactSourceNegativeSuite(outputRoot);
    const artifact = (id, kind, index) => ({
      id,
      kind,
      relativePath: `output/playwright/m1-b-prerequisite-${id}.json`,
      sha256: String(index).repeat(64)
    });
    const result = createM1BOperationalNegativeRunDocuments({
      candidateReleaseId: RELEASE_SHA,
      sourceTreeHash: "d".repeat(40),
      runtimeImageId: IMAGE_ID,
      databaseStartedAt: "2026-08-15T00:10:10.000Z",
      retainedPrimaryOrigin: "http://127.0.0.1:18887/",
      outputRoot,
      startedAt: "2026-08-15T01:00:00.000Z",
      completedAt: "2026-08-15T01:01:00.000Z",
      restartArtifact: artifact("operational_restart", "restart_log", 1),
      prerequisiteArtifacts: [
        artifact("agent_after", "runtime_receipt", 2),
        artifact("agent_after_phase", "runtime_receipt", 3),
        artifact("human_critical", "postgres_receipt", 4),
        artifact("capital_partner_critical", "postgres_receipt", 5)
      ],
      suite
    });
    assert.equal(result.documents.length, 26);
    assert.equal(result.documents.filter(({ kind }) => kind === "tap_log").length, 12);
    assert.equal(result.receipt.schemaVersion,
      "m1_b_operational_exact_source_negative_run_receipt.v2");
    assert.equal(result.receipt.status, "exact_source_negative_run_passed");
    assert.equal(result.receipt.exactSourceCaseCount, 12);
    assert.equal(result.receipt.boundArtifactCount, 25);
    assert.equal(result.receipt.sealedFileCount, 26);
    assert.equal(result.receipt.cases.every(({ proofArtifact, tapArtifact }) =>
      proofArtifact.id.startsWith("negative_source_proof_") &&
      proofArtifact.kind === "negative_source_proof" &&
      /^[0-9a-f]{64}$/.test(proofArtifact.sha256) &&
      /^[0-9a-f]{64}$/.test(tapArtifact.sha256) &&
      proofArtifact.relativePath.startsWith(relative(ROOT, outputRoot)) &&
      tapArtifact.relativePath.startsWith(relative(ROOT, outputRoot)) &&
      proofArtifact.relativePath.includes(".negative-source-proof.")
    ), true);
    assert.equal(result.receipt.cases.every(({ group, id, proofArtifact }) =>
      proofArtifact.relativePath !== relative(
        ROOT,
        resolve(outputRoot, `${RELEASE_SHA}.negative.${group}.${id}.json`)
      )
    ), true);
    assert.equal(
      result.receipt.exactSourceExecutionArtifact.relativePath,
      relative(
        ROOT,
        resolve(outputRoot, `${RELEASE_SHA}.negative-exact-source-execution.json`)
      )
    );
    await writeM1BOperationalDocumentsAtomic(result.documents);
    for (const entry of result.documents) {
      assert.equal((await lstat(resolve(ROOT, entry.relativePath))).mode & 0o777, 0o600);
    }
    await assert.rejects(
      writeM1BOperationalDocumentsAtomic(result.documents),
      (error) => error?.code === "EEXIST"
    );
    const loaded = await readM1BOperationalNegativeRunEvidence({
      candidateReleaseId: RELEASE_SHA,
      sourceTreeHash: "d".repeat(40),
      runtimeImageId: IMAGE_ID,
      databaseStartedAt: "2026-08-15T00:10:10.000Z",
      outputRoot
    });
    assert.equal(loaded.proofs.length, 12);
    assert.equal(loaded.tapArtifacts.length, 12);
    assert.equal(loaded.artifactReferences.length, 26);
    assert.equal(loaded.receiptReference.id, "operational_negative_run");

    const databaseStartedAt = "2026-08-15T00:10:10.000Z";
    const link = ({ id, sha256 }) => ({ id, sha256 });
    const availableArtifacts = result.documents.map(
      ({ id, kind, relativePath, bytes }) => ({
        id,
        kind,
        relativePath,
        sha256: createHash("sha256").update(bytes).digest("hex")
      })
    );
    const finalCases = [];
    for (const proof of loaded.proofs) {
      const runCase = result.receipt.cases.find(
        ({ group, id }) => group === proof.group && id === proof.id
      );
      const receipt = createM1BOperationalNegativeCaseReceipt({
        candidateReleaseId: RELEASE_SHA,
        sourceTreeHash: "d".repeat(40),
        runtimeImageId: IMAGE_ID,
        databaseStartedAt,
        proof,
        sourceProofArtifact: link(runCase.proofArtifact),
        exactSourceExecutionArtifact: link(
          result.receipt.exactSourceExecutionArtifact
        ),
        tapArtifact: link(runCase.tapArtifact)
      });
      await validateM1BOperationalNegativeCaseReceipt(receipt, {
        candidateReleaseId: RELEASE_SHA,
        sourceTreeHash: "d".repeat(40),
        runtimeImageId: IMAGE_ID,
        databaseStartedAt,
        availableArtifacts
      });
      const finalArtifact = {
        id: `negative_${proof.group}_${proof.id}`,
        kind: "negative_receipt",
        relativePath:
          `output/playwright/m1-b-p0-5/${RELEASE_SHA}.negative.${proof.group}.${proof.id}.json`,
        sha256: createHash("sha256")
          .update(`${JSON.stringify(receipt, null, 2)}\n`)
          .digest("hex")
      };
      availableArtifacts.push(finalArtifact);
      finalCases.push({ receipt, artifact: finalArtifact });
    }

    const supporting = [
      ["human_critical", "1"],
      ["capital_partner_critical", "2"],
      ["expired_offer_setup", "3"],
      ["agent_foreign_offer_setup", "4"]
    ].map(([id, digit]) => ({
      id,
      kind: "postgres_receipt",
      relativePath: `output/playwright/m1-b-p0-5/${id}.json`,
      sha256: digit.repeat(64)
    }));
    availableArtifacts.push(...supporting);
    const supportingById = new Map(supporting.map((entry) => [entry.id, entry]));
    const liveRequirements = {
      "human:expired_offer": ["human_critical", "expired_offer_setup"],
      "human:replaced_stale_offer": ["capital_partner_critical"],
      "human:unauthorized_subject": ["human_critical", "agent_foreign_offer_setup"],
      "authorization:cross_role_private_read": [
        "capital_partner_critical", "human_critical"
      ]
    };
    const liveDefinitions = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
      ({ sourceMode }) => sourceMode === "live_post_restart"
    );
    for (const [index, definition] of liveDefinitions.entries()) {
      const key = `${definition.group}:${definition.id}`;
      const proofSupporting = liveRequirements[key].map((id) =>
        link(supportingById.get(id))
      );
      const proof = {
        proofKind: "runtime_observation",
        group: definition.group,
        id: definition.id,
        sourceMode: definition.sourceMode,
        caseDefinitionHash: definition.caseDefinitionHash,
        candidateReleaseId: RELEASE_SHA,
        sourceTreeHash: "d".repeat(40),
        runtimeImageId: IMAGE_ID,
        capturedAt: `2026-08-15T01:02:0${index}.000Z`,
        requestId: `request_live_negative_${String(index + 1).padStart(2, "0")}`,
        correlationId:
          `correlation_live_negative_${String(index + 1).padStart(2, "0")}`,
        outwardStatus: 404,
        outwardCode: "authorization_denied",
        outwardResponseHash: HASH,
        authorizationAuditEventId: `audit_live_negative_${index + 1}`,
        authorizationDecision: "deny",
        authorizationReasonCode: "authorization_denied",
        protectedStateBeforeHash: HASH,
        protectedStateAfterHash: HASH,
        databaseProof: "main_post_restart_application_role",
        additionalEffectCount: 0,
        nonEnumerating: true,
        duplicateSemantics: null,
        regressionAssertions: null,
        sourceEvidence: {
          operationId: definition.operationId,
          subtestName: definition.subtestName,
          supportingArtifacts: proofSupporting,
          testCommand: definition.testCommand,
          tapSha256: null,
          exitCode: null,
          tapParser: null,
          sourceFiles: []
        },
        producerVerified: true
      };
      const sourceArtifact = definition.id === "replaced_stale_offer"
        ? supportingById.get("capital_partner_critical")
        : {
            id: `negative_live_source_proof_${definition.group}_${definition.id}`,
            kind: "negative_source_proof",
            relativePath:
              `output/playwright/m1-b-p0-5/live-proof.${definition.group}.${definition.id}.json`,
            sha256: String(index + 5).repeat(64)
          };
      if (!availableArtifacts.some(({ id }) => id === sourceArtifact.id)) {
        availableArtifacts.push(sourceArtifact);
      }
      const liveAttemptArtifact = definition.id === "replaced_stale_offer"
        ? null
        : {
            id: `negative_live_attempt_${definition.group}_${definition.id}`,
            kind: "negative_receipt",
            relativePath:
              `output/playwright/m1-b-p0-5/live-attempt.${definition.group}.${definition.id}.json`,
            sha256: String(((index + 7) % 9) + 1).repeat(64)
          };
      if (liveAttemptArtifact !== null) availableArtifacts.push(liveAttemptArtifact);
      const receipt = createM1BOperationalNegativeCaseReceipt({
        candidateReleaseId: RELEASE_SHA,
        sourceTreeHash: "d".repeat(40),
        runtimeImageId: IMAGE_ID,
        databaseStartedAt,
        proof,
        sourceProofArtifact: link(sourceArtifact),
        liveAttemptArtifact: liveAttemptArtifact === null
          ? null
          : link(liveAttemptArtifact)
      });
      await validateM1BOperationalNegativeCaseReceipt(receipt, {
        candidateReleaseId: RELEASE_SHA,
        sourceTreeHash: "d".repeat(40),
        runtimeImageId: IMAGE_ID,
        databaseStartedAt,
        availableArtifacts
      });
      const finalArtifact = {
        id: `negative_${proof.group}_${proof.id}`,
        kind: "negative_receipt",
        relativePath:
          `output/playwright/m1-b-p0-5/${RELEASE_SHA}.negative.${proof.group}.${proof.id}.json`,
        sha256: createHash("sha256")
          .update(`${JSON.stringify(receipt, null, 2)}\n`)
          .digest("hex")
      };
      availableArtifacts.push(finalArtifact);
      finalCases.push({ receipt, artifact: finalArtifact });
    }
    const releaseIdentityArtifact = {
      id: "release_identity",
      kind: "release_identity",
      relativePath: "output/playwright/m1-b-p0-5/release.json",
      sha256: "9".repeat(64)
    };
    availableArtifacts.push(releaseIdentityArtifact);
    const manifest = createM1BOperationalNegativeCaseManifest({
      candidateReleaseId: RELEASE_SHA,
      sourceTreeHash: "d".repeat(40),
      runtimeImageId: IMAGE_ID,
      databaseStartedAt,
      releaseIdentityArtifact: link(releaseIdentityArtifact),
      exactSourceExecutionArtifact: link(
        result.receipt.exactSourceExecutionArtifact
      ),
      caseReceipts: finalCases
    });
    assert.equal(manifest.caseCount, 16);
    assert.equal(manifest.cases[0].group, "human");
    assert.equal(
      await validateM1BOperationalNegativeCaseManifest(manifest, {
        candidateReleaseId: RELEASE_SHA,
        sourceTreeHash: "d".repeat(40),
        runtimeImageId: IMAGE_ID,
        databaseStartedAt,
        availableArtifacts,
        caseReceipts: finalCases
      }),
      manifest
    );
    const tamperedManifest = structuredClone(manifest);
    tamperedManifest.cases[0].artifactSha256 = "0".repeat(64);
    await assert.rejects(
      validateM1BOperationalNegativeCaseManifest(tamperedManifest, {
        candidateReleaseId: RELEASE_SHA,
        sourceTreeHash: "d".repeat(40),
        runtimeImageId: IMAGE_ID,
        databaseStartedAt,
        availableArtifacts,
        caseReceipts: finalCases
      }),
      /does not reconstruct/
    );
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("pre-Risk chronology rejects Risk-order inversions and negative-run CLI is explicit", () => {
  const { restart } = restartEvidence();
  const values = {
    restart,
    afterPhase: {
      startedAt: "2026-08-15T00:11:01.000Z",
      completedAt: "2026-08-15T00:12:00.000Z"
    },
    humanCapturedAt: "2026-08-15T00:13:00.000Z",
    capitalPartnerCapturedAt: "2026-08-15T00:14:00.000Z"
  };
  assert.equal(
    validateM1BOperationalPreRiskChronology(values).afterCompletedAt,
    Date.parse(values.afterPhase.completedAt)
  );
  assert.throws(
    () => validateM1BOperationalPreRiskChronology({
      ...values,
      humanCapturedAt: values.afterPhase.completedAt
    }),
    /requires completed restart/
  );
  const parsed = parseM1BOperationalEvidenceArguments([
    "--",
    "negative-run",
    "--candidate-release-id",
    RELEASE_SHA,
    "--pilot-image-id",
    IMAGE_ID,
    "--output-root",
    "output/playwright/m1-b-exact-negative"
  ]);
  assert.equal(parsed.mode, "negative-run");
  const live = parseM1BOperationalEvidenceArguments([
    "--",
    "live-negative",
    "--candidate-release-id",
    RELEASE_SHA,
    "--pilot-image-id",
    IMAGE_ID,
    "--output-root",
    "output/playwright/m1-b-p0-5",
    "--negative-case",
    "authorization:cross_role_private_read"
  ]);
  assert.deepEqual(live.negativeCase, {
    group: "authorization",
    id: "cross_role_private_read"
  });
  for (const badSeparatorArguments of [
    [
      "--", "--", "negative-run",
      "--candidate-release-id", RELEASE_SHA,
      "--pilot-image-id", IMAGE_ID,
      "--output-root", "output/playwright/m1-b-exact-negative"
    ],
    [
      "negative-run",
      "--candidate-release-id", RELEASE_SHA,
      "--", "--pilot-image-id", IMAGE_ID,
      "--output-root", "output/playwright/m1-b-exact-negative"
    ]
  ]) {
    assert.throws(
      () => parseM1BOperationalEvidenceArguments(badSeparatorArguments),
      { code: "operational_arguments_invalid" }
    );
  }
  assert.throws(
    () => parseM1BOperationalEvidenceArguments([
      "live-negative",
      "--candidate-release-id",
      RELEASE_SHA,
      "--pilot-image-id",
      IMAGE_ID,
      "--output-root",
      "output/playwright/m1-b-p0-5",
      "--negative-case",
      "human:replaced_stale_offer"
    ]),
    /candidate-bound private Playwright directory/
  );
});

test("pre-Risk receipt closes 148 artifacts and binds the pending/completed sole restart", () => {
  const { restart } = restartEvidence();
  const reference = (id, kind, index) => ({
    id,
    kind,
    relativePath: `output/playwright/m1-b-p0-5/${id}.json`,
    sha256: String((index % 9) + 1).repeat(64)
  });
  const pending = reference("operational_restart_pending", "restart_log", 0);
  const completed = reference("operational_restart", "restart_log", 1);
  const supporting = [
    reference("agent_before_phase", "runtime_receipt", 2),
    reference("agent_after_phase", "runtime_receipt", 3),
    reference("agent_foreign_offer_setup", "postgres_receipt", 4)
  ];
  const linkage = createM1BOperationalRestartLinkageDocument({
    candidateReleaseId: RELEASE_SHA,
    sourceTreeHash: "d".repeat(40),
    runtimeImageId: IMAGE_ID,
    databaseStartedAt: restart.afterDatabaseStartedAt,
    restart,
    restartPendingArtifact: pending,
    restartArtifact: completed,
    supportingArtifacts: supporting
  });
  assert.equal(linkage.schemaVersion, "m1_b_operational_restart_linkage.v2");
  assert.equal(linkage.pendingJournalArtifact.sha256, pending.sha256);
  assert.equal(linkage.agentForeignOfferSetupArtifact.sha256, supporting[2].sha256);

  const artifacts = exactPreRiskReferences();
  const linkageReference = artifacts.find(
    ({ id }) => id === "operational_restart_linkage"
  );
  const contract = assertM1BOperationalPreRiskArtifactSet({
    candidateReleaseId: RELEASE_SHA,
    boundArtifacts: artifacts
  });
  assert.equal(contract.expected.length, 148);
  assert.equal(contract.workflowKey, "f".repeat(24));
  const receipt = createM1BOperationalPreRiskCollectionReceipt({
    candidateReleaseId: RELEASE_SHA,
    sourceTreeHash: "d".repeat(40),
    runtimeImageId: IMAGE_ID,
    databaseStartedAt: restart.afterDatabaseStartedAt,
    startedAt: "2026-08-15T00:30:00.000Z",
    completedAt: "2026-08-15T00:40:00.000Z",
    restartLinkageArtifact: linkageReference,
    boundArtifacts: artifacts,
    browserRowCount: 24,
    journeyStepCount: 28,
    negativeCaseCount: 16
  });
  assert.equal(
    receipt.schemaVersion,
    "m1_b_operational_pre_risk_collection_receipt.v2"
  );
  assert.equal(receipt.boundArtifactCount, 148);
  assert.equal(receipt.riskEvidenceCollected, false);
  assert.throws(
    () => createM1BOperationalPreRiskCollectionReceipt({
      ...receipt,
      restartLinkageArtifact: linkageReference,
      boundArtifacts: artifacts.map((artifact, index) => index === 20
        ? { ...artifact, id: "risk_critical" }
        : artifact)
    }),
    /prematurely includes Risk/
  );
  assert.throws(
    () => assertM1BOperationalPreRiskArtifactSet({
      candidateReleaseId: RELEASE_SHA,
      boundArtifacts: artifacts.map((artifact, index) => index === 20
        ? {
            ...artifact,
            id: "closed_artifact_filler",
            relativePath: "output/playwright/m1-b-p0-5/filler.json"
          }
        : artifact)
    }),
    /exact 148-artifact closed set|wrong kind or candidate-derived path/
  );
  assert.throws(
    () => assertM1BOperationalPreRiskArtifactSet({
      candidateReleaseId: RELEASE_SHA,
      boundArtifacts: artifacts.map((artifact) => artifact.id ===
        "browser_human_desktop_auth_shot"
        ? { ...artifact, kind: "runtime_receipt" }
        : artifact)
    }),
    /wrong kind or candidate-derived path/
  );
});

test("canonical v2 generator maps the closed operational artifacts into the governance contract", () => {
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const references = exactPreRiskReferences();
  const files = new Map();
  const add = (id, kind, document = {}) => {
    const artifact = references.find((reference) => reference.id === id);
    assert.ok(artifact, `missing exact reference ${id}`);
    assert.equal(artifact.kind, kind);
    files.set(id, { document });
    return artifact;
  };
  for (const [id, kind] of [
    ["release_identity", "release_identity"],
    ["agent_before", "runtime_receipt"],
    ["agent_after", "runtime_receipt"],
    ["human_critical", "postgres_receipt"],
    ["agent_application_mcp", "agent_mcp_receipt"],
    ["agent_runtime_mcp", "agent_mcp_receipt"],
    ["agent_before_phase", "runtime_receipt"],
    ["agent_after_phase", "runtime_receipt"],
    ["agent_recovery_receipt", "runtime_receipt"],
    ["agent_foreign_offer_setup", "postgres_receipt"],
    ["expired_offer_setup", "postgres_receipt"],
    ["operational_restart_pending", "restart_log"],
    ["operational_restart", "restart_log"],
    ["operational_negative_run", "negative_receipt"],
    ["operational_negative_exact_source_execution", "runtime_receipt"],
    ["operational_negative_cases", "negative_receipt"]
  ]) add(id, kind);
  add("operational_restart_linkage", "restart_log", {
    schemaVersion: "m1_b_operational_restart_linkage.v2",
    beforeDatabaseStartedAt: "2026-08-15T00:00:10.000Z",
    afterDatabaseStartedAt: "2026-08-15T00:10:10.000Z"
  });
  const negativeRow = {
    human: { group: "human", id: "expired_offer" },
    principal_agent: { group: "agent", id: "revoked_mandate" },
    capital_partner: {
      group: "authorization",
      id: "cross_role_private_read"
    }
  };
  for (const role of ["human", "principal_agent", "capital_partner"]) {
    for (const check of [
      "desktop", "mobile", "reload", "fresh_browser_context", "back_forward",
      "sign_out_relogin", "negative_authorization", "restart_recovery"
    ]) {
      const prefix = `browser_${role}_${check}`;
      const visualArtifacts = M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES[check]
        .map((phase) => {
          const artifact = add(`${prefix}_${browserPhaseToken(phase)}_shot`, "screenshot");
          return { phase, id: artifact.id, sha256: artifact.sha256 };
        });
      add(`${prefix}_runtime`, "runtime_receipt", {
        schemaVersion: "m1_b_browser_row_runtime_receipt.v2",
        role,
        check,
        browserAuditArtifactId: `${prefix}_audit`,
        visualArtifacts
      });
      add(`${prefix}_audit`, "browser_audit", {
        schemaVersion: "m1_b_browser_row_audit.v2",
        role,
        check,
        driver: "chrome_control",
        runtimeArtifact: { id: `${prefix}_runtime` },
        visualArtifacts,
        negativeCaseArtifact: check === "negative_authorization"
          ? {
              id: `negative_${negativeRow[role].group}_${negativeRow[role].id}`,
              caseDefinitionHash: HASH
            }
          : null
      });
    }
  }
  const stepsByRole = {
    human: [
      "sign_in", "subject_consent", "credit_request", "decision_offer",
      "reload_relogin", "offer_recovery", "acceptance", "obligation",
      "controlled_sandbox_execution", "repayment", "evidence"
    ],
    principal_agent: [
      "principal_sign_in", "agent_subject", "account_proof", "mandate",
      "agent_application", "offer", "acceptance", "mcp_execution",
      "repayment", "evidence", "restart_recovery"
    ],
    capital_partner: [
      "partner_sign_in", "passport_review", "author_offer", "replace_offer",
      "withdraw_offer", "borrower_recovers_current_offer"
    ]
  };
  for (const [role, steps] of Object.entries(stepsByRole)) {
    add(`journey_${role}_receipt`, "runtime_receipt", {
      schemaVersion: "m1_b_journey_receipt.v2",
      role,
      steps: steps.map((id) => {
        const principalMcp = role === "principal_agent" && new Set([
          "agent_application", "offer", "acceptance", "mcp_execution",
          "repayment", "evidence"
        ]).has(id);
        return {
          id,
          transport: principalMcp ? "agent_mcp" : "human_web",
          binding: {
            sourceBindings: [{
              sourceArtifact: {
                id: role === "human"
                  ? "human_critical"
                  : role === "capital_partner"
                    ? "capital_partner_critical"
                    : principalMcp
                      ? (new Set(["agent_application", "offer"]).has(id)
                          ? "agent_application_mcp"
                          : "agent_runtime_mcp")
                      : id === "restart_recovery"
                        ? "agent_after"
                        : "agent_before"
              }
            }]
          }
        };
      })
    });
  }
  const cases = M1_B_OPERATIONAL_NEGATIVE_CASES;
  for (const [group, ids] of Object.entries(cases)) {
    for (const id of ids) {
      const definition = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.find(
        (entry) => entry.group === group && entry.id === id
      );
      const sourceId = definition.sourceMode === "live_post_restart"
        ? id === "replaced_stale_offer"
          ? "capital_partner_critical"
          : `negative_live_source_proof_${group}_${id}`
        : `negative_source_proof_${group}_${id}`;
      add(`negative_${group}_${id}`, "negative_receipt", {
        schemaVersion: "m1_b_negative_case_receipt.v2",
        status: group === "human" && id === "duplicate_acceptance"
          ? "passed_exact_replay"
          : "passed_fail_closed",
        nonEnumerating: !(group === "human" && id === "duplicate_acceptance"),
        sourceProofArtifact: { id: sourceId },
        liveAttemptArtifact: null,
        exactSourceExecutionArtifact: null,
        tapArtifact: null
      });
    }
  }
  assert.equal(references.length, 148);
  assertM1BOperationalPreRiskArtifactSet({
    candidateReleaseId: RELEASE_SHA,
    boundArtifacts: references
  });
  const finalReference = (id, kind, name) => Object.freeze({
    id,
    kind,
    relativePath: `output/playwright/m1-b-p0-5/${name}`,
    sha256: digest(id)
  });
  const preRiskReference = finalReference(
    "operational_pre_risk_collection",
    "runtime_receipt",
    `${RELEASE_SHA}.operational-pre-risk-collection.v2.json`
  );
  const riskReference = finalReference(
    "risk_critical",
    "negative_receipt",
    `${RELEASE_SHA}.risk-mfa-boundary.json`
  );
  const closureReference = finalReference(
    "operational_closure",
    "runtime_receipt",
    `${RELEASE_SHA}.operational-closure.v2.json`
  );
  assert.equal(assertM1BCanonicalOperationalArtifactSet({
    candidateReleaseId: RELEASE_SHA,
    references: [
      ...references,
      preRiskReference,
      riskReference,
      closureReference
    ]
  }), true);
  const criticalDocuments = {
    agent_before: {
      candidateMarker: `m1b.agent.${RELEASE_SHA}`,
      accountHash: HASH,
      subjectId: "subject_agent",
      mandateId: "mandate_agent",
      creditIntentId: "credit_intent_agent",
      creditOfferId: "credit_offer_agent",
      obligationId: "obligation_agent"
    },
    agent_after: {
      facilityId: "facility_agent",
      creditLineId: "credit_line_agent"
    },
    human_critical: {
      databaseStartedAt: "2026-08-15T00:10:10.000Z",
      linkage: {
        subjectId: "subject_human",
        consentId: "consent_human",
        creditIntentId: "credit_intent_human",
        riskDecisionId: "risk_decision_human",
        creditOfferId: "credit_offer_human",
        creditOfferHash: HASH,
        termsHash: HASH,
        offerAggregateVersion: 2,
        creditOfferAcceptanceId: "credit_offer_acceptance_human",
        obligationId: "obligation_human",
        repaymentId: "repayment_human"
      }
    },
    capital_partner_critical: {
      databaseStartedAt: "2026-08-15T00:10:10.000Z",
      profile: { capitalPartnerId: "capital_partner_candidate" },
      currentLineage: {
        preliminaryOffer: { creditOfferId: "credit_offer_preliminary_a" },
        authoredOffer: {
          creditIntentId: "credit_intent_cp_a",
          creditPassportArtifactId: "credit_passport_a",
          creditOfferId: "credit_offer_cp_a",
          creditOfferHash: HASH,
          termsHash: HASH,
          aggregateVersion: 2
        }
      },
      withdrawalLineage: {
        authoredOffer: {
          creditIntentId: "credit_intent_cp_b",
          creditPassportArtifactId: "credit_passport_b",
          creditOfferId: "credit_offer_cp_b"
        }
      }
    },
    risk_critical: {
      postRestartVerification: true,
      policy: { requiresRecentMfaActorTypesPreserved: true },
      liveRuntimeObservation: {
        session: { method: "siwe" },
        checks: [
          {
            kind: "query",
            authorizationDecision: "deny",
            reasonCode: "actor_capability_rejected"
          },
          {
            kind: "command",
            authorizationDecision: "deny",
            reasonCode: "actor_capability_rejected"
          }
        ]
      },
      exposure: { nonSiweActiveRiskCredentialCount: 0 },
      protectedState: { privilegedMutationCount: 0 }
    }
  };
  const evidence = createM1BCanonicalOperationalAcceptanceEvidence({
    candidateReleaseId: RELEASE_SHA,
    sourceTreeHash: "d".repeat(40),
    runtimeImageId: IMAGE_ID,
    portBase: 18_887,
    capturedAt: "2026-08-15T02:00:00.000Z",
    criticalDocuments,
    preRiskEvidence: {
      receipt: { completedAt: "2026-08-15T01:30:00.000Z" },
      files,
      artifactReferences: references,
      receiptReference: preRiskReference
    },
    riskArtifact: riskReference,
    closureArtifact: closureReference
  });
  assert.equal(evidence.artifacts.length, 151);
  assert.equal(evidence.browser.localMatrix.length, 24);
  assert.equal(evidence.browser.hostedMatrix.length, 0);
  assert.equal(
    evidence.negativeCases.human.find(({ id }) => id === "duplicate_acceptance").status,
    "passed_exact_replay"
  );
  assert.equal(
    verifyM1BAcceptanceEvidence(evidence, { expectedCommitSha: RELEASE_SHA }).status,
    "verified"
  );
});

test("production negative-run calls the real orchestrator with exact archive and least-authority retained bindings", async () => {
  const source = await readFile(
    resolve(ROOT, "scripts/m1-b-operational-evidence-builder.mjs"),
    "utf8"
  );
  const branch = source.slice(
    source.indexOf('if (options.mode === "negative-run")'),
    source.indexOf("const critical = await criticalArtifacts", source.indexOf(
      'if (options.mode === "negative-run")'
    ))
  );
  assert.match(branch, /runM1BOperationalExactSourceNegativeSuite\(\{/);
  assert.match(branch, /exactSourceDirectory: runtime\.buildContext/);
  assert.match(branch, /origin: retainedPrimaryOrigin/);
  assert.match(branch, /databaseUrl: retainedDatabaseUrl/);
  assert.match(branch, /databaseSecretFile: DATABASE_SECRET_FILE/);
  assert.match(branch, /assertM1BOperationalRuntimeMatchesRestart\(completed, stable\)/);
  assert.match(branch, /assertExactLocalReleaseSource\(stableRuntime\.releaseIdentity/);
  assert.doesNotMatch(branch, /fixture|placeholder|all.?16/i);
});

test("production expired-Offer setup runs before negative execution and seals one validated 0600 receipt", async () => {
  const source = await readFile(
    resolve(ROOT, "scripts/m1-b-operational-evidence-builder.mjs"),
    "utf8"
  );
  const start = source.indexOf('if (options.mode === "expired-offer-setup")');
  const end = source.indexOf('if (options.mode === "negative-run")', start);
  assert.equal(start >= 0 && end > start, true);
  const branch = source.slice(start, end);
  assert.match(branch, /createM1BExpiredOfferCriticalBinding\(/);
  assert.match(branch, /createM1BExpiredOfferSetupSafetyLatch\(/);
  assert.match(branch, /createM1BExpiredOfferSetupRunnerArguments\(/);
  assert.match(branch, /runInteractiveExpiredOfferSetup\(arguments_\)/);
  assert.match(branch, /validateM1BExpiredOfferSetupReceipt\(receipt/);
  assert.match(branch, /expectedFixtureUsed: false/);
  assert.match(branch, /assertM1BOperationalRuntimeMatchesRestart\(completed, stable\)/);
  assert.match(branch, /assertExactLocalReleaseSource\(stableRuntime\.releaseIdentity/);
  assert.match(branch, /writeM1BOperationalDocumentsAtomic/);
  assert.match(branch, /id: "expired_offer_setup"/);
  assert.match(branch, /kind: "postgres_receipt"/);
  assert.doesNotMatch(branch, /dependencies|password|cookie|signature/i);
  const stateIndex = branch.indexOf("const priorState = await");
  const sealedIndex = branch.indexOf('priorState.status === "sealed"');
  const latchIndex = branch.indexOf(
    "await writeM1BOperationalDocumentsAtomic([Object.freeze({"
  );
  const runnerIndex = branch.indexOf("runInteractiveExpiredOfferSetup(arguments_)");
  assert.equal(
    stateIndex >= 0 && stateIndex < sealedIndex && sealedIndex < latchIndex &&
      latchIndex < runnerIndex,
    true
  );
  const parsed = parseM1BOperationalEvidenceArguments([
    "expired-offer-setup",
    "--candidate-release-id",
    RELEASE_SHA,
    "--pilot-image-id",
    IMAGE_ID,
    "--output-root",
    "output/playwright/m1-b-p0-5"
  ]);
  assert.equal(parsed.mode, "expired-offer-setup");
  assert.equal(parsed.negativeCase, null);

  const cliSource = await readFile(
    resolve(ROOT, "apps/private-pilot/src/m1-b-expired-offer-setup-cli.js"),
    "utf8"
  );
  const poolIndex = cliSource.indexOf("createM1BAcceptanceAppPool({");
  const databaseStartIndex = cliSource.indexOf("await assertDatabaseStart(");
  const firstPromptIndex = cliSource.indexOf("operator.prompt(Object.freeze({");
  const producerIndex = cliSource.indexOf("produceM1BExpiredOfferSetupReceipt({");
  assert.equal(
    poolIndex >= 0 && poolIndex < databaseStartIndex &&
      databaseStartIndex < firstPromptIndex && firstPromptIndex < producerIndex,
    true
  );
  assert.match(cliSource, /withM1BAcceptanceTenantRead\(/);
  assert.match(cliSource, /SELECT pg_postmaster_start_time\(\)/);
  assert.doesNotMatch(cliSource, /loadOrCreate|dependencies:/);
});

test("expired-Offer receipt target is 0600 and cannot overwrite prior bytes", async () => {
  const outputRoot = await mkdtemp(
    resolve(ROOT, "output/playwright/m1-b-expired-write-test-")
  );
  const target = resolve(
    outputRoot,
    `${RELEASE_SHA}.expired-offer-setup.receipt.v1.json`
  );
  const relativePath = relative(ROOT, target);
  const firstDocument = {
    schemaVersion: "m1_b_expired_offer_setup_receipt.v1",
    safe: true
  };
  const firstBytes = `${JSON.stringify(firstDocument, null, 2)}\n`;
  const first = {
    id: "expired_offer_setup",
    kind: "postgres_receipt",
    relativePath,
    document: firstDocument,
    bytes: firstBytes
  };
  try {
    await writeM1BOperationalDocumentsAtomic([first]);
    assert.equal((await lstat(target)).mode & 0o777, 0o600);
    await assert.rejects(
      writeM1BOperationalDocumentsAtomic([{
        ...first,
        document: { schemaVersion: "tampered.v1" },
        bytes: `${JSON.stringify({ schemaVersion: "tampered.v1" }, null, 2)}\n`
      }]),
      (error) => error?.code === "EEXIST"
    );
    assert.equal(await readFile(target, "utf8"), firstBytes);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("expired-Offer safety latch is immutable, 0600, and makes a crash require candidate recut", async () => {
  const outputRoot = await mkdtemp(
    resolve(ROOT, "output/playwright/m1-b-expired-latch-test-")
  );
  const latchPath = resolve(
    outputRoot,
    `${RELEASE_SHA}.expired-offer-setup.safety-latch.v1.json`
  );
  const receiptPath = resolve(
    outputRoot,
    `${RELEASE_SHA}.expired-offer-setup.receipt.v1.json`
  );
  const options = {
    candidateReleaseId: RELEASE_SHA,
    sourceTreeHash: "d".repeat(40),
    runtimeImageId: IMAGE_ID,
    databaseStartedAt: "2026-08-15T00:10:10.000Z",
    armedAt: "2026-08-15T00:13:01.000Z",
    capitalPartnerCriticalArtifact: {
      id: "capital_partner_critical",
      sha256: "1".repeat(64)
    },
    capitalPartnerCriticalCapturedAt: "2026-08-15T00:13:00.000Z",
    receiptRelativePath: relative(ROOT, receiptPath)
  };
  const latch = createM1BExpiredOfferSetupSafetyLatch(options);
  assert.equal(
    validateM1BExpiredOfferSetupSafetyLatch(latch, options),
    latch
  );
  assert.throws(
    () => validateM1BExpiredOfferSetupSafetyLatch({
      ...latch,
      sourceTreeHash: "e".repeat(40)
    }, options),
    /changed or targets another receipt/
  );
  try {
    await writeM1BOperationalDocumentsAtomic([{
      id: "expired_offer_setup_safety_latch",
      kind: "runtime_guard",
      relativePath: relative(ROOT, latchPath),
      document: latch,
      bytes: `${JSON.stringify(latch, null, 2)}\n`
    }]);
    const metadata = await lstat(latchPath);
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.isSymbolicLink(), false);
    assert.equal(metadata.mode & 0o777, 0o600);
    await assert.rejects(
      readM1BExpiredOfferSetupState({
        paths: { latch: latchPath, receipt: receiptPath },
        ...options
      }),
      (error) =>
        error?.code === "operational_expired_offer_candidate_recut_required"
    );

    const invalidReceipt = { schemaVersion: "invalid_receipt.v1" };
    await writeM1BOperationalDocumentsAtomic([{
      id: "expired_offer_setup",
      kind: "postgres_receipt",
      relativePath: relative(ROOT, receiptPath),
      document: invalidReceipt,
      bytes: `${JSON.stringify(invalidReceipt, null, 2)}\n`
    }]);
    await assert.rejects(
      readM1BExpiredOfferSetupState({
        paths: { latch: latchPath, receipt: receiptPath },
        ...options
      }),
      /does not match the exact runtime|receipt/i
    );
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("operational arguments are exact and artifacts are 0600 non-overwriting", async () => {
  const outputRoot = await mkdtemp(resolve(ROOT, "output/playwright/m1-b-operational-test-"));
  try {
    const parsed = parseM1BOperationalEvidenceArguments([
      "restart-begin",
      "--candidate-release-id",
      RELEASE_SHA,
      "--pilot-image-id",
      IMAGE_ID,
      "--output-root",
      relative(ROOT, outputRoot)
    ]);
    assert.equal(parsed.outputRoot, outputRoot);
    const document = { schemaVersion: "test.v1", safe: true };
    const relativePath = relative(ROOT, resolve(outputRoot, "receipt.json"));
    const entry = {
      id: "test_receipt",
      kind: "runtime_receipt",
      relativePath,
      document,
      bytes: `${JSON.stringify(document, null, 2)}\n`
    };
    await writeM1BOperationalDocumentsAtomic([entry]);
    assert.equal((await lstat(resolve(ROOT, relativePath))).mode & 0o777, 0o600);
    await assert.rejects(
      writeM1BOperationalDocumentsAtomic([entry]),
      (error) => error?.code === "EEXIST"
    );
    assert.deepEqual(JSON.parse(await readFile(resolve(ROOT, relativePath))), document);
    const screenshotPath = relative(ROOT, resolve(outputRoot, "sealed-screenshot.bin"));
    const screenshotBytes = Buffer.from("bounded-browser-visual-proof");
    await writeM1BOperationalDocumentsAtomic([{
      id: "browser_human_desktop_screenshot",
      kind: "screenshot",
      relativePath: screenshotPath,
      document: null,
      bytes: screenshotBytes
    }]);
    assert.equal((await lstat(resolve(ROOT, screenshotPath))).mode & 0o777, 0o600);
    assert.deepEqual(await readFile(resolve(ROOT, screenshotPath)), screenshotBytes);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("operational output setup rejects a symlink leaf before chmod", async () => {
  const target = await mkdtemp(resolve(ROOT, "output/playwright/m1-b-output-target-"));
  const link = resolve(
    ROOT,
    `output/playwright/m1-b-output-link-${process.pid}-${Date.now()}`
  );
  try {
    await symlink(target, link);
    await assert.rejects(
      ensureM1BOperationalOutputDirectory(link),
      /real contained directory/
    );
  } finally {
    await rm(link, { force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("exact local restart owns pending-before-stop and completion-after-health", async () => {
  const source = await readFile(resolve(ROOT, "scripts/local-stack.mjs"), "utf8");
  const begin = source.indexOf('operationalRestartEvidence("restart-begin")');
  const stop = source.indexOf('["stop", "worker", "pilot"]', begin);
  const forwarding = source.indexOf("await ensureLoopbackForwarding()", stop);
  const complete = source.indexOf('operationalRestartEvidence("restart-complete")', forwarding);
  assert.equal(begin > 0 && begin < stop, true);
  assert.equal(stop < forwarding && forwarding < complete, true);
  assert.match(source, /if \(!releaseIdentity\.exactCandidate\) return/);
  const completionOnly = source.slice(
    source.indexOf('case "restart-complete-only"'),
    source.indexOf('case "vm-stop"')
  );
  assert.match(completionOnly, /ensureLoopbackForwarding/);
  assert.match(completionOnly, /operationalRestartEvidence\("restart-complete"\)/);
  assert.doesNotMatch(completionOnly, /compose\(\["(?:stop|restart|up)"/);
});

test("restart pending and completion bind the sealed foreign Agent offered-v1 setup", async () => {
  const source = await readFile(
    resolve(ROOT, "scripts/m1-b-operational-evidence-builder.mjs"),
    "utf8"
  );
  const restart = source.slice(
    source.indexOf('if (options.mode === "restart-begin")'),
    source.indexOf('if (options.mode === "negative-run")')
  );
  assert.match(restart, /agent-foreign-offer-setup\.receipt\.v1\.json/);
  assert.match(restart, /validateM1BAgentForeignOfferSetupReceipt/);
  assert.match(restart, /agentForeignOfferSetupArtifact: foreignOfferSetupArtifact/);
  assert.match(
    restart,
    /agentForeignOfferSetupArtifact: before\.agentForeignOfferSetupArtifact/
  );
  assert.match(restart, /Foreign Agent offered-v1 setup changed across the exact restart/);
  assert.match(restart, /createdBeforeRestartAt/);
});

test("foreign Agent setup is a supporting PostgreSQL receipt without widening the critical set", async () => {
  const source = await readFile(
    resolve(ROOT, "scripts/m1-b-operational-evidence-builder.mjs"),
    "utf8"
  );
  const critical = source.slice(
    source.indexOf("async function criticalArtifacts"),
    source.indexOf("export function validateM1BOperationalPreRiskChronology")
  );
  assert.match(
    critical,
    /supportingPaths[\s\S]*agent_foreign_offer_setup:[\s\S]*agent-foreign-offer-setup\.receipt\.v1\.json/
  );
  assert.match(
    critical,
    /id === "agent_foreign_offer_setup"[\s\S]*\? "postgres_receipt"/
  );
  const primaryPaths = critical.slice(
    critical.indexOf("const paths"),
    critical.indexOf("const documents")
  );
  assert.doesNotMatch(primaryPaths, /agent_foreign_offer_setup/);
});
