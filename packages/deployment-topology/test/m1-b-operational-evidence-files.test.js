import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import {
  M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS,
  createM1BOperationalExactSourceNegativeProof,
  deriveM1BReplacedStaleOfferNegativeProofFromCritical,
  getM1BOperationalNegativeCaseDefinition,
  runM1BOperationalExactSourceNegativeCase
} from "../../../apps/private-pilot/src/m1-b-operational-negative-acceptance.js";
import {
  captureM1BOperationalLiveDenialBoundaryForTest,
  createM1BOperationalLiveAttempt,
  deriveM1BOperationalRepositoryIdempotencyKey
} from
  "../../../apps/private-pilot/src/m1-b-operational-live-negative-acceptance.js";
import {
  hashM1BAcceptanceManifest
} from
  "../../../apps/private-pilot/src/m1-b-human-capital-partner-acceptance.js";
import {
  M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE,
  createM1BOperationalBrowserPixelChallengeBits,
  createM1BOperationalBrowserContextLineageProjection
} from
  "../../../apps/private-pilot/src/m1-b-operational-browser-measurement.js";
import { hashId } from "../../domain/src/index.js";
import { M1BAcceptanceEvidenceError } from
  "../../release-governance/src/m1-b-acceptance-evidence.js";
import {
  verifyM1BAgentForeignOfferSetupArtifact,
  verifyM1BAgentPhaseArtifacts,
  verifyM1BExpiredOfferSetupArtifact,
  verifyM1BExactSourceNegativeProofArtifactPair,
  verifyM1BOperationalArtifactContents,
  verifyM1BOperationalBrowserArtifacts,
  verifyM1BOperationalJourneyArtifacts,
  verifyM1BOperationalNegativeArtifacts,
  verifyM1BOperationalRestartArtifacts
} from
  "../../../scripts/m1-b-operational-evidence-files.mjs";
import {
  M1_B_OPERATIONAL_BROWSER_CHECKS,
  M1_B_OPERATIONAL_ROLES,
  collectM1BOperationalBrowserMeasurements,
  createM1BOperationalBrowserRowDocuments,
  createM1BOperationalJourneyReceipts,
  createM1BOperationalNegativeCaseManifest,
  createM1BOperationalNegativeCaseReceipt,
  createM1BOperationalRestartLinkageDocument
} from
  "../../../scripts/m1-b-operational-evidence-builder.mjs";
import {
  createM1BAgentForeignOfferSetupReceipt,
  createM1BAgentPhaseReceipt
} from
  "../../../scripts/m1-b-agent-phase-receipt.mjs";

const CANDIDATE = "a".repeat(40);
const TREE = "b".repeat(40);
const IMAGE = `sha256:${"c".repeat(64)}`;
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writePrivate(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
  await chmod(path, 0o600);
}

function foreignOfferSetupReceipt() {
  const workflowId = `m1b-agent-foreign-offer-${CANDIDATE}`;
  const references = {
    agentActorId: "actor_agent_foreign",
    subjectId: "subject_agent_foreign",
    canonicalMandateId: "mandate_agent_canonical",
    mandateId: "mandate_agent_foreign",
    creditIntentId: "credit_intent_agent_foreign",
    riskDecisionId: "risk_decision_agent_foreign",
    creditOfferId: "credit_offer_agent_foreign"
  };
  const ownedResources = [
    ["subject", "subject", references.subjectId],
    ["mandate", "subject", references.mandateId],
    ["credit_intent", "owner", references.creditIntentId],
    ["credit_offer", "owner", references.creditOfferId]
  ].map(([resourceType, relationship, resourceId]) => ({
    resourceType,
    resourceRefHash: hashId(
      "m1_b_agent_foreign_offer_resource_reference",
      { resourceType, resourceId }
    ),
    relationship,
    resourceVersion: 1,
    bindingVersion: 1,
    status: "active"
  }));
  return createM1BAgentForeignOfferSetupReceipt({
    candidateReleaseId: CANDIDATE,
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

function foreignOfferEvidence(artifact) {
  return {
    schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v2",
    source: { treeSha: TREE },
    runtime: {
      local: {
        agentAcceptance: {
          beforeRestart: { databaseStartedAt: "2026-08-15T00:00:00.000Z" },
          afterRestart: { databaseStartedAt: "2026-08-15T00:10:00.000Z" }
        }
      }
    },
    artifacts: [{
      ...artifact,
      sourceRuntime: "local_exact_commit",
      redacted: true,
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false,
      fixtureGenerated: false
    }]
  };
}

function safeArtifact(artifact) {
  return {
    ...artifact,
    sourceRuntime: "local_exact_commit",
    redacted: true,
    containsSecrets: false,
    containsRawPii: false,
    containsSessionMaterial: false,
    fixtureGenerated: false
  };
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

function projectionHash(value) {
  return `0x${sha256(canonicalJson(value))}`;
}

function browserContextClaim(prompt) {
  if (prompt.check !== "fresh_browser_context") return null;
  const claim = {
    schemaVersion: "m1_b_operational_browser_context_claim.v1",
    promptId: prompt.promptId,
    challenge: prompt.capture.challenge,
    role: prompt.role,
    check: prompt.check,
    phase: prompt.phase,
    createdVia: "chrome_control_tabs_new",
    initialUrl: "about:blank",
    topLevelContextKind: "fresh_top_level_browsing_context",
    contextHash: projectionHash({ context: prompt.role }),
    lineageHash: `0x${"0".repeat(64)}`,
    controllerObservedAt: "2026-08-15T00:10:10.500Z",
    isolatedStorageClaimed: false
  };
  claim.lineageHash = projectionHash(
    createM1BOperationalBrowserContextLineageProjection(prompt, claim)
  );
  return claim;
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
        connectionState: authenticated
          ? "Secure session active"
          : "Sign-in required",
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
      privateRead: authenticated
        ? {
            operationId: prompt.readRequest.operationId,
            requestId: prompt.readRequest.requestId,
            correlationId: prompt.readRequest.correlationId,
            httpStatus: 200,
            responseRequestId: prompt.readRequest.requestId,
            projection,
            projectionHash: projectionHash(projection)
          }
        : null,
      marker: {
        rendered: true,
        challengeHash: prompt.capture.challengeHash
      }
    },
    browserControl: {
      driver: "chrome_control",
      surface: "visible_loopback_measurement_console",
      promptTransport: "visible_paste_and_load",
      executionControl: "visible_click_once",
      responseTransport: "visible_clipboard_copy_button",
      screenshotControl: "external_chrome_control_jpeg_quality_80",
      telemetrySource: "trusted_app_measurement_interval",
      screenshotStatus:
        "external_capture_acknowledged_pending_builder_validation",
      contextClaim: browserContextClaim(prompt),
      runtimeErrorCount: 0,
      unhandledRejectionCount: 0,
      measurementRequestFailureCount: 0
    }
  };
}

function browserAppRoleRead(context) {
  const authorizationAuditEvents = [1, 2].map((sequence) => ({
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
    events: authorizationAuditEvents
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
    authorizationAuditEvents,
    authorizationAuditEventCount: 2,
    authorizationAuditManifestSha256: sha256(canonicalJson(manifest)),
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

function browserReadinessObservation(row) {
  const body = {
    status: "ready",
    transport: "authenticated_http_loopback",
    public: false,
    schemaVersion: "tenant_transport_health.v1"
  };
  const bodyText = JSON.stringify(body);
  const token = `${row.role}_${row.check}`;
  const requestedAt = new Date(
    Date.parse(row.capturedAt) + 10_000
  ).toISOString();
  const respondedAt = new Date(
    Date.parse(requestedAt) + 100
  ).toISOString();
  const requestId = `m1b_browser_readiness_${token}`;
  return {
    schemaVersion: "m1_b_browser_runtime_observation.v2",
    candidateReleaseId: CANDIDATE,
    role: row.role,
    check: row.check,
    databaseStartedAt: "2026-08-15T00:10:10.000Z",
    runtimeImageId: IMAGE,
    request: {
      method: "GET",
      url: new URL("tenant/v1/healthz", row.origin).toString(),
      requestId,
      credentials: "omit",
      cookieHeaderSent: false,
      authorizationHeaderSent: false,
      requestedAt
    },
    response: {
      status: 200,
      requestId,
      contentType: "application/json; charset=utf-8",
      cacheControl: "no-store",
      contentLength: Buffer.byteLength(bodyText),
      respondedAt,
      body,
      bodyText,
      bodySha256: sha256(bodyText),
      bodyProjectionHash: projectionHash(body)
    }
  };
}

const JPEG_Q80_LUMA = Object.freeze([
  6, 4, 5, 6, 5, 4, 6, 6, 5, 6, 7, 7, 6, 8, 10, 16,
  10, 10, 9, 9, 10, 20, 14, 15, 12, 16, 23, 20, 24, 24, 23, 20,
  22, 22, 26, 29, 37, 31, 26, 27, 35, 28, 22, 22, 32, 44, 32, 35,
  38, 39, 41, 42, 41, 25, 31, 45, 48, 45, 40, 48, 37, 40, 41, 40
]);
const JPEG_Q80_CHROMA = Object.freeze([
  7, 7, 7, 10, 8, 10, 19, 10, 10, 19, 40, 26, 22, 26, 40, 40,
  ...Array(48).fill(40)
]);
const JPEG_DC_COUNTS = Object.freeze([0, 0, 0, 12, ...Array(12).fill(0)]);
const JPEG_DC_SYMBOLS = Object.freeze(Array.from({ length: 12 }, (_, index) => index));
const JPEG_AC_COUNTS = Object.freeze([1, ...Array(15).fill(0)]);
const JPEG_AC_SYMBOLS = Object.freeze([0]);

function jpegSegment(marker, data) {
  const output = Buffer.alloc(data.length + 4);
  output[0] = 0xff;
  output[1] = marker;
  output.writeUInt16BE(data.length + 2, 2);
  data.copy(output, 4);
  return output;
}

function jpegDht(tableClass, tableId, counts, symbols) {
  return jpegSegment(0xc4, Buffer.from([
    tableClass * 16 + tableId,
    ...counts,
    ...symbols
  ]));
}

function canonicalCodes(counts, symbols) {
  const codes = new Map();
  let code = 0;
  let offset = 0;
  for (let length = 1; length <= 16; length += 1) {
    for (let index = 0; index < counts[length - 1]; index += 1) {
      codes.set(symbols[offset++], { code, length });
      code += 1;
    }
    code *= 2;
  }
  return codes;
}

function jpegBitWriter() {
  const bytes = [];
  let current = 0;
  let count = 0;
  return {
    write(value, length) {
      for (let bit = length - 1; bit >= 0; bit -= 1) {
        current = current * 2 + ((value >>> bit) & 1);
        count += 1;
        if (count === 8) {
          bytes.push(current);
          if (current === 0xff) bytes.push(0x00);
          current = 0;
          count = 0;
        }
      }
    },
    finish() {
      if (count > 0) this.write((1 << (8 - count)) - 1, 8 - count);
      return Buffer.from(bytes);
    }
  };
}

function jpegValueBits(value) {
  if (value === 0) return { category: 0, encoded: 0 };
  const category = Math.floor(Math.log2(Math.abs(value))) + 1;
  return {
    category,
    encoded: value > 0 ? value : value + (2 ** category - 1)
  };
}

function browserJpeg(
  width,
  height,
  challengeHash = null,
  devicePixelRatio = 1
) {
  const specification = M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE;
  const challengeBits = challengeHash === null
    ? null
    : createM1BOperationalBrowserPixelChallengeBits(challengeHash);
  const dcCodes = canonicalCodes(JPEG_DC_COUNTS, JPEG_DC_SYMBOLS);
  const acCodes = canonicalCodes(JPEG_AC_COUNTS, JPEG_AC_SYMBOLS);
  const writer = jpegBitWriter();
  const predictors = new Map([[1, 0], [2, 0], [3, 0]]);
  const markerOffsetX = specification.offsetX * devicePixelRatio;
  const markerOffsetY = specification.offsetY * devicePixelRatio;
  const markerCellSize = specification.cellSize * devicePixelRatio;
  function lumaDc(blockX, blockY) {
    if (challengeBits === null) return 0;
    const column = Math.floor((blockX * 8 - markerOffsetX) / markerCellSize);
    const row = Math.floor((blockY * 8 - markerOffsetY) / markerCellSize);
    if (
      column < 0 || column >= specification.columns ||
      row < 0 || row >= specification.rows
    ) return -171;
    return challengeBits[row * specification.columns + column] === 1 ? -171 : 169;
  }
  function block(componentId, dc) {
    const difference = dc - predictors.get(componentId);
    predictors.set(componentId, dc);
    const value = jpegValueBits(difference);
    const dcCode = dcCodes.get(value.category);
    writer.write(dcCode.code, dcCode.length);
    writer.write(value.encoded, value.category);
    const eob = acCodes.get(0);
    writer.write(eob.code, eob.length);
  }
  for (let mcuY = 0; mcuY < Math.ceil(height / 16); mcuY += 1) {
    for (let mcuX = 0; mcuX < Math.ceil(width / 16); mcuX += 1) {
      for (let vertical = 0; vertical < 2; vertical += 1) {
        for (let horizontal = 0; horizontal < 2; horizontal += 1) {
          block(1, lumaDc(mcuX * 2 + horizontal, mcuY * 2 + vertical));
        }
      }
      block(2, 0);
      block(3, 0);
    }
  }
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.from([
      0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0
    ])),
    jpegSegment(0xdb, Buffer.from([0, ...JPEG_Q80_LUMA])),
    jpegSegment(0xdb, Buffer.from([1, ...JPEG_Q80_CHROMA])),
    jpegSegment(0xc0, Buffer.from([
      8, height >>> 8, height & 0xff, width >>> 8, width & 0xff, 3,
      1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1
    ])),
    jpegDht(0, 0, JPEG_DC_COUNTS, JPEG_DC_SYMBOLS),
    jpegDht(1, 0, JPEG_AC_COUNTS, JPEG_AC_SYMBOLS),
    jpegDht(0, 1, JPEG_DC_COUNTS, JPEG_DC_SYMBOLS),
    jpegDht(1, 1, JPEG_AC_COUNTS, JPEG_AC_SYMBOLS),
    jpegSegment(0xda, Buffer.from([
      3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0
    ])),
    writer.finish(),
    Buffer.from([0xff, 0xd9])
  ]);
}

function browserPhaseToken(phase) {
  return {
    authenticated: "auth",
    signed_out: "signedout",
    before_sign_out: "before"
  }[phase];
}

function browserSupportArtifact(id, kind) {
  return safeArtifact({
    id,
    kind,
    relativePath: `support/${id}.json`,
    sha256: sha256(`support:${id}`)
  });
}

async function createBrowserFilesystemFixture() {
  const rootPath = await mkdtemp(resolve(tmpdir(), "ipo-one-browser-corpus-"));
  const root = await realpath(rootPath);
  const databaseStartedAt = "2026-08-15T00:10:10.000Z";
  const outputRootRelativePath = "output/playwright/m1-b-files-fixture";
  let clockTick = 0;
  const collection = await collectM1BOperationalBrowserMeasurements({
    candidateReleaseId: CANDIDATE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt,
    portBase: 18_887,
    outputRoot: resolve(REPOSITORY_ROOT, outputRootRelativePath),
    clock: () => new Date(
      Date.parse(databaseStartedAt) + (++clockTick * 1_000)
    ).toISOString(),
    exchange: async (prompt) => JSON.stringify(measuredBrowserResponse(prompt)),
    reconcileAuthenticatedRead: async (context) => browserAppRoleRead(context)
  });
  const artifacts = [
    browserSupportArtifact("release_identity", "release_identity"),
    browserSupportArtifact("operational_restart", "restart_log"),
    browserSupportArtifact("human_critical", "postgres_receipt"),
    browserSupportArtifact("agent_after", "runtime_receipt"),
    browserSupportArtifact("capital_partner_critical", "postgres_receipt")
  ];
  for (const [group, id] of [
    ["human", "expired_offer"],
    ["agent", "revoked_mandate"],
    ["authorization", "cross_role_private_read"]
  ]) {
    artifacts.push(browserSupportArtifact(
      `negative_${group}_${id}`,
      "negative_receipt"
    ));
  }
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const files = new Map();
  const screenshots = [];
  const criticalByRole = {
    human: artifactById.get("human_critical"),
    principal_agent: artifactById.get("agent_after"),
    capital_partner: artifactById.get("capital_partner_critical")
  };
  for (const row of collection.browserRows) {
    const visualArtifacts = [];
    for (const { prompt, response } of row.phaseEvidence) {
      const viewport = response.measurement.viewport;
      const bytes = browserJpeg(
        viewport.innerWidth * viewport.devicePixelRatio,
        viewport.innerHeight * viewport.devicePixelRatio,
        prompt.capture.challengeHash,
        viewport.devicePixelRatio
      );
      const artifact = safeArtifact({
        id: `browser_${row.role}_${row.check}_${browserPhaseToken(prompt.phase)}_shot`,
        kind: "screenshot",
        relativePath:
          `${outputRootRelativePath}/${CANDIDATE}.browser.${row.role}.` +
          `${row.check}.${prompt.phase}.jpg`,
        sha256: sha256(bytes)
      });
      await writePrivate(resolve(root, artifact.relativePath), bytes);
      artifacts.push(artifact);
      artifactById.set(artifact.id, artifact);
      screenshots.push({
        artifact,
        bytes,
        viewport,
        challengeHash: prompt.capture.challengeHash
      });
      visualArtifacts.push({
        phase: prompt.phase,
        id: artifact.id,
        kind: artifact.kind,
        relativePath: artifact.relativePath,
        sha256: artifact.sha256,
        mediaType: prompt.capture.mediaType,
        codecProfile: prompt.capture.codecProfile,
        challengeHash: prompt.capture.challengeHash,
        jpeg: {
          width: viewport.innerWidth * viewport.devicePixelRatio,
          height: viewport.innerHeight * viewport.devicePixelRatio,
          jfifVersion: "1.01",
          iccProfileSegmentCount: 0,
          iccProfileBytes: 0,
          quality: 80,
          subsampling: "4:2:0",
          mcuCount:
            Math.ceil(viewport.innerWidth * viewport.devicePixelRatio / 16) *
            Math.ceil(viewport.innerHeight * viewport.devicePixelRatio / 16),
          decodedChallengeHash: prompt.capture.challengeHash
        }
      });
    }
    const negativeCaseArtifact = row.negativeCase === null
      ? null
      : (() => {
          const definition = getM1BOperationalNegativeCaseDefinition(
            row.negativeCase.group,
            row.negativeCase.id
          );
          const artifact = artifactById.get(
            `negative_${row.negativeCase.group}_${row.negativeCase.id}`
          );
          return {
            id: artifact.id,
            kind: artifact.kind,
            sha256: artifact.sha256,
            caseDefinitionHash: definition.caseDefinitionHash
          };
        })();
    const documents = createM1BOperationalBrowserRowDocuments({
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      databaseStartedAt,
      row,
      releaseIdentityArtifact: {
        id: "release_identity",
        sha256: artifactById.get("release_identity").sha256
      },
      criticalArtifact: {
        id: criticalByRole[row.role].id,
        kind: criticalByRole[row.role].kind,
        sha256: criticalByRole[row.role].sha256
      },
      restartArtifact: row.check === "restart_recovery"
        ? {
            id: "operational_restart",
            sha256: artifactById.get("operational_restart").sha256
          }
        : null,
      negativeCaseArtifact,
      visualArtifacts,
      readinessObservation: browserReadinessObservation(row),
      outputRootRelativePath
    });
    for (const [artifact, document] of [
      [documents.runtimeArtifact, documents.runtimeDocument],
      [documents.auditArtifact, documents.auditDocument]
    ]) {
      const safe = safeArtifact(artifact);
      const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
      assert.equal(sha256(bytes), safe.sha256);
      await writePrivate(resolve(root, safe.relativePath), bytes);
      artifacts.push(safe);
      artifactById.set(safe.id, safe);
      files.set(safe.id, { document });
    }
  }
  assert.equal(collection.browserRows.length, 24);
  assert.equal(screenshots.length, 33);
  assert.equal(new Set(screenshots.map(({ artifact }) => artifact.sha256)).size, 33);
  const evidence = {
    schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v2",
    source: { commitSha: CANDIDATE, treeSha: TREE },
    artifacts
  };
  return {
    root,
    rootPath,
    evidence,
    artifactById,
    files,
    screenshots,
    context: {
      evidenceRoot: root,
      expectedCommitSha: CANDIDATE,
      expectedRuntimeImageId: IMAGE,
      corpus: {
        root,
        databaseStartedAt,
        preRiskReceipt: {
          startedAt: databaseStartedAt,
          completedAt: "2026-08-15T00:20:00.000Z"
        },
        files
      }
    }
  };
}

async function mutateBrowserJsonArtifact(fixture, id, mutate) {
  const artifact = fixture.artifactById.get(id);
  const originalSha256 = artifact.sha256;
  const originalEntry = fixture.files.get(id);
  const originalBytes = Buffer.from(
    `${JSON.stringify(originalEntry.document, null, 2)}\n`
  );
  const document = structuredClone(originalEntry.document);
  mutate(document);
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
  artifact.sha256 = sha256(bytes);
  fixture.files.set(id, { document });
  await writeFile(resolve(fixture.root, artifact.relativePath), bytes);
  return async () => {
    artifact.sha256 = originalSha256;
    fixture.files.set(id, originalEntry);
    await writeFile(resolve(fixture.root, artifact.relativePath), originalBytes);
  };
}

async function assertBrowserFixtureRejected(fixture, issue) {
  await assert.rejects(
    verifyM1BOperationalBrowserArtifacts(
      fixture.evidence,
      fixture.context
    ),
    (error) => error instanceof M1BAcceptanceEvidenceError &&
      error.issues.some((value) => value.includes(issue))
  );
}

function jsonBytes(document) {
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
}

function artifactLink(artifact) {
  return { id: artifact.id, sha256: artifact.sha256 };
}

function artifactReference(artifact) {
  return {
    id: artifact.id,
    kind: artifact.kind,
    relativePath: artifact.relativePath,
    sha256: artifact.sha256
  };
}

function atOffset(value, milliseconds) {
  return new Date(Date.parse(value) + milliseconds).toISOString();
}

async function addJsonFixtureArtifact(fixture, id, kind, document) {
  const bytes = jsonBytes(document);
  const artifact = {
    id,
    kind,
    relativePath: `${id}.json`,
    sha256: sha256(bytes)
  };
  await writePrivate(resolve(fixture.root, artifact.relativePath), bytes);
  fixture.evidence.artifacts.push(safeArtifact(artifact));
  fixture.artifactById.set(id, fixture.evidence.artifacts.at(-1));
  fixture.files.set(id, { document });
  return fixture.evidence.artifacts.at(-1);
}

async function addBytesFixtureArtifact(
  fixture,
  id,
  kind,
  relativePath,
  bytes
) {
  const artifact = { id, kind, relativePath, sha256: sha256(bytes) };
  await writePrivate(resolve(fixture.root, relativePath), bytes);
  fixture.evidence.artifacts.push(safeArtifact(artifact));
  fixture.artifactById.set(id, fixture.evidence.artifacts.at(-1));
  return fixture.evidence.artifacts.at(-1);
}

async function mutateFixtureJsonArtifact(fixture, id, mutate) {
  const artifact = fixture.artifactById.get(id);
  const originalSha256 = artifact.sha256;
  const originalEntry = fixture.files.get(id);
  const originalBytes = jsonBytes(originalEntry.document);
  const document = structuredClone(originalEntry.document);
  mutate(document);
  const bytes = jsonBytes(document);
  artifact.sha256 = sha256(bytes);
  fixture.files.set(id, { document });
  await writeFile(resolve(fixture.root, artifact.relativePath), bytes);
  return async () => {
    artifact.sha256 = originalSha256;
    fixture.files.set(id, originalEntry);
    await writeFile(resolve(fixture.root, artifact.relativePath), originalBytes);
  };
}

function liveProblem(requestId) {
  return {
    status: 404,
    code: "authorization_denied",
    requestId,
    schemaVersion: "problem_details.v1"
  };
}

function jsonProjectionHash(value) {
  return `0x${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")}`;
}

function deniedOfferRequest(attempt, {
  offerHash,
  termsHash,
  disclosureRef,
  requestedAt
}) {
  const confirmationHash = `0x${sha256(`${attempt.requestId}:confirmation`)}`;
  const messageHash = `0x${sha256(`${attempt.requestId}:message`)}`;
  const actionConfirmation = {
    actionType: "accept_offer",
    resourceId: attempt.resourceId,
    resourceHash: offerHash,
    payloadHash: jsonProjectionHash({
      expectedOfferHash: offerHash,
      expectedTermsHash: termsHash,
      disclosureRef,
      sandboxOnly: true,
      productionFundsAuthority: false
    }),
    requestId: attempt.requestId,
    requestNonce: `human_action_confirmation_${attempt.requestId.slice(-36)}`,
    requestedAt,
    confirmedAt: atOffset(requestedAt, 250),
    expiresAt: atOffset(requestedAt, 300_000),
    confirmationMethod: "wallet_personal_sign",
    confirmationHash,
    messageHash,
    rawSignaturePersisted: false,
    blockchainTransactionSubmitted: false,
    schemaVersion: "economic_action_confirmation_result.v1"
  };
  return {
    operationId: attempt.operationId,
    resource: {
      resourceType: attempt.resourceType,
      resourceId: attempt.resourceId
    },
    payload: {
      expectedOfferHash: offerHash,
      expectedTermsHash: termsHash,
      acknowledgementHash: jsonProjectionHash({
        acknowledgementVersion: "human_credit_offer_acknowledgement.v1",
        creditOfferHash: offerHash,
        termsHash,
        disclosureRef,
        actionConfirmationMethod: actionConfirmation.confirmationMethod,
        actionConfirmationHash: confirmationHash,
        actionConfirmationMessageHash: messageHash,
        sandboxOnly: true,
        productionFundsAuthority: false
      }),
      actionConfirmation
    },
    requestId: attempt.requestId,
    correlationId: attempt.correlationId,
    idempotencyKey: attempt.idempotencyKey,
    schemaVersion: "tenant_protocol_request.v1"
  };
}

function deniedQueryRequest(attempt) {
  return {
    operationId: attempt.operationId,
    resource: {
      resourceType: attempt.resourceType,
      resourceId: attempt.resourceId
    },
    payload: {},
    requestId: attempt.requestId,
    correlationId: attempt.correlationId,
    schemaVersion: "tenant_protocol_request.v1"
  };
}

async function createLiveNegativePair({
  definition,
  databaseStartedAt,
  capturedAt,
  supportingArtifacts,
  resourceId,
  offerHash = null,
  termsHash = null,
  disclosureRef = null,
  stateHashDigit
}) {
  const offerCommand = definition.operationId === "pilotAcceptCreditOffer";
  const attempt = createM1BOperationalLiveAttempt({
    tenantId: "tenant_ipo_one_local_pilot",
    actorId: offerCommand
      ? "actor_human_borrower_pilot"
      : "actor_capital_partner_pilot",
    clientId: offerCommand
      ? "client_human_invited_siwe"
      : "client_capital_partner_invited_siwe",
    group: definition.group,
    id: definition.id,
    operationId: definition.operationId,
    resourceType: offerCommand ? "credit_offer" : "obligation",
    resourceId,
    command: offerCommand
  });
  const baselineCapturedAt = atOffset(capturedAt, -3_000);
  const auditOccurredAt = atOffset(capturedAt, -2_000);
  const outwardCapturedAt = atOffset(capturedAt, -1_000);
  const stateHash = `0x${stateHashDigit.repeat(64)}`;
  const protectedState = offerCommand
    ? {
        manifest: {
          catalogVersion: "m1_b_operational_offer_protected_state.v2",
          offer: {
            creditOfferRefHash: hashId(
              "m1_b_operational_credit_offer_reference",
              { value: resourceId }
            ),
            offerHash,
            termsHash,
            disclosureRef,
            status: "offered",
            validUntil: definition.id === "expired_offer"
              ? atOffset(baselineCapturedAt, -1_000)
              : atOffset(baselineCapturedAt, 86_400_000)
          },
          related: Object.fromEntries([
            "acceptance",
            "obligations",
            "executions",
            "repayments",
            "ledgerTransactions"
          ].map((key) => [key, { rowCount: 0, manifestHash: stateHash }]))
        },
        manifestHash: stateHash
      }
    : {
        manifest: {
          catalogVersion:
            "m1_b_operational_obligation_protected_state.v2",
          obligationRefHash: hashId(
            "m1_b_operational_obligation_reference",
            { value: resourceId }
          )
        },
        manifestHash: stateHash
      };
  const zeroEffects = {
    repositoryIdempotencyKeyHash: offerCommand
      ? deriveM1BOperationalRepositoryIdempotencyKey(attempt)
      : null,
    commandIdempotencyCount: 0,
    commandEventCount: 0,
    executionCount: 0,
    businessEventCount: 0
  };
  const databaseTimes = [baselineCapturedAt, capturedAt];
  const read = (operation) => operation({
    async query() {
      return {
        rowCount: 1,
        rows: [{ captured_at: databaseTimes.shift() }]
      };
    }
  });
  const capture = await captureM1BOperationalLiveDenialBoundaryForTest({
    caseDefinition: definition,
    attempt,
    databaseStartedAt,
    readTarget: read,
    readAttempt: read,
    performDenial: async () => {
      const requestProjection = offerCommand
        ? deniedOfferRequest(attempt, {
            offerHash,
            termsHash,
            disclosureRef,
            requestedAt: atOffset(baselineCapturedAt, 100)
          })
        : deniedQueryRequest(attempt);
      const responseProjection = liveProblem(attempt.requestId);
      return {
        capturedAt: outwardCapturedAt,
        requestProjection,
        requestProjectionHash:
          hashM1BAcceptanceManifest(requestProjection),
        responseProjection,
        responseHash: hashM1BAcceptanceManifest(responseProjection)
      };
    }
  }, {
    readOfferState: async () => protectedState,
    readObligationState: async () => protectedState,
    readEffects: async () => zeroEffects,
    readAudit: async () => ({
      eventId: `audit_${definition.group}_${definition.id}_${attempt.requestId.slice(-8)}`,
      requestId: attempt.requestId,
      correlationId: attempt.correlationId,
      operationId: definition.operationId,
      authorizationDecision: "deny",
      occurredAt: auditOccurredAt,
      reasonCode: {
        expired_offer: "live_policy_rejected",
        unauthorized_subject: "resource_access_denied",
        cross_role_private_read: "actor_capability_rejected"
      }[definition.id]
    })
  });
  const observation = Object.fromEntries(Object.entries(capture.observation)
    .filter(([key]) => !new Set([
      "fixtureUsed",
      "productionEvidenceEligible"
    ]).has(key)));
  const proof = {
    proofKind: "runtime_observation",
    group: definition.group,
    id: definition.id,
    sourceMode: definition.sourceMode,
    caseDefinitionHash: definition.caseDefinitionHash,
    candidateReleaseId: CANDIDATE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    capturedAt: observation.capturedAt,
    requestId: observation.requestId,
    correlationId: observation.correlationId,
    outwardStatus: observation.outwardStatus,
    outwardCode: observation.outwardCode,
    outwardResponseHash:
      hashM1BAcceptanceManifest(observation.outwardBody),
    authorizationAuditEventId: observation.authorizationAudit.eventId,
    authorizationDecision:
      observation.authorizationAudit.authorizationDecision,
    authorizationReasonCode: observation.authorizationAudit.reasonCode,
    protectedStateBeforeHash: observation.protectedStateBeforeHash,
    protectedStateAfterHash: observation.protectedStateAfterHash,
    databaseProof: observation.databaseProof,
    additionalEffectCount: 0,
    nonEnumerating: true,
    duplicateSemantics: null,
    regressionAssertions: null,
    sourceEvidence: {
      operationId: definition.operationId,
      subtestName: definition.subtestName,
      supportingArtifacts,
      testCommand: definition.testCommand,
      tapSha256: null,
      exitCode: null,
      tapParser: null,
      sourceFiles: []
    },
    producerVerified: true
  };
  const attemptEvidence = Object.fromEntries(Object.entries(
    capture.attemptEvidence
  ).filter(([key]) => !new Set([
    "fixtureUsed",
    "productionEvidenceEligible"
  ]).has(key)));
  return {
    proof,
    attemptReceipt: {
      schemaVersion: "m1_b_operational_live_attempt_receipt.v2",
      fixtureUsed: false,
      productionEvidenceEligible: true,
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      group: definition.group,
      id: definition.id,
      databaseStartedAt,
      capturedAt: proof.capturedAt,
      supportingArtifacts,
      ...attemptEvidence,
      negativeProofHash: hashM1BAcceptanceManifest(proof)
    }
  };
}

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

function negativeProtectedStateManifest() {
  return Object.fromEntries(NEGATIVE_PROTECTED_TABLES.map((table, index) => [
    table,
    {
      rowCount: index + 1,
      manifestHash: `0x${(index + 1).toString(16).padStart(64, "0")}`
    }
  ]));
}

async function createSyntheticExactNegativeCases(definitions) {
  return Promise.all(definitions.map(async (definition, index) => {
    const transport = definition.sourceMode === "exact_source_transport";
    const disposable =
      definition.sourceMode === "exact_source_disposable_postgres";
    const duplicate = definition.group === "human" &&
      definition.id === "duplicate_acceptance";
    const state = disposable ? negativeProtectedStateManifest() : null;
    const stateHash = disposable ? projectionHash(state) : null;
    const auditEvents = disposable && !duplicate
      ? [{
          eventId: `audit_exact_negative_${String(index + 1).padStart(2, "0")}`,
          decision: "deny"
        }]
      : [];
    const outwardStatus = transport ? 401 : disposable
      ? duplicate ? 200 : 404
      : null;
    const outwardCode = transport
      ? "authentication_required"
      : disposable
        ? duplicate ? "idempotent_replay" : "authorization_denied"
        : null;
    const tapBytes = Buffer.from(
      `TAP version 13\n# producer-shaped exact case ${index + 1}\n`
    );
    const tapSha256 = sha256(tapBytes);
    const sourceFiles = await Promise.all(definition.sourcePaths.map(
      async (path) => ({
        path,
        sha256: sha256(await readFile(resolve(REPOSITORY_ROOT, path)))
      })
    ));
    const authorizationDecision = transport
      ? "transport_rejected"
      : duplicate
        ? "idempotent_replay"
        : disposable
          ? "deny"
          : "ui_preflight_rejected";
    const outwardResponseHash = outwardStatus === null
      ? null
      : `0x${"c".repeat(64)}`;
    const databaseReadback = disposable
      ? {
          schemaVersion: "m1_b_negative_database_readback.v2",
          outwardResponseHash,
          authorizationAuditRows: auditEvents.length,
          authorizationAuditEvents: auditEvents,
          authorizationAuditSetHash: projectionHash(auditEvents),
          protectedStateBefore: state,
          protectedStateAfter: structuredClone(state),
          protectedStateBeforeHash: stateHash,
          protectedStateAfterHash: stateHash
        }
      : null;
    const proof = {
      proofKind: transport
        ? "runtime_observation"
        : disposable
          ? "exact_source_postgres_observation"
          : "exact_source_regression_assertion",
      group: definition.group,
      id: definition.id,
      sourceMode: definition.sourceMode,
      caseDefinitionHash: definition.caseDefinitionHash,
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      capturedAt:
        `2026-08-15T01:00:${String(index + 1).padStart(2, "0")}.000Z`,
      requestId: `request_exact_negative_${String(index + 1).padStart(2, "0")}`,
      correlationId:
        `correlation_exact_negative_${String(index + 1).padStart(2, "0")}`,
      outwardStatus,
      outwardCode,
      outwardResponseHash,
      authorizationAuditEventId: authorizationDecision === "deny"
        ? auditEvents[0].eventId
        : null,
      authorizationDecision,
      authorizationReasonCode: outwardCode ?? "ui_preflight_rejected",
      protectedStateBeforeHash: stateHash,
      protectedStateAfterHash: stateHash,
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
      regressionAssertions: transport
        ? null
        : {
            schemaVersion: "m1_b_negative_regression_assertions.v2",
            assertedOutwardStatus: duplicate ? 200 : 404,
            assertedOutwardCode: duplicate
              ? "idempotent_replay"
              : "authorization_denied",
            protectedStateEqualityAsserted: true,
            additionalEffectCountAsserted: 0,
            responseBytesCaptured: false,
            databaseSnapshotHashesCaptured: disposable,
            actualDatabaseReadback: disposable,
            databaseReadback,
            sourceAssertionHash: `0x${"e".repeat(64)}`,
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
    };
    return { definition, proof, tapBytes, tapSha256 };
  }));
}

async function createNegativeFilesystemFixture() {
  const rootPath = await mkdtemp(resolve(tmpdir(), "ipo-one-negative-corpus-"));
  const root = await realpath(rootPath);
  const fixture = {
    root,
    rootPath,
    evidence: {
      schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v2",
      source: { commitSha: CANDIDATE, treeSha: TREE },
      artifacts: []
    },
    artifactById: new Map(),
    files: new Map()
  };
  const exactDefinitions = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    ({ sourceMode }) => sourceMode !== "live_post_restart"
  );
  const exactCases = await createSyntheticExactNegativeCases(
    exactDefinitions
  );
  const exactProofs = exactCases.map(({ proof }) => proof);
  const earliestProofAt = new Date(Math.min(...exactProofs.map(
    ({ capturedAt }) => Date.parse(capturedAt)
  ))).toISOString();
  const latestProofAt = new Date(Math.max(...exactProofs.map(
    ({ capturedAt }) => Date.parse(capturedAt)
  ))).toISOString();
  const databaseStartedAt = atOffset(earliestProofAt, -3_600_000);
  const criticalCapturedAt = atOffset(earliestProofAt, -1_800_000);
  const negativeStartedAt = atOffset(latestProofAt, 30_000);
  const negativeCompletedAt = atOffset(latestProofAt, 60_000);
  const preRiskStartedAt = atOffset(latestProofAt, 120_000);
  const preRiskCompletedAt = atOffset(latestProofAt, 180_000);

  await addJsonFixtureArtifact(
    fixture,
    "operational_restart",
    "restart_log",
    { capturedAt: atOffset(criticalCapturedAt, -60_000) }
  );
  await addJsonFixtureArtifact(
    fixture,
    "agent_after",
    "runtime_receipt",
    { capturedAt: atOffset(criticalCapturedAt, -30_000) }
  );
  await addJsonFixtureArtifact(
    fixture,
    "agent_after_phase",
    "runtime_receipt",
    { completedAt: atOffset(criticalCapturedAt, -20_000) }
  );
  const humanCritical = {
    capturedAt: atOffset(criticalCapturedAt, -10_000),
    linkage: { obligationId: "obligation_human_critical" }
  };
  const humanArtifact = await addJsonFixtureArtifact(
    fixture,
    "human_critical",
    "postgres_receipt",
    humanCritical
  );
  const staleCapturedAt = atOffset(criticalCapturedAt, -2_000);
  const staleStateHash = `0x${"d".repeat(64)}`;
  const staleRequestId = "request_m1b_replaced_offer_fixture_0001";
  const staleCorrelationId = "correlation_m1b_replaced_offer_fixture_0001";
  const capitalPartnerCritical = {
    schemaVersion: "m1_b_capital_partner_critical_receipt.v1",
    candidateReleaseId: CANDIDATE,
    databaseStartedAt,
    capturedAt: criticalCapturedAt,
    currentLineage: {
      staleOfferDenial: {
        verificationCapturedAt: staleCapturedAt,
        requestId: staleRequestId,
        correlationId: staleCorrelationId,
        outwardResponse: {
          responseProjection: {
            status: 403,
            code: "authorization_denied",
            requestId: staleRequestId,
            schemaVersion: "problem_details.v1"
          }
        },
        authorizationAudit: {
          eventId: "audit_m1b_replaced_offer_fixture_0001",
          operationId: "pilotAcceptCreditOffer",
          requestId: staleRequestId,
          correlationId: staleCorrelationId,
          authorizationDecision: "deny",
          reasonCode: "credit_offer_state",
          occurredAt: atOffset(staleCapturedAt, -500)
        },
        protectedStateCatalogVersion: "m1_b_cp_denial_protected_state.v1",
        protectedStateBeforeHash: staleStateHash,
        protectedStateAfterHash: staleStateHash,
        businessMutationCount: 0
      }
    }
  };
  const capitalPartnerArtifact = await addJsonFixtureArtifact(
    fixture,
    "capital_partner_critical",
    "postgres_receipt",
    capitalPartnerCritical
  );

  for (const { definition, proof, tapBytes } of exactCases) {
    await addJsonFixtureArtifact(
      fixture,
      `negative_source_proof_${definition.group}_${definition.id}`,
      "negative_source_proof",
      proof
    );
    await addBytesFixtureArtifact(
      fixture,
      `negative_tap_${definition.group}_${definition.id}`,
      "tap_log",
      `negative_tap_${definition.group}_${definition.id}.tap`,
      tapBytes
    );
  }
  await addJsonFixtureArtifact(
    fixture,
    "operational_negative_exact_source_execution",
    "runtime_receipt",
    {
      schemaVersion: "m1_b_negative_exact_source_execution_manifest.v2",
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      capturedAt: latestProofAt
    }
  );
  const negativeRun = {
    proofs: exactProofs,
    startedAt: negativeStartedAt,
    completedAt: negativeCompletedAt
  };

  const expiredOfferSetup = {
    capturedAt: atOffset(criticalCapturedAt, 30_000),
    offer: {
      creditOfferId: "credit_offer_expired_fixture",
      creditOfferHash: `0x${"4".repeat(64)}`,
      termsHash: `0x${"5".repeat(64)}`,
      validUntil: atOffset(criticalCapturedAt, 20_000)
    },
    expiration: {
      protectedStateAfterHash: `0x${"6".repeat(64)}`
    }
  };
  const expiredArtifact = await addJsonFixtureArtifact(
    fixture,
    "expired_offer_setup",
    "postgres_receipt",
    expiredOfferSetup
  );
  const foreignOfferSetup = {
    references: { creditOfferId: "credit_offer_foreign_fixture" },
    offer: {
      creditOfferHash: `0x${"8".repeat(64)}`,
      termsHash: `0x${"9".repeat(64)}`,
      disclosureRef: "urn:ipo.one:disclosure:agent-foreign:v1",
      validUntil: atOffset(preRiskStartedAt, 86_400_000)
    }
  };
  const foreignArtifact = await addJsonFixtureArtifact(
    fixture,
    "agent_foreign_offer_setup",
    "postgres_receipt",
    foreignOfferSetup
  );
  const liveDefinitions = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    ({ sourceMode, id }) =>
      sourceMode === "live_post_restart" && id !== "replaced_stale_offer"
  );
  const liveInputs = {
    "human:expired_offer": {
      supportingArtifacts: [humanArtifact, expiredArtifact].map(artifactLink),
      resourceId: expiredOfferSetup.offer.creditOfferId,
      offerHash: expiredOfferSetup.offer.creditOfferHash,
      termsHash: expiredOfferSetup.offer.termsHash,
      disclosureRef: "urn:ipo.one:disclosure:expired-fixture:v1",
      stateHashDigit: "6"
    },
    "human:unauthorized_subject": {
      supportingArtifacts: [humanArtifact, foreignArtifact].map(artifactLink),
      resourceId: foreignOfferSetup.references.creditOfferId,
      offerHash: foreignOfferSetup.offer.creditOfferHash,
      termsHash: foreignOfferSetup.offer.termsHash,
      disclosureRef: foreignOfferSetup.offer.disclosureRef,
      stateHashDigit: "7"
    },
    "authorization:cross_role_private_read": {
      supportingArtifacts: [capitalPartnerArtifact, humanArtifact]
        .map(artifactLink),
      resourceId: humanCritical.linkage.obligationId,
      stateHashDigit: "a"
    }
  };
  const liveProofs = [];
  const liveAttemptArtifacts = new Map();
  for (const [index, definition] of liveDefinitions.entries()) {
    const key = `${definition.group}:${definition.id}`;
    const pair = await createLiveNegativePair({
      definition,
      databaseStartedAt,
      capturedAt: atOffset(criticalCapturedAt, 120_000 + index * 10_000),
      ...liveInputs[key]
    });
    const attemptArtifact = await addJsonFixtureArtifact(
      fixture,
      `negative_live_attempt_${definition.group}_${definition.id}`,
      "negative_receipt",
      pair.attemptReceipt
    );
    await addJsonFixtureArtifact(
      fixture,
      `negative_live_source_proof_${definition.group}_${definition.id}`,
      "negative_source_proof",
      pair.proof
    );
    liveProofs.push(pair.proof);
    liveAttemptArtifacts.set(key, attemptArtifact);
  }

  const staleProof = deriveM1BReplacedStaleOfferNegativeProofFromCritical({
    criticalDocument: capitalPartnerCritical,
    criticalArtifact: artifactLink(capitalPartnerArtifact),
    candidateReleaseId: CANDIDATE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt
  });
  const proofByKey = new Map([
    ...negativeRun.proofs,
    ...liveProofs,
    staleProof
  ].map((proof) => [`${proof.group}:${proof.id}`, proof]));
  const executionArtifact = fixture.artifactById.get(
    "operational_negative_exact_source_execution"
  );
  const caseReceipts = [];
  for (const definition of M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS) {
    const key = `${definition.group}:${definition.id}`;
    const proof = proofByKey.get(key);
    const live = definition.sourceMode === "live_post_restart";
    const replaced = live && definition.id === "replaced_stale_offer";
    const sourceProofArtifact = replaced
      ? capitalPartnerArtifact
      : fixture.artifactById.get(
          live
            ? `negative_live_source_proof_${definition.group}_${definition.id}`
            : `negative_source_proof_${definition.group}_${definition.id}`
        );
    const receipt = createM1BOperationalNegativeCaseReceipt({
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      databaseStartedAt,
      proof,
      sourceProofArtifact: artifactLink(sourceProofArtifact),
      liveAttemptArtifact: live && !replaced
        ? artifactLink(liveAttemptArtifacts.get(key))
        : null,
      exactSourceExecutionArtifact: live
        ? null
        : artifactLink(executionArtifact),
      tapArtifact: live
        ? null
        : artifactLink(fixture.artifactById.get(
            `negative_tap_${definition.group}_${definition.id}`
          ))
    });
    const finalArtifact = await addJsonFixtureArtifact(
      fixture,
      `negative_${definition.group}_${definition.id}`,
      "negative_receipt",
      receipt
    );
    caseReceipts.push({
      receipt,
      artifact: artifactReference(finalArtifact)
    });
  }
  const releaseArtifact = await addJsonFixtureArtifact(
    fixture,
    "release_identity",
    "release_identity",
    { candidateReleaseId: CANDIDATE }
  );
  const manifest = createM1BOperationalNegativeCaseManifest({
    candidateReleaseId: CANDIDATE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt,
    releaseIdentityArtifact: artifactLink(releaseArtifact),
    exactSourceExecutionArtifact: artifactLink(executionArtifact),
    caseReceipts
  });
  await addJsonFixtureArtifact(
    fixture,
    "operational_negative_cases",
    "negative_receipt",
    manifest
  );
  fixture.context = {
    evidenceRoot: root,
    expectedCommitSha: CANDIDATE,
    corpus: {
      root,
      runtimeImageId: IMAGE,
      databaseStartedAt,
      preRiskReceipt: {
        startedAt: preRiskStartedAt,
        completedAt: preRiskCompletedAt
      },
      files: fixture.files
    },
    negativeRun,
    foreignOfferSetup,
    expiredOfferSetup
  };
  return fixture;
}

function journeyRestart() {
  const service = (name, beforeStartedAt, afterStartedAt, imageId = IMAGE) => ({
    service: name,
    before: {
      containerId: ({ postgres: "1", pilot: "2", worker: "3" }[name]).repeat(64),
      imageId,
      startedAt: beforeStartedAt,
      configHash: `0x${"4".repeat(64)}`
    },
    after: {
      containerId: ({ postgres: "1", pilot: "2", worker: "3" }[name]).repeat(64),
      imageId,
      startedAt: afterStartedAt,
      configHash: `0x${"4".repeat(64)}`
    },
    events: {
      start: 1,
      stop: 1,
      kill: 0,
      die: 1,
      restart: 0,
      create: 0,
      destroy: 0
    }
  });
  return {
    capturedAt: "2026-08-15T00:10:30.000Z",
    beforeDatabaseStartedAt: "2026-08-15T00:00:15.000Z",
    afterDatabaseStartedAt: "2026-08-15T00:10:10.000Z",
    eventWindow: {
      engineBeforeAt: "2026-08-15T00:06:00.000Z",
      engineAfterAt: "2026-08-15T00:10:30.000Z"
    },
    engine: {
      engineIdHash: `0x${"5".repeat(64)}`,
      serverVersion: "28.3.3",
      securityOptionsHash: `0x${"6".repeat(64)}`,
      rootless: true
    },
    volume: {
      name: "ipo-one-local-postgres-data",
      driver: "local",
      createdAt: "2026-08-14T00:00:00.000Z",
      scope: "local",
      labelsHash: `0x${"7".repeat(64)}`,
      optionsHash: `0x${"8".repeat(64)}`,
      destination: "/var/lib/postgresql/data",
      readWrite: true,
      metadataHash: `0x${"9".repeat(64)}`,
      createDestroyEventCount: 0
    },
    services: [
      service(
        "postgres",
        "2026-08-15T00:00:10.000Z",
        "2026-08-15T00:10:05.000Z",
        `sha256:${"d".repeat(64)}`
      ),
      service(
        "pilot",
        "2026-08-15T00:00:20.000Z",
        "2026-08-15T00:10:15.000Z"
      ),
      service(
        "worker",
        "2026-08-15T00:00:30.000Z",
        "2026-08-15T00:10:20.000Z"
      )
    ]
  };
}

function journeyCriticalDocuments() {
  const operation = (operationId) => ({
    operationId,
    requestId: `request_${operationId}`,
    correlationId: `correlation_${operationId}`,
    responseSchemaVersion: `response_${operationId}.v1`,
    occurredAt: "2026-08-15T00:05:00.000Z"
  });
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
  return {
    human_critical: {
      capturedAt: "2026-08-15T00:12:00.000Z",
      authentication: { mode: "siwe" },
      actorScope: { actorRefHash: `0x${"a".repeat(64)}` },
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
      capturedAt: "2026-08-15T00:13:00.000Z",
      authentication: { capitalPartner: { mode: "siwe" } },
      profile: {
        selfQueryProof: { operationId: "pilotReadCapitalPartnerSelf" }
      },
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
          responseSchemaVersion:
            "tenant_capital_partner_offer_transitioned.v1"
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
      candidateReleaseId: CANDIDATE,
      candidateMarker: `m1b.agent.${CANDIDATE}`,
      accountHash: `0x${"b".repeat(64)}`,
      subjectId: "subject_agent",
      mandateId: "mandate_agent",
      applicationHandoff: {
        subjectId: "subject_agent",
        mandateId: "mandate_agent"
      },
      runtimeHandoff: {
        subjectId: "subject_agent",
        mandateId: "mandate_agent"
      },
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
        capturedAt: "2026-08-15T00:10:45.000Z"
      },
      canonicalRecovery: {
        obligation: { obligationId: "obligation_agent" }
      },
      lifecycleMutationPerformed: false
    }
  };
}

async function createJourneyFilesystemFixture() {
  const fixture = await createBrowserFilesystemFixture();
  const browserRows = await verifyM1BOperationalBrowserArtifacts(
    fixture.evidence,
    fixture.context
  );
  const criticalDocuments = journeyCriticalDocuments();
  fixture.files.set("human_critical", {
    document: criticalDocuments.human_critical
  });
  fixture.files.set("capital_partner_critical", {
    document: criticalDocuments.capital_partner_critical
  });
  fixture.files.set("agent_after", { document: criticalDocuments.agent_after });
  const agentBeforeArtifact = await addJsonFixtureArtifact(
    fixture,
    "agent_before",
    "runtime_receipt",
    criticalDocuments.agent_before
  );
  const applicationMcpArtifact = await addJsonFixtureArtifact(
    fixture,
    "agent_application_mcp",
    "agent_mcp_receipt",
    criticalDocuments.agent_before.offerReceipt
  );
  const runtimeMcpArtifact = await addJsonFixtureArtifact(
    fixture,
    "agent_runtime_mcp",
    "agent_mcp_receipt",
    criticalDocuments.agent_before.lifecycle.mcpReceipt
  );
  const criticalArtifacts = [
    fixture.artifactById.get("release_identity"),
    agentBeforeArtifact,
    fixture.artifactById.get("agent_after"),
    fixture.artifactById.get("human_critical"),
    fixture.artifactById.get("capital_partner_critical")
  ].map(artifactReference);
  const supportingArtifacts = [
    applicationMcpArtifact,
    runtimeMcpArtifact
  ].map(artifactReference);
  const restart = journeyRestart();
  const reconciledAt = "2026-08-15T00:19:00.000Z";
  const receiptContext = {
    candidateReleaseId: CANDIDATE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt: fixture.context.corpus.databaseStartedAt,
    criticalDocuments,
    criticalArtifacts,
    supportingArtifacts,
    browserAuditRecords: browserRows.map((entry) => ({
      artifact: entry.auditArtifact,
      document: entry.auditDocument
    })),
    restart,
    restartArtifact: artifactReference(
      fixture.artifactById.get("operational_restart")
    ),
    releaseIdentityArtifact: artifactReference(
      fixture.artifactById.get("release_identity")
    ),
    reconciledAt
  };
  const receipts = createM1BOperationalJourneyReceipts(receiptContext);
  for (const role of M1_B_OPERATIONAL_ROLES) {
    await addJsonFixtureArtifact(
      fixture,
      `journey_${role}_receipt`,
      "runtime_receipt",
      receipts[role]
    );
  }
  fixture.journeyContext = {
    evidenceRoot: fixture.root,
    expectedCommitSha: CANDIDATE,
    expectedRuntimeImageId: IMAGE,
    corpus: fixture.context.corpus,
    restart: { restart },
    browserRows,
    phases: {
      agentBefore: criticalDocuments.agent_before,
      agentAfter: criticalDocuments.agent_after
    }
  };
  fixture.receiptContext = receiptContext;
  return fixture;
}

async function replaceJourneyReceipts(fixture, receipts) {
  const originals = [];
  for (const role of M1_B_OPERATIONAL_ROLES) {
    const id = `journey_${role}_receipt`;
    const artifact = fixture.artifactById.get(id);
    const originalEntry = fixture.files.get(id);
    const originalSha256 = artifact.sha256;
    originals.push({ artifact, originalEntry, originalSha256 });
    const bytes = jsonBytes(receipts[role]);
    artifact.sha256 = sha256(bytes);
    fixture.files.set(id, { document: receipts[role] });
    await writeFile(resolve(fixture.root, artifact.relativePath), bytes);
  }
  return async () => {
    for (const { artifact, originalEntry, originalSha256 } of originals) {
      artifact.sha256 = originalSha256;
      fixture.files.set(artifact.id, originalEntry);
      await writeFile(
        resolve(fixture.root, artifact.relativePath),
        jsonBytes(originalEntry.document)
      );
    }
  };
}

test("historical v1 Evidence does not inherit the v2 operational file contract", async () => {
  assert.equal(await verifyM1BOperationalArtifactContents({
    schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v1"
  }), true);
});

test("current v2 Evidence cannot bypass the operational corpus with metadata alone", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ipo-one-operational-missing-"));
  try {
    await assert.rejects(
      verifyM1BOperationalArtifactContents({
        schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v2",
        source: { commitSha: CANDIDATE, treeSha: TREE },
        runtime: { local: { agentAcceptance: {} } },
        artifacts: []
      }, {
        evidenceRoot: root,
        expectedCommitSha: CANDIDATE
      }),
      (error) => error instanceof M1BAcceptanceEvidenceError &&
        error.issues.some((issue) => issue.includes("exact 151-artifact set"))
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operational verifier invokes the closed expired-Offer receipt validator", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ipo-one-expired-offer-proof-"));
  try {
    const setupBytes = Buffer.from(`${JSON.stringify({
      schemaVersion: "m1_b_expired_offer_setup_receipt.v1",
      artifactId: "expired_offer_setup",
      status: "passed"
    })}\n`);
    const capitalPartnerBytes = Buffer.from("{}\n");
    const setupArtifact = safeArtifact({
      id: "expired_offer_setup",
      kind: "postgres_receipt",
      relativePath: "expired-offer.json",
      sha256: sha256(setupBytes)
    });
    const capitalPartnerArtifact = safeArtifact({
      id: "capital_partner_critical",
      kind: "postgres_receipt",
      relativePath: "capital-partner.json",
      sha256: sha256(capitalPartnerBytes)
    });
    await Promise.all([
      writePrivate(resolve(root, setupArtifact.relativePath), setupBytes),
      writePrivate(
        resolve(root, capitalPartnerArtifact.relativePath),
        capitalPartnerBytes
      )
    ]);
    await assert.rejects(
      verifyM1BExpiredOfferSetupArtifact({
        schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v2",
        source: { treeSha: TREE },
        runtime: {
          local: {
            agentAcceptance: {
              afterRestart: { databaseStartedAt: "2026-08-15T00:10:00.000Z" }
            }
          }
        },
        artifacts: [setupArtifact, capitalPartnerArtifact]
      }, {
        evidenceRoot: root,
        expectedCommitSha: CANDIDATE,
        expectedRuntimeImageId: IMAGE,
        negativeRunStartedAt: "2026-08-15T00:30:00.000Z"
      }),
      (error) => error instanceof M1BAcceptanceEvidenceError &&
        error.issues.some((issue) => issue.includes("Expired-Offer setup receipt is invalid"))
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operational verifier parses the sealed pre-restart foreign Agent offered-v1 receipt", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ipo-one-agent-foreign-proof-"));
  try {
    const receipt = foreignOfferSetupReceipt();
    const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    const artifact = {
      id: "agent_foreign_offer_setup",
      kind: "postgres_receipt",
      relativePath: "agent-foreign.json",
      sha256: sha256(bytes)
    };
    await writePrivate(resolve(root, artifact.relativePath), bytes);
    const verified = await verifyM1BAgentForeignOfferSetupArtifact(
      foreignOfferEvidence(artifact),
      {
        evidenceRoot: root,
        expectedCommitSha: CANDIDATE,
        expectedRuntimeImageId: IMAGE
      }
    );
    assert.equal(verified.offer.schemaVersion, "credit_offer.v1");
    assert.equal(verified.lifecycleAbsence.obligationCount, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operational verifier cross-binds private Agent phase receipts and extracted artifacts", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ipo-one-agent-phases-"));
  try {
    const receipt = foreignOfferSetupReceipt();
    const foreignBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    const foreignArtifact = {
      id: "agent_foreign_offer_setup",
      kind: "postgres_receipt",
      relativePath: "foreign.json",
      sha256: sha256(foreignBytes)
    };
    const foreignBinding = {
      id: foreignArtifact.id,
      relativePath: foreignArtifact.relativePath,
      sha256: foreignArtifact.sha256,
      completedAt: receipt.createdBeforeRestartAt
    };
    const applicationMcpDocument = {
      schemaVersion: "agent_credit_offer_workflow_receipt.v1",
      status: "offer_ready",
      steps: [
        { operationId: "pilotReadAgentSelf" },
        { operationId: "pilotRequestCredit" },
        { operationId: "pilotReadCreditApplication" },
        { operationId: "pilotEvaluateCreditApplication" }
      ]
    };
    const runtimeMcpDocument = {
      schemaVersion: "agent_obligation_workflow_receipt.v1",
      status: "completed",
      steps: [
        { operationId: "pilotAcceptCreditOffer" },
        { operationId: "pilotExecuteSandboxObligation" },
        { operationId: "pilotPostSandboxRepayment" },
        { operationId: "pilotReadOwnObligationEvidence" }
      ]
    };
    const recoveryDocument = {
      schemaVersion: "agent_recovery_receipt.v1",
      status: "recovered",
      obligationId: "obligation_agent_phase_fixture",
      capturedAt: "2026-08-15T00:10:45.000Z"
    };
    const supportingDocumentArtifact = (id, kind, relativePath, document) => {
      const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
      return {
        artifact: {
          id,
          kind,
          relativePath,
          sha256: sha256(bytes)
        },
        bytes
      };
    };
    const applicationMcp = supportingDocumentArtifact(
      "agent_application_mcp",
      "agent_mcp_receipt",
      "agent-application-mcp.json",
      applicationMcpDocument
    );
    const runtimeMcp = supportingDocumentArtifact(
      "agent_runtime_mcp",
      "agent_mcp_receipt",
      "agent-runtime-mcp.json",
      runtimeMcpDocument
    );
    const recovery = supportingDocumentArtifact(
      "agent_recovery_receipt",
      "runtime_receipt",
      "agent-recovery-receipt.json",
      recoveryDocument
    );
    const agentBeforeDocument = {
      foreignOfferSetupArtifact: foreignBinding,
      offerReceipt: applicationMcpDocument,
      lifecycle: {
        mcpReceipt: runtimeMcpDocument
      }
    };
    const agentAfterDocument = {
      foreignOfferSetupArtifact: foreignBinding,
      foreignOfferSetupReconciliation: {
        schemaVersion: "m1_b_agent_foreign_offer_reconciliation.v1",
        databaseStartedAt: "2026-08-15T00:10:00.000Z",
        observedAt: "2026-08-15T00:11:00.500Z",
        references: receipt.references,
        ownershipProof: receipt.ownershipProof,
        offer: receipt.offer,
        lifecycleAbsence: receipt.lifecycleAbsence,
        canonicalMandateStatusAtSetup: receipt.canonicalMandateStatusAtSetup,
        canonicalLifecycleReadOnly: true,
        lifecycleMutationPerformed: false,
        sandboxOnly: true,
        productionFundsMoved: false
      },
      recoveryReceipt: recoveryDocument
    };
    const agentBeforeBytes = Buffer.from(
      `${JSON.stringify(agentBeforeDocument, null, 2)}\n`
    );
    const agentAfterBytes = Buffer.from(
      `${JSON.stringify(agentAfterDocument, null, 2)}\n`
    );
    const agentBefore = {
      id: "agent_before",
      kind: "runtime_receipt",
      relativePath: "agent-before.json",
      sha256: sha256(agentBeforeBytes)
    };
    const agentAfter = {
      id: "agent_after",
      kind: "runtime_receipt",
      relativePath: "agent-after.json",
      sha256: sha256(agentAfterBytes)
    };
    const extractedArtifactBindings = new Map([
      ["before:offer_receipt", applicationMcp.artifact],
      ["before:mcp_receipt", runtimeMcp.artifact],
      ["after:recovery_receipt", recovery.artifact]
    ]);
    const makeExtracted = async (phase, ids) => Promise.all(ids.map(
      async (id, index) => {
        if (id === "agent_foreign_offer_setup") {
          return {
            id,
            relativePath: foreignArtifact.relativePath,
            sha256: foreignArtifact.sha256
          };
        }
        const supportingArtifact = extractedArtifactBindings.get(`${phase}:${id}`);
        if (supportingArtifact) {
          return {
            id,
            relativePath: supportingArtifact.relativePath,
            sha256: supportingArtifact.sha256
          };
        }
        const bytes = Buffer.from(`${phase}:${id}:${index}\n`);
        const entry = {
          id,
          relativePath: `${phase}-${id}.json`,
          sha256: sha256(bytes)
        };
        await writePrivate(resolve(root, entry.relativePath), bytes);
        return entry;
      }
    ));
    const beforeExtracted = await makeExtracted("before", [
      "application_handoff",
      "offer_receipt",
      "runtime_handoff",
      "lifecycle_result",
      "mcp_receipt",
      "agent_foreign_offer_setup"
    ]);
    const afterExtracted = await makeExtracted("after", [
      "application_handoff",
      "offer_receipt",
      "runtime_handoff",
      "canonical_recovery",
      "recovery_receipt"
    ]);
    const beforeReceipt = createM1BAgentPhaseReceipt({
      candidateReleaseId: CANDIDATE,
      acceptancePhase: "before_restart",
      acceptanceMode: "before_restart_executed",
      runtimeImageId: IMAGE,
      databaseStartedAt: "2026-08-15T00:00:00.000Z",
      startedAt: "2026-08-15T00:01:00.000Z",
      completedAt: "2026-08-15T00:02:00.000Z",
      acceptanceArtifact: {
        id: agentBefore.id,
        relativePath: agentBefore.relativePath,
        sha256: agentBefore.sha256
      },
      foreignOfferSetupArtifact: foreignBinding,
      extractedArtifacts: beforeExtracted
    });
    const afterReceipt = createM1BAgentPhaseReceipt({
      candidateReleaseId: CANDIDATE,
      acceptancePhase: "after_restart",
      acceptanceMode: "after_restart_recovered",
      runtimeImageId: IMAGE,
      databaseStartedAt: "2026-08-15T00:10:00.000Z",
      startedAt: "2026-08-15T00:10:30.000Z",
      completedAt: "2026-08-15T00:11:00.000Z",
      acceptanceArtifact: {
        id: agentAfter.id,
        relativePath: agentAfter.relativePath,
        sha256: agentAfter.sha256
      },
      foreignOfferSetupArtifact: foreignBinding,
      extractedArtifacts: afterExtracted
    });
    const beforePhaseBytes = Buffer.from(`${JSON.stringify(beforeReceipt, null, 2)}\n`);
    const afterPhaseBytes = Buffer.from(`${JSON.stringify(afterReceipt, null, 2)}\n`);
    const beforePhase = {
      id: "agent_before_phase",
      kind: "runtime_receipt",
      relativePath: "before-phase.json",
      sha256: sha256(beforePhaseBytes)
    };
    const afterPhase = {
      id: "agent_after_phase",
      kind: "runtime_receipt",
      relativePath: "after-phase.json",
      sha256: sha256(afterPhaseBytes)
    };
    await Promise.all([
      writePrivate(resolve(root, foreignArtifact.relativePath), foreignBytes),
      writePrivate(
        resolve(root, applicationMcp.artifact.relativePath),
        applicationMcp.bytes
      ),
      writePrivate(
        resolve(root, runtimeMcp.artifact.relativePath),
        runtimeMcp.bytes
      ),
      writePrivate(
        resolve(root, recovery.artifact.relativePath),
        recovery.bytes
      ),
      writePrivate(resolve(root, agentBefore.relativePath), agentBeforeBytes),
      writePrivate(resolve(root, agentAfter.relativePath), agentAfterBytes),
      writePrivate(resolve(root, beforePhase.relativePath), beforePhaseBytes),
      writePrivate(resolve(root, afterPhase.relativePath), afterPhaseBytes)
    ]);
    const evidence = foreignOfferEvidence(foreignArtifact);
    evidence.runtime.local.agentAcceptance.beforeRestart.acceptanceArtifactId =
      agentBefore.id;
    evidence.runtime.local.agentAcceptance.afterRestart.acceptanceArtifactId =
      agentAfter.id;
    evidence.artifacts.push(
      safeArtifact(agentBefore),
      safeArtifact(agentAfter),
      safeArtifact(applicationMcp.artifact),
      safeArtifact(runtimeMcp.artifact),
      safeArtifact(recovery.artifact),
      safeArtifact(beforePhase),
      safeArtifact(afterPhase)
    );
    const phases = await verifyM1BAgentPhaseArtifacts(evidence, {
      evidenceRoot: root,
      expectedCommitSha: CANDIDATE,
      expectedRuntimeImageId: IMAGE,
      foreignOfferSetup: receipt
    });
    assert.equal(phases.before.extractedArtifacts.length, 6);
    assert.equal(phases.after.recoveryOnly, true);

    const verifyPhases = () => verifyM1BAgentPhaseArtifacts(evidence, {
      evidenceRoot: root,
      expectedCommitSha: CANDIDATE,
      expectedRuntimeImageId: IMAGE,
      foreignOfferSetup: receipt
    });
    const artifactById = (id) => evidence.artifacts.find(
      (artifact) => artifact.id === id
    );

    const extraClaimAgentBefore = structuredClone(agentBeforeDocument);
    extraClaimAgentBefore.foreignOfferSetupArtifact.operatorConfirmed = true;
    const extraClaimAgentBeforeBytes = Buffer.from(
      `${JSON.stringify(extraClaimAgentBefore, null, 2)}\n`
    );
    const extraClaimAgentBeforeSha = sha256(extraClaimAgentBeforeBytes);
    const extraClaimBeforeReceipt = createM1BAgentPhaseReceipt({
      candidateReleaseId: CANDIDATE,
      acceptancePhase: "before_restart",
      acceptanceMode: "before_restart_executed",
      runtimeImageId: IMAGE,
      databaseStartedAt: "2026-08-15T00:00:00.000Z",
      startedAt: "2026-08-15T00:01:00.000Z",
      completedAt: "2026-08-15T00:02:00.000Z",
      acceptanceArtifact: {
        id: agentBefore.id,
        relativePath: agentBefore.relativePath,
        sha256: extraClaimAgentBeforeSha
      },
      foreignOfferSetupArtifact: foreignBinding,
      extractedArtifacts: beforeExtracted
    });
    const extraClaimBeforePhaseBytes = Buffer.from(
      `${JSON.stringify(extraClaimBeforeReceipt, null, 2)}\n`
    );
    await Promise.all([
      writeFile(resolve(root, agentBefore.relativePath), extraClaimAgentBeforeBytes),
      writeFile(resolve(root, beforePhase.relativePath), extraClaimBeforePhaseBytes)
    ]);
    artifactById(agentBefore.id).sha256 = extraClaimAgentBeforeSha;
    artifactById(beforePhase.id).sha256 = sha256(extraClaimBeforePhaseBytes);
    await assert.rejects(
      verifyPhases,
      (error) => error instanceof M1BAcceptanceEvidenceError &&
        error.issues.some((issue) => issue.includes("sealed restart lifecycle"))
    );
    await Promise.all([
      writeFile(resolve(root, agentBefore.relativePath), agentBeforeBytes),
      writeFile(resolve(root, beforePhase.relativePath), beforePhaseBytes)
    ]);
    artifactById(agentBefore.id).sha256 = agentBefore.sha256;
    artifactById(beforePhase.id).sha256 = beforePhase.sha256;

    await chmod(resolve(root, agentBefore.relativePath), 0o644);
    await assert.rejects(
      verifyPhases,
      (error) => error instanceof M1BAcceptanceEvidenceError &&
        error.issues.some((issue) => issue.includes("private 0600"))
    );
    await chmod(resolve(root, agentBefore.relativePath), 0o600);

    const tamperedAgentAfter = structuredClone(agentAfterDocument);
    tamperedAgentAfter.foreignOfferSetupReconciliation.offer.creditOfferHash =
      `0x${"7".repeat(64)}`;
    const tamperedAgentAfterBytes = Buffer.from(
      `${JSON.stringify(tamperedAgentAfter, null, 2)}\n`
    );
    const tamperedAgentAfterSha = sha256(tamperedAgentAfterBytes);
    const tamperedAfterReceipt = createM1BAgentPhaseReceipt({
      candidateReleaseId: CANDIDATE,
      acceptancePhase: "after_restart",
      acceptanceMode: "after_restart_recovered",
      runtimeImageId: IMAGE,
      databaseStartedAt: "2026-08-15T00:10:00.000Z",
      startedAt: "2026-08-15T00:10:30.000Z",
      completedAt: "2026-08-15T00:11:00.000Z",
      acceptanceArtifact: {
        id: agentAfter.id,
        relativePath: agentAfter.relativePath,
        sha256: tamperedAgentAfterSha
      },
      foreignOfferSetupArtifact: foreignBinding,
      extractedArtifacts: afterExtracted
    });
    const tamperedAfterPhaseBytes = Buffer.from(
      `${JSON.stringify(tamperedAfterReceipt, null, 2)}\n`
    );
    await Promise.all([
      writeFile(resolve(root, agentAfter.relativePath), tamperedAgentAfterBytes),
      writeFile(resolve(root, afterPhase.relativePath), tamperedAfterPhaseBytes)
    ]);
    artifactById(agentAfter.id).sha256 = tamperedAgentAfterSha;
    artifactById(afterPhase.id).sha256 = sha256(tamperedAfterPhaseBytes);
    await assert.rejects(
      verifyPhases,
      (error) => error instanceof M1BAcceptanceEvidenceError &&
        error.issues.some((issue) => issue.includes("sealed restart lifecycle"))
    );

    await Promise.all([
      writeFile(resolve(root, agentAfter.relativePath), agentAfterBytes),
      writeFile(resolve(root, afterPhase.relativePath), afterPhaseBytes)
    ]);
    artifactById(agentAfter.id).sha256 = agentAfter.sha256;
    artifactById(afterPhase.id).sha256 = afterPhase.sha256;

    const driftedApplicationMcpDocument = structuredClone(
      applicationMcpDocument
    );
    driftedApplicationMcpDocument.status = "offer_ready_drifted";
    const driftedApplicationMcpBytes = Buffer.from(
      `${JSON.stringify(driftedApplicationMcpDocument, null, 2)}\n`
    );
    const driftedApplicationMcpSha = sha256(driftedApplicationMcpBytes);
    const driftedBeforeExtracted = beforeExtracted.map((entry) =>
      entry.id === "offer_receipt"
        ? { ...entry, sha256: driftedApplicationMcpSha }
        : entry);
    const driftedMcpBeforeReceipt = createM1BAgentPhaseReceipt({
      candidateReleaseId: CANDIDATE,
      acceptancePhase: "before_restart",
      acceptanceMode: "before_restart_executed",
      runtimeImageId: IMAGE,
      databaseStartedAt: "2026-08-15T00:00:00.000Z",
      startedAt: "2026-08-15T00:01:00.000Z",
      completedAt: "2026-08-15T00:02:00.000Z",
      acceptanceArtifact: {
        id: agentBefore.id,
        relativePath: agentBefore.relativePath,
        sha256: agentBefore.sha256
      },
      foreignOfferSetupArtifact: foreignBinding,
      extractedArtifacts: driftedBeforeExtracted
    });
    const driftedMcpBeforePhaseBytes = Buffer.from(
      `${JSON.stringify(driftedMcpBeforeReceipt, null, 2)}\n`
    );
    await Promise.all([
      writeFile(
        resolve(root, applicationMcp.artifact.relativePath),
        driftedApplicationMcpBytes
      ),
      writeFile(
        resolve(root, beforePhase.relativePath),
        driftedMcpBeforePhaseBytes
      )
    ]);
    artifactById(applicationMcp.artifact.id).sha256 =
      driftedApplicationMcpSha;
    artifactById(beforePhase.id).sha256 = sha256(
      driftedMcpBeforePhaseBytes
    );
    await assert.rejects(
      verifyPhases,
      (error) => error instanceof M1BAcceptanceEvidenceError &&
        error.issues.some((issue) => issue.includes(
          "differs from its sealed Agent acceptance truth"
        ))
    );
    await Promise.all([
      writeFile(
        resolve(root, applicationMcp.artifact.relativePath),
        applicationMcp.bytes
      ),
      writeFile(resolve(root, beforePhase.relativePath), beforePhaseBytes)
    ]);
    artifactById(applicationMcp.artifact.id).sha256 =
      applicationMcp.artifact.sha256;
    artifactById(beforePhase.id).sha256 = beforePhase.sha256;

    const straddledBeforeReceipt = createM1BAgentPhaseReceipt({
      candidateReleaseId: CANDIDATE,
      acceptancePhase: "before_restart",
      acceptanceMode: "before_restart_executed",
      runtimeImageId: IMAGE,
      databaseStartedAt: "2026-08-15T00:00:00.000Z",
      startedAt: "2026-08-15T00:01:00.000Z",
      completedAt: "2026-08-15T00:10:00.000Z",
      acceptanceArtifact: {
        id: agentBefore.id,
        relativePath: agentBefore.relativePath,
        sha256: agentBefore.sha256
      },
      foreignOfferSetupArtifact: foreignBinding,
      extractedArtifacts: beforeExtracted
    });
    const straddledBeforePhaseBytes = Buffer.from(
      `${JSON.stringify(straddledBeforeReceipt, null, 2)}\n`
    );
    await writeFile(
      resolve(root, beforePhase.relativePath),
      straddledBeforePhaseBytes
    );
    artifactById(beforePhase.id).sha256 = sha256(straddledBeforePhaseBytes);
    await assert.rejects(
      verifyPhases,
      (error) => error instanceof M1BAcceptanceEvidenceError &&
        error.issues.some((issue) => issue.includes("sealed restart lifecycle"))
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operational verifier reconstructs the sole restart journal and linkage", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ipo-one-restart-corpus-"));
  try {
    const digest = (id) => sha256(Buffer.from(id));
    const reference = (id, kind) => ({
      id,
      kind,
      relativePath: `${id}.json`,
      sha256: digest(id)
    });
    const pendingArtifact = reference(
      "operational_restart_pending",
      "restart_log"
    );
    const completedArtifact = reference("operational_restart", "restart_log");
    const linkageArtifact = reference(
      "operational_restart_linkage",
      "restart_log"
    );
    const beforePhaseArtifact = reference(
      "agent_before_phase",
      "runtime_receipt"
    );
    const afterPhaseArtifact = reference(
      "agent_after_phase",
      "runtime_receipt"
    );
    const foreignArtifact = reference(
      "agent_foreign_offer_setup",
      "postgres_receipt"
    );
    const agentBeforeArtifact = reference("agent_before", "runtime_receipt");
    const humanArtifact = reference("human_critical", "postgres_receipt");
    const capitalPartnerArtifact = reference(
      "capital_partner_critical",
      "postgres_receipt"
    );
    const serviceIdentity = (service, phase) => ({
      containerId: ({ postgres: "1", pilot: "2", worker: "3" }[service]).repeat(64),
      imageId: service === "postgres"
        ? `sha256:${"d".repeat(64)}`
        : IMAGE,
      startedAt: phase === "before"
        ? `2026-08-15T00:00:${{
            postgres: "10",
            pilot: "20",
            worker: "30"
          }[service]}.000Z`
        : `2026-08-15T00:10:${{
            postgres: "05",
            pilot: "10",
            worker: "15"
          }[service]}.000Z`,
      configHash: `0x${"4".repeat(64)}`
    });
    const engine = {
      engineIdHash: `0x${"5".repeat(64)}`,
      serverVersion: "28.3.3",
      securityOptionsHash: `0x${"6".repeat(64)}`,
      rootless: true
    };
    const volumeReceipt = {
      name: "ipo-one-local-postgres-data",
      driver: "local",
      createdAt: "2026-08-14T00:00:00.000Z",
      scope: "local",
      labelsHash: `0x${"7".repeat(64)}`,
      optionsHash: `0x${"8".repeat(64)}`,
      destination: "/var/lib/postgresql/data",
      readWrite: true,
      metadataHash: `0x${"9".repeat(64)}`
    };
    const beforePhase = {
      completedAt: "2026-08-15T00:02:00.000Z"
    };
    const afterPhase = {
      startedAt: "2026-08-15T00:10:30.000Z",
      completedAt: "2026-08-15T00:11:00.000Z"
    };
    const foreign = {
      createdBeforeRestartAt: "2026-08-15T00:02:00.500Z"
    };
    const pending = {
      schemaVersion: "m1_b_operational_restart_pending.v2",
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      sourceRuntime: "local_exact_commit",
      capturedAt: "2026-08-15T00:03:00.000Z",
      databaseStartedAt: "2026-08-15T00:00:15.000Z",
      engine: {
        observedAt: "2026-08-15T00:03:00.000Z",
        receipt: engine
      },
      volume: {
        name: volumeReceipt.name,
        receipt: volumeReceipt
      },
      services: Object.fromEntries(
        ["postgres", "pilot", "worker"].map((service) => [
          service,
          serviceIdentity(service, "before")
        ])
      ),
      agentBeforeSha256: agentBeforeArtifact.sha256,
      agentBeforePhaseReceipt: {
        sha256: beforePhaseArtifact.sha256,
        completedAt: beforePhase.completedAt
      },
      agentForeignOfferSetupArtifact: {
        id: foreignArtifact.id,
        sha256: foreignArtifact.sha256,
        completedAt: foreign.createdBeforeRestartAt
      },
      containsSecrets: false,
      containsRawPii: false,
      containsSessionMaterial: false
    };
    const restart = {
      capturedAt: "2026-08-15T00:10:20.000Z",
      beforeDatabaseStartedAt: pending.databaseStartedAt,
      afterDatabaseStartedAt: "2026-08-15T00:10:07.000Z",
      eventWindow: {
        engineBeforeAt: pending.capturedAt,
        engineAfterAt: "2026-08-15T00:10:20.000Z"
      },
      engine,
      volume: { ...volumeReceipt, createDestroyEventCount: 0 },
      services: ["postgres", "pilot", "worker"].map((service) => ({
        service,
        before: serviceIdentity(service, "before"),
        after: serviceIdentity(service, "after"),
        events: {
          start: 1,
          stop: 1,
          kill: 1,
          die: 1,
          restart: 0,
          create: 0,
          destroy: 0
        }
      }))
    };
    const completed = {
      schemaVersion: "m1_b_restart_receipt.v2",
      status: "passed",
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      sourceRuntime: "local_exact_commit",
      pendingJournalSha256: pendingArtifact.sha256,
      agentBeforeSha256: agentBeforeArtifact.sha256,
      agentBeforePhaseReceipt: pending.agentBeforePhaseReceipt,
      agentForeignOfferSetupArtifact: pending.agentForeignOfferSetupArtifact,
      restartCount: 1,
      ...restart,
      fixtureUsed: false,
      productionFundsMoved: false,
      redaction: {
        containsSecrets: false,
        containsRawPii: false,
        containsSessionMaterial: false,
        containsEnvironment: false,
        containsVolumeSourceOrMountpoint: false
      }
    };
    const linkage = createM1BOperationalRestartLinkageDocument({
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE,
      databaseStartedAt: restart.afterDatabaseStartedAt,
      restart,
      restartPendingArtifact: pendingArtifact,
      restartArtifact: completedArtifact,
      supportingArtifacts: [
        beforePhaseArtifact,
        afterPhaseArtifact,
        foreignArtifact
      ]
    });
    const human = { capturedAt: "2026-08-15T00:12:00.000Z" };
    const capitalPartner = { capturedAt: "2026-08-15T00:13:00.000Z" };
    const documents = new Map(Object.entries({
      operational_restart_pending: pending,
      operational_restart: completed,
      operational_restart_linkage: linkage,
      agent_before_phase: beforePhase,
      agent_after_phase: afterPhase,
      agent_foreign_offer_setup: foreign,
      human_critical: human,
      capital_partner_critical: capitalPartner
    }).map(([id, document]) => [id, { document }]));
    const evidence = {
      schemaVersion: "ipo.one.m1-b-p0-5-acceptance-evidence/v2",
      source: { commitSha: CANDIDATE, treeSha: TREE },
      artifacts: [
        pendingArtifact,
        completedArtifact,
        linkageArtifact,
        beforePhaseArtifact,
        afterPhaseArtifact,
        foreignArtifact,
        agentBeforeArtifact,
        humanArtifact,
        capitalPartnerArtifact
      ].map(safeArtifact)
    };
    const context = {
      evidenceRoot: root,
      expectedCommitSha: CANDIDATE,
      expectedRuntimeImageId: IMAGE,
      corpus: {
        root,
        files: documents,
        risk: { capturedAt: "2026-08-15T00:20:00.000Z" }
      }
    };
    const verified = await verifyM1BOperationalRestartArtifacts(
      evidence,
      context
    );
    assert.equal(verified.completed.restartCount, 1);
    assert.equal(verified.linkage.restartCount, 1);

    completed.pendingJournalSha256 = "0".repeat(64);
    await assert.rejects(
      verifyM1BOperationalRestartArtifacts(evidence, context),
      (error) => error instanceof M1BAcceptanceEvidenceError &&
        error.issues.some((issue) => issue.includes("pending journal"))
    );
    completed.pendingJournalSha256 = pendingArtifact.sha256;

    afterPhase.startedAt = restart.capturedAt;
    await assert.rejects(
      verifyM1BOperationalRestartArtifacts(evidence, context),
      (error) => error instanceof M1BAcceptanceEvidenceError &&
        error.issues.some((issue) => issue.includes("role chronology"))
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operational verifier rebuilds one exact-source proof from raw TAP and candidate source", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ipo-one-negative-proof-"));
  try {
    const run = await runM1BOperationalExactSourceNegativeCase({
      group: "human",
      id: "changed_version",
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE
    });
    const proof = createM1BOperationalExactSourceNegativeProof(run);
    const proofBytes = Buffer.from(`${JSON.stringify(proof, null, 2)}\n`);
    const proofArtifact = {
      id: "negative_source_proof_human_changed_version",
      kind: "negative_source_proof",
      relativePath: "proof.json",
      sha256: sha256(proofBytes)
    };
    const tapArtifact = {
      id: "negative_tap_human_changed_version",
      kind: "tap_log",
      relativePath: "proof.tap",
      sha256: sha256(run.tapBytes)
    };
    await Promise.all([
      writePrivate(resolve(root, proofArtifact.relativePath), proofBytes),
      writePrivate(resolve(root, tapArtifact.relativePath), run.tapBytes)
    ]);
    const result = await verifyM1BExactSourceNegativeProofArtifactPair({
      proofArtifact,
      tapArtifact,
      evidenceRoot: root,
      expectedCommitSha: CANDIDATE,
      expectedTreeSha: TREE,
      expectedRuntimeImageId: IMAGE,
      expectedDefinition: getM1BOperationalNegativeCaseDefinition(
        "human",
        "changed_version"
      )
    });
    assert.equal(result.proof.caseDefinitionHash, proof.caseDefinitionHash);
    assert.equal(result.tapSha256, run.tapSha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operational verifier rejects a self-consistent proof-file tamper and public mode", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ipo-one-negative-proof-tamper-"));
  try {
    const run = await runM1BOperationalExactSourceNegativeCase({
      group: "human",
      id: "changed_version",
      candidateReleaseId: CANDIDATE,
      sourceTreeHash: TREE,
      runtimeImageId: IMAGE
    });
    const proof = structuredClone(createM1BOperationalExactSourceNegativeProof(run));
    proof.authorizationReasonCode = "fabricated_reason";
    const proofBytes = Buffer.from(`${JSON.stringify(proof, null, 2)}\n`);
    const proofArtifact = {
      id: "negative_source_proof_human_changed_version",
      kind: "negative_source_proof",
      relativePath: "proof.json",
      sha256: sha256(proofBytes)
    };
    const tapArtifact = {
      id: "negative_tap_human_changed_version",
      kind: "tap_log",
      relativePath: "proof.tap",
      sha256: sha256(run.tapBytes)
    };
    await Promise.all([
      writePrivate(resolve(root, proofArtifact.relativePath), proofBytes),
      writePrivate(resolve(root, tapArtifact.relativePath), run.tapBytes)
    ]);
    const verify = () => verifyM1BExactSourceNegativeProofArtifactPair({
      proofArtifact,
      tapArtifact,
      evidenceRoot: root,
      expectedCommitSha: CANDIDATE,
      expectedTreeSha: TREE,
      expectedRuntimeImageId: IMAGE,
      expectedDefinition: getM1BOperationalNegativeCaseDefinition(
        "human",
        "changed_version"
      )
    });
    await assert.rejects(
      verify,
      (error) => error instanceof M1BAcceptanceEvidenceError &&
        error.issues.some((issue) => issue.includes("differs from its TAP-derived proof"))
    );
    await chmod(resolve(root, tapArtifact.relativePath), 0o644);
    await assert.rejects(
      verify,
      (error) => error instanceof M1BAcceptanceEvidenceError &&
        error.issues.some((issue) => issue.includes("private 0600"))
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operational verifier reconstructs all 16 negatives and rejects source-substitution tampering", async (t) => {
  const fixture = await createNegativeFilesystemFixture();
  const verify = () => verifyM1BOperationalNegativeArtifacts(
    fixture.evidence,
    fixture.context
  );
  const rejected = async (issue) => assert.rejects(
    verify(),
    (error) => error instanceof M1BAcceptanceEvidenceError &&
      error.issues.some((value) => value.includes(issue))
  );
  try {
    await t.test("reconstructs the exact 12 source and four live cases", async () => {
      const result = await verify();
      assert.equal(result.proofs.length, 16);
      assert.equal(result.caseReceipts.length, 16);
      assert.equal(result.manifest.caseCount, 16);
    });

    await t.test("rejects a live request-projection hash tamper", async () => {
      const restore = await mutateFixtureJsonArtifact(
        fixture,
        "negative_live_attempt_human_unauthorized_subject",
        (document) => {
          document.requestProjectionHash = `0x${"0".repeat(64)}`;
        }
      );
      try {
        await rejected("does not reconstruct");
      } finally {
        await restore();
      }
    });

    await t.test("rejects an expired baseline detached from the sealed setup state", async () => {
      const originalContext = fixture.context.expiredOfferSetup;
      const setupArtifact = fixture.artifactById.get("expired_offer_setup");
      const originalArtifactSha256 = setupArtifact.sha256;
      const restore = await mutateFixtureJsonArtifact(
        fixture,
        "expired_offer_setup",
        (document) => {
          document.expiration.protectedStateAfterHash =
            `0x${"f".repeat(64)}`;
        }
      );
      fixture.context.expiredOfferSetup =
        fixture.files.get("expired_offer_setup").document;
      setupArtifact.sha256 = originalArtifactSha256;
      try {
        await rejected("post-expiry protected state");
      } finally {
        await restore();
        fixture.context.expiredOfferSetup = originalContext;
      }
    });

    await t.test("rejects an unauthorized denial observed after foreign-Offer expiry", async () => {
      const originalContext = fixture.context.foreignOfferSetup;
      const setupArtifact = fixture.artifactById.get(
        "agent_foreign_offer_setup"
      );
      const originalArtifactSha256 = setupArtifact.sha256;
      const attempt = fixture.files.get(
        "negative_live_attempt_human_unauthorized_subject"
      ).document;
      const restore = await mutateFixtureJsonArtifact(
        fixture,
        "agent_foreign_offer_setup",
        (document) => {
          document.offer.validUntil = attempt.verificationCapturedAt;
        }
      );
      fixture.context.foreignOfferSetup =
        fixture.files.get("agent_foreign_offer_setup").document;
      setupArtifact.sha256 = originalArtifactSha256;
      try {
        await rejected("retained unexpired foreign Offer");
      } finally {
        await restore();
        fixture.context.foreignOfferSetup = originalContext;
      }
    });

    await t.test("rejects a final receipt that diverges from its linked source proof", async () => {
      const restore = await mutateFixtureJsonArtifact(
        fixture,
        "negative_human_wrong_tenant",
        (document) => {
          document.authorizationReasonCode = "fabricated_reason";
        }
      );
      try {
        await rejected("differs from its source proof");
      } finally {
        await restore();
      }
    });

    await t.test("rejects a stale-Offer final receipt that diverges from CP truth", async () => {
      const restore = await mutateFixtureJsonArtifact(
        fixture,
        "negative_human_replaced_stale_offer",
        (document) => {
          document.authorizationReasonCode = "fabricated_stale_reason";
        }
      );
      try {
        await rejected("differs from its source proof");
      } finally {
        await restore();
      }
    });

    await t.test("rejects a negative manifest case-digest tamper", async () => {
      const restore = await mutateFixtureJsonArtifact(
        fixture,
        "operational_negative_cases",
        (document) => {
          document.cases[0].artifactSha256 = "0".repeat(64);
        }
      );
      try {
        await rejected("negative manifest is invalid");
      } finally {
        await restore();
      }
    });
  } finally {
    await rm(fixture.rootPath, { recursive: true, force: true });
  }
});

test("operational verifier reconstructs three journeys and rejects derived-chain tampering", async (t) => {
  const fixture = await createJourneyFilesystemFixture();
  const verify = () => verifyM1BOperationalJourneyArtifacts(
    fixture.evidence,
    fixture.journeyContext
  );
  const rejected = async (issue) => assert.rejects(
    verify(),
    (error) => error instanceof M1BAcceptanceEvidenceError &&
      error.issues.some((value) => value.includes(issue))
  );
  try {
    await t.test("reconstructs all three roles and 28 derived steps", async () => {
      const receipts = await verify();
      assert.deepEqual(Object.keys(receipts), M1_B_OPERATIONAL_ROLES);
      assert.equal(
        Object.values(receipts).reduce(
          (count, receipt) => count + receipt.steps.length,
          0
        ),
        28
      );
    });

    await t.test("rejects a sourceProjection tamper", async () => {
      const restore = await mutateFixtureJsonArtifact(
        fixture,
        "journey_principal_agent_receipt",
        (document) => {
          document.steps[0].binding.sourceBindings[0]
            .sourceProjection.accountHash = `0x${"0".repeat(64)}`;
        }
      );
      try {
        await rejected("do not reconstruct");
      } finally {
        await restore();
      }
    });

    await t.test("rejects a previousStepHash tamper", async () => {
      const restore = await mutateFixtureJsonArtifact(
        fixture,
        "journey_human_receipt",
        (document) => {
          document.steps[1].previousStepHash = `0x${"0".repeat(64)}`;
        }
      );
      try {
        await rejected("do not reconstruct");
      } finally {
        await restore();
      }
    });

    await t.test("rejects self-consistent reconciliation after the pre-Risk window", async () => {
      const receipts = createM1BOperationalJourneyReceipts({
        ...fixture.receiptContext,
        reconciledAt: "2026-08-15T00:21:00.000Z"
      });
      const restore = await replaceJourneyReceipts(fixture, receipts);
      try {
        await rejected("outside the pre-Risk window");
      } finally {
        await restore();
      }
    });
  } finally {
    await rm(fixture.rootPath, { recursive: true, force: true });
  }
});

test("browser filesystem verifier reconstructs all 24 rows and rejects semantic file tampering", async (t) => {
  const fixture = await createBrowserFilesystemFixture();
  try {
    await t.test("reconstructs 24 rows, 33 phases, and 33 unique JPEGs", async () => {
      const rows = await verifyM1BOperationalBrowserArtifacts(
        fixture.evidence,
        fixture.context
      );
      assert.equal(rows.length, 24);
      assert.equal(
        rows.reduce(
          (count, { runtimeDocument }) =>
            count + runtimeDocument.measurementPhases.length,
          0
        ),
        33
      );
      assert.equal(
        new Set(fixture.screenshots.map(({ artifact }) => artifact.sha256)).size,
        33
      );
    });

    await t.test("rejects a visible-console control tamper", async () => {
      const restore = await mutateBrowserJsonArtifact(
        fixture,
        "browser_human_desktop_runtime",
        (document) => {
          document.measurementPhases[0].prompt.browserControl.surface =
            "hidden_bridge";
        }
      );
      try {
        await assertBrowserFixtureRejected(
          fixture,
          "documents do not reconstruct"
        );
      } finally {
        await restore();
      }
    });

    await t.test("rejects a malformed app-role authorization audit", async () => {
      const restore = await mutateBrowserJsonArtifact(
        fixture,
        "browser_human_desktop_runtime",
        (document) => {
          document.measurementPhases[0]
            .authorizationObservation.authorizationAuditEventCount = 1;
        }
      );
      try {
        await assertBrowserFixtureRejected(
          fixture,
          "documents do not reconstruct"
        );
      } finally {
        await restore();
      }
    });

    await t.test("rejects JPEG dimensions that do not bind the viewport", async () => {
      const screenshot = fixture.screenshots.find(
        ({ artifact }) => artifact.id === "browser_human_desktop_auth_shot"
      );
      const { artifact, bytes: originalBytes, challengeHash } = screenshot;
      const originalSha256 = artifact.sha256;
      const changed = browserJpeg(1279, 720, challengeHash);
      artifact.sha256 = sha256(changed);
      await writeFile(resolve(fixture.root, artifact.relativePath), changed);
      try {
        await assertBrowserFixtureRejected(fixture, "JPEG is invalid");
      } finally {
        artifact.sha256 = originalSha256;
        await writeFile(
          resolve(fixture.root, artifact.relativePath),
          originalBytes
        );
      }
    });

    await t.test("rejects a blank JPEG even with a recomputed digest", async () => {
      const screenshot = fixture.screenshots.find(
        ({ artifact }) => artifact.id === "browser_human_desktop_auth_shot"
      );
      const { artifact, bytes: originalBytes } = screenshot;
      const originalSha256 = artifact.sha256;
      const changed = browserJpeg(1280, 720, null);
      artifact.sha256 = sha256(changed);
      await writeFile(resolve(fixture.root, artifact.relativePath), changed);
      try {
        await assertBrowserFixtureRejected(fixture, "JPEG is invalid");
      } finally {
        artifact.sha256 = originalSha256;
        await writeFile(resolve(fixture.root, artifact.relativePath), originalBytes);
      }
    });

    await t.test("rejects a wrong self-consistent JPEG pixel challenge", async () => {
      const screenshot = fixture.screenshots.find(
        ({ artifact }) => artifact.id === "browser_human_desktop_auth_shot"
      );
      const { artifact, bytes: originalBytes } = screenshot;
      const originalSha256 = artifact.sha256;
      const changed = browserJpeg(1280, 720, `0x${"f3".repeat(32)}`);
      artifact.sha256 = sha256(changed);
      await writeFile(resolve(fixture.root, artifact.relativePath), changed);
      try {
        await assertBrowserFixtureRejected(fixture, "JPEG is invalid");
      } finally {
        artifact.sha256 = originalSha256;
        await writeFile(resolve(fixture.root, artifact.relativePath), originalBytes);
      }
    });

    await t.test("rejects trailing screenshot bytes even with a matching digest", async () => {
      const screenshot = fixture.screenshots.find(
        ({ artifact }) => artifact.id === "browser_human_desktop_auth_shot"
      );
      const { artifact, bytes: originalBytes } = screenshot;
      const originalSha256 = artifact.sha256;
      const changed = Buffer.concat([originalBytes, Buffer.from([0])]);
      artifact.sha256 = sha256(changed);
      await writeFile(resolve(fixture.root, artifact.relativePath), changed);
      try {
        await assertBrowserFixtureRejected(fixture, "JPEG is invalid");
      } finally {
        artifact.sha256 = originalSha256;
        await writeFile(
          resolve(fixture.root, artifact.relativePath),
          originalBytes
        );
      }
    });

    await t.test("rejects a one-sided runtime-versus-audit mutation", async () => {
      const restore = await mutateBrowserJsonArtifact(
        fixture,
        "browser_human_desktop_audit",
        (document) => {
          document.queryReconciliation.countsAndPresenceFlagsCanonical = true;
        }
      );
      try {
        await assertBrowserFixtureRejected(
          fixture,
          "documents do not reconstruct"
        );
      } finally {
        await restore();
      }
    });

    await t.test("rejects a reused screenshot path and digest", async () => {
      const first = fixture.artifactById.get(
        "browser_human_desktop_auth_shot"
      );
      const second = fixture.artifactById.get(
        "browser_human_reload_auth_shot"
      );
      const original = {
        relativePath: second.relativePath,
        sha256: second.sha256
      };
      second.relativePath = first.relativePath;
      second.sha256 = first.sha256;
      try {
        await assertBrowserFixtureRejected(fixture, "screenshot is reused");
      } finally {
        Object.assign(second, original);
      }
    });

    await t.test("rejects the wrong closed negative receipt link", async () => {
      const artifact = fixture.artifactById.get(
        "negative_human_expired_offer"
      );
      const originalSha256 = artifact.sha256;
      artifact.sha256 = "e".repeat(64);
      try {
        await assertBrowserFixtureRejected(
          fixture,
          "documents do not reconstruct"
        );
      } finally {
        artifact.sha256 = originalSha256;
      }
    });

    await t.test("rejects the wrong sole-restart receipt link", async () => {
      const artifact = fixture.artifactById.get("operational_restart");
      const originalSha256 = artifact.sha256;
      artifact.sha256 = "f".repeat(64);
      try {
        await assertBrowserFixtureRejected(
          fixture,
          "documents do not reconstruct"
        );
      } finally {
        artifact.sha256 = originalSha256;
      }
    });
  } finally {
    await rm(fixture.rootPath, { recursive: true, force: true });
  }
});
