import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrictJson } from
  "../modules/authentication/src/strict-json.js";
import {
  M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS,
  assertCompleteM1BOperationalNegativeProofSet,
  assertM1BOperationalNegativeProofIdentifiersUnique,
  assertM1BOperationalNegativeSafeValue,
  createM1BOperationalExactSourceNegativeProof,
  createM1BOperationalExactSourceRunFromTap,
  deriveM1BReplacedStaleOfferNegativeProofFromCritical
} from "../apps/private-pilot/src/m1-b-operational-negative-acceptance.js";
import {
  validateM1BAgentForeignOfferSetupReceipt,
  validateM1BAgentPhaseReceipt
} from
  "./m1-b-agent-phase-receipt.mjs";
import {
  createM1BExpiredOfferCriticalBinding,
  validateM1BExpiredOfferSetupReceipt
} from
  "../apps/private-pilot/src/m1-b-expired-offer-setup.js";
import {
  M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES,
  deriveM1BOperationalBrowserRow,
  validateM1BOperationalBrowserJpeg
} from
  "../apps/private-pilot/src/m1-b-operational-browser-measurement.js";
import {
  inspectM1BOperationalLiveNegativeResponse
} from
  "../apps/private-pilot/src/m1-b-operational-live-negative-acceptance.js";
import {
  M1_B_OPERATIONAL_BROWSER_CHECKS,
  M1_B_OPERATIONAL_ROLES,
  assertM1BCanonicalOperationalArtifactSet,
  assertM1BOperationalPreRiskArtifactSet,
  createM1BCanonicalOperationalAcceptanceEvidence,
  createM1BOperationalBrowserRowDocuments,
  createM1BOperationalClosureDocument,
  createM1BOperationalJourneyReceipts,
  createM1BOperationalNegativeCaseManifest,
  createM1BOperationalNegativeCaseReceipt,
  createM1BOperationalPreRiskCollectionReceipt,
  createM1BOperationalRestartLinkageDocument,
  validateM1BAgentAcceptanceChronology,
  validateM1BOperationalBrowserRowDocuments,
  validateM1BOperationalJourneyReceipts,
  validateM1BOperationalLiveAttemptReceipt,
  validateM1BOperationalNegativeCaseManifest,
  validateM1BOperationalNegativeCaseReceipt,
  validateM1BOperationalNegativeProof
} from "./m1-b-operational-evidence-builder.mjs";
import { M1BAcceptanceEvidenceError } from
  "../packages/release-governance/src/m1-b-acceptance-evidence.js";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CURRENT_SCHEMA = "ipo.one.m1-b-p0-5-acceptance-evidence/v2";
const SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const REQUEST_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_TAP_BYTES = 4 * 1024 * 1024;
const MAX_SCREENSHOT_BYTES = 64 * 1024 * 1024;
const EXACT_SOURCE_MOUNTS = Object.freeze([
  "apps/private-pilot/test",
  "apps/web/test",
  "modules/authorization/test/support",
  "modules/tenant-command-gateway/test-postgres"
]);
const POSTGRES_IMAGE =
  "postgres@sha256:4f736ae292687621d4dbe0d499ffd024a36bd2ee7d8ca6f2ccd4c800f047b394";

function fail(message) {
  throw new M1BAcceptanceEvidenceError([message]);
}

function exactKeys(value, keys) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

function canonicalIso(value) {
  return typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function artifactRecord(evidence, id, kind) {
  const matches = evidence.artifacts.filter((artifact) => artifact.id === id);
  if (matches.length !== 1 || matches[0].kind !== kind) {
    fail(`Operational artifact ${id} must exist exactly once as ${kind}.`);
  }
  const artifact = matches[0];
  if (
    artifact.sourceRuntime !== "local_exact_commit" ||
    artifact.redacted !== true ||
    artifact.containsSecrets !== false ||
    artifact.containsRawPii !== false ||
    artifact.containsSessionMaterial !== false ||
    artifact.fixtureGenerated !== false
  ) fail(`Operational artifact ${id} has unsafe or non-candidate metadata.`);
  return artifact;
}

function exactArtifactReference(reference, artifact, kind = artifact?.kind) {
  return exactKeys(reference, ["id", "kind", "relativePath", "sha256"]) &&
    reference.id === artifact?.id &&
    reference.kind === kind &&
    reference.relativePath === artifact?.relativePath &&
    reference.sha256 === artifact?.sha256;
}

async function readArtifactBytes(artifact, root, maximumBytes) {
  const requested = resolve(root, artifact.relativePath);
  const relation = relative(root, requested);
  if (
    relation === "" ||
    relation.startsWith("..") ||
    isAbsolute(relation)
  ) fail(`Operational artifact ${artifact.id} escapes the Evidence root.`);
  const [metadata, canonical] = await Promise.all([
    lstat(requested),
    realpath(requested)
  ]);
  if (
    canonical !== requested ||
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o777) !== 0o600 ||
    metadata.size < 1 ||
    metadata.size > maximumBytes
  ) fail(`Operational artifact ${artifact.id} must be a bounded private 0600 regular file.`);
  const bytes = await readFile(canonical);
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
    fail(`Operational artifact ${artifact.id} does not match its SHA-256 record.`);
  }
  return bytes;
}

async function readJsonArtifact(artifact, root) {
  const bytes = await readArtifactBytes(artifact, root, MAX_JSON_BYTES);
  let document;
  try {
    document = parseStrictJson(bytes.toString("utf8"), {
      maximumBytes: MAX_JSON_BYTES,
      maximumDepth: 64,
      maximumKeys: 100_000
    });
  } catch {
    fail(`Operational artifact ${artifact.id} is not strict bounded JSON.`);
  }
  if (
    !document ||
    typeof document !== "object" ||
    Array.isArray(document) ||
    Object.getPrototypeOf(document) !== Object.prototype
  ) fail(`Operational artifact ${artifact.id} must contain one plain JSON object.`);
  return document;
}

async function assertCanonicalJsonArtifactBytes(
  artifact,
  root,
  document,
  description = artifact.id
) {
  const bytes = await readArtifactBytes(artifact, root, MAX_JSON_BYTES);
  if (!bytes.equals(Buffer.from(`${JSON.stringify(document, null, 2)}\n`))) {
    fail(`Operational ${description} JSON bytes are not canonical.`);
  }
  return true;
}

function redactionIsClosed(value) {
  return exactKeys(value, [
    "containsSecrets",
    "containsRawPii",
    "containsSessionMaterial"
  ]) && Object.values(value).every((entry) => entry === false);
}

function artifactReference(artifact) {
  return Object.freeze({
    id: artifact.id,
    kind: artifact.kind,
    relativePath: artifact.relativePath,
    sha256: artifact.sha256
  });
}

async function readOperationalCorpusArtifact(artifact, root) {
  if (new Set(["screenshot", "tap_log"]).has(artifact.kind)) {
    await readArtifactBytes(
      artifact,
      root,
      artifact.kind === "screenshot" ? MAX_SCREENSHOT_BYTES : MAX_TAP_BYTES
    );
    return Object.freeze({
      reference: artifactReference(artifact),
      bytes: null,
      document: null
    });
  }
  return Object.freeze({
    reference: artifactReference(artifact),
    bytes: null,
    document: await readJsonArtifact(artifact, root)
  });
}

export async function verifyM1BOperationalCorpusClosure(
  evidence,
  { evidenceRoot, expectedCommitSha }
) {
  if (evidence.schemaVersion !== CURRENT_SCHEMA) return true;
  if (
    !SHA.test(expectedCommitSha ?? "") ||
    evidence.source?.commitSha !== expectedCommitSha ||
    !SHA.test(evidence.source?.treeSha ?? "")
  ) fail("Operational corpus closure requires the exact candidate commit and tree.");

  const references = evidence.artifacts.map(artifactReference);
  try {
    assertM1BCanonicalOperationalArtifactSet({
      candidateReleaseId: expectedCommitSha,
      references
    });
  } catch (error) {
    fail(`Operational corpus is not the exact 151-artifact set: ${error.message}`);
  }

  const root = await realpath(resolve(evidenceRoot));
  const preRiskArtifact = artifactRecord(
    evidence,
    "operational_pre_risk_collection",
    "runtime_receipt"
  );
  const riskArtifact = artifactRecord(
    evidence,
    "risk_critical",
    "negative_receipt"
  );
  const closureArtifact = artifactRecord(
    evidence,
    "operational_closure",
    "runtime_receipt"
  );
  const [preRiskReceipt, risk, closure] = await Promise.all([
    readJsonArtifact(preRiskArtifact, root),
    readJsonArtifact(riskArtifact, root),
    readJsonArtifact(closureArtifact, root)
  ]);

  const restartLinkageReference = preRiskReceipt?.boundArtifacts?.find(
    ({ id }) => id === "operational_restart_linkage"
  );
  let reconstructedPreRisk;
  try {
    reconstructedPreRisk = createM1BOperationalPreRiskCollectionReceipt({
      candidateReleaseId: expectedCommitSha,
      sourceTreeHash: evidence.source.treeSha,
      runtimeImageId: preRiskReceipt.runtimeImageId,
      databaseStartedAt: preRiskReceipt.databaseStartedAt,
      startedAt: preRiskReceipt.startedAt,
      completedAt: preRiskReceipt.completedAt,
      restartLinkageArtifact: restartLinkageReference,
      boundArtifacts: preRiskReceipt.boundArtifacts,
      browserRowCount: preRiskReceipt.browserRowCount,
      journeyStepCount: preRiskReceipt.journeyStepCount,
      negativeCaseCount: preRiskReceipt.negativeCaseCount
    });
    assertM1BOperationalPreRiskArtifactSet({
      candidateReleaseId: expectedCommitSha,
      boundArtifacts: preRiskReceipt.boundArtifacts
    });
  } catch (error) {
    fail(`Operational pre-Risk receipt cannot be reconstructed: ${error.message}`);
  }
  if (canonicalJson(reconstructedPreRisk) !== canonicalJson(preRiskReceipt)) {
    fail("Operational pre-Risk receipt differs from its closed reconstruction.");
  }

  const preRiskIds = new Set();
  const files = new Map();
  for (const reference of preRiskReceipt.boundArtifacts) {
    const artifact = artifactRecord(evidence, reference.id, reference.kind);
    if (
      preRiskIds.has(reference.id) ||
      !exactArtifactReference(reference, artifact, reference.kind)
    ) fail(`Operational pre-Risk artifact ${reference.id} is not exactly corpus-bound.`);
    preRiskIds.add(reference.id);
    files.set(
      reference.id,
      await readOperationalCorpusArtifact(artifact, root)
    );
  }
  if (preRiskIds.size !== 148 || files.size !== 148) {
    fail("Operational pre-Risk corpus is not the exact 148-file set.");
  }

  let reconstructedClosure;
  try {
    reconstructedClosure = createM1BOperationalClosureDocument({
      candidateReleaseId: expectedCommitSha,
      sourceTreeHash: evidence.source.treeSha,
      runtimeImageId: preRiskReceipt.runtimeImageId,
      databaseStartedAt: preRiskReceipt.databaseStartedAt,
      preRiskReceiptArtifact: artifactReference(preRiskArtifact),
      preRiskCompletedAt: preRiskReceipt.completedAt,
      riskArtifact: artifactReference(riskArtifact),
      riskCapturedAt: risk.capturedAt,
      completedAt: closure.completedAt
    });
  } catch (error) {
    fail(`Operational closure cannot be reconstructed: ${error.message}`);
  }
  if (
    canonicalJson(reconstructedClosure) !== canonicalJson(closure) ||
    evidence.capturedAt !== closure.completedAt
  ) fail("Operational closure or canonical capturedAt differs from reconstructed chronology.");

  const criticalDocuments = {};
  for (const [id, kind] of [
    ["agent_before", "runtime_receipt"],
    ["agent_after", "runtime_receipt"],
    ["human_critical", "postgres_receipt"],
    ["capital_partner_critical", "postgres_receipt"]
  ]) {
    criticalDocuments[id] = files.get(id)?.document ??
      await readJsonArtifact(artifactRecord(evidence, id, kind), root);
  }
  criticalDocuments.risk_critical = risk;

  let reconstructedEvidence;
  try {
    reconstructedEvidence = createM1BCanonicalOperationalAcceptanceEvidence({
      candidateReleaseId: expectedCommitSha,
      sourceTreeHash: evidence.source.treeSha,
      runtimeImageId: preRiskReceipt.runtimeImageId,
      portBase: evidence.runtime?.local?.ports?.basePort,
      capturedAt: closure.completedAt,
      criticalDocuments,
      preRiskEvidence: Object.freeze({
        receipt: preRiskReceipt,
        receiptReference: artifactReference(preRiskArtifact),
        files,
        artifactReferences: Object.freeze(
          preRiskReceipt.boundArtifacts.map((reference) =>
            Object.freeze({ ...reference }))
        )
      }),
      riskArtifact: artifactReference(riskArtifact),
      closureArtifact: artifactReference(closureArtifact)
    });
  } catch (error) {
    fail(`Canonical operational Evidence cannot be reconstructed: ${error.message}`);
  }
  if (canonicalJson(reconstructedEvidence) !== canonicalJson(evidence)) {
    fail("Canonical operational Evidence differs from its 151-file reconstruction.");
  }
  return Object.freeze({
    root,
    runtimeImageId: preRiskReceipt.runtimeImageId,
    databaseStartedAt: preRiskReceipt.databaseStartedAt,
    preRiskReceipt,
    risk,
    closure,
    files
  });
}

function browserPhaseArtifactToken(phase) {
  const token = {
    authenticated: "auth",
    signed_out: "signedout",
    before_sign_out: "before"
  }[phase];
  if (!token) fail(`Operational browser phase ${phase} is not closed.`);
  return token;
}

function browserNegativeDefinition(group, id) {
  const matches = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    (definition) => definition.group === group && definition.id === id
  );
  if (matches.length !== 1) {
    fail(`Operational browser negative ${group}:${id} is not registry-bound.`);
  }
  return matches[0];
}

function browserRoleCritical(role) {
  return {
    human: ["human_critical", "postgres_receipt"],
    principal_agent: ["agent_after", "runtime_receipt"],
    capital_partner: ["capital_partner_critical", "postgres_receipt"]
  }[role];
}

export async function verifyM1BOperationalBrowserArtifacts(
  evidence,
  {
    evidenceRoot,
    expectedCommitSha,
    expectedRuntimeImageId,
    corpus
  }
) {
  if (evidence.schemaVersion !== CURRENT_SCHEMA) return true;
  const root = corpus?.root ?? await realpath(resolve(evidenceRoot));
  const files = corpus?.files;
  if (!(files instanceof Map)) {
    fail("Operational browser verification requires the closed pre-Risk corpus.");
  }
  const sourceTreeHash = evidence.source?.treeSha;
  const databaseStartedAt = corpus.databaseStartedAt;
  const releaseIdentity = artifactRecord(
    evidence,
    "release_identity",
    "release_identity"
  );
  const restart = artifactRecord(
    evidence,
    "operational_restart",
    "restart_log"
  );
  const identifiers = new Set();
  const screenshotPaths = new Set();
  const screenshotDigests = new Set();
  const rows = [];
  const reserve = (value, description) => {
    if (typeof value !== "string" || value === "" || identifiers.has(value)) {
      fail(`Operational browser ${description} is missing or reused.`);
    }
    identifiers.add(value);
  };

  for (const role of M1_B_OPERATIONAL_ROLES) {
    const [criticalId, criticalKind] = browserRoleCritical(role) ?? [];
    const criticalArtifact = artifactRecord(
      evidence,
      criticalId,
      criticalKind
    );
    for (const check of M1_B_OPERATIONAL_BROWSER_CHECKS) {
      const prefix = `browser_${role}_${check}`;
      const runtimeArtifact = artifactRecord(
        evidence,
        `${prefix}_runtime`,
        "runtime_receipt"
      );
      const auditArtifact = artifactRecord(
        evidence,
        `${prefix}_audit`,
        "browser_audit"
      );
      const runtimeDocument = files.get(runtimeArtifact.id)?.document;
      const auditDocument = files.get(auditArtifact.id)?.document;
      const expectedPhases = M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES[check];
      if (
        !runtimeDocument || !auditDocument ||
        !Array.isArray(runtimeDocument.measurementPhases) ||
        runtimeDocument.measurementPhases.length !== expectedPhases.length
      ) fail(`Operational browser ${role}:${check} phases are incomplete.`);

      const phaseEvidence = [];
      const visualArtifacts = [];
      const prompts = [];
      const responses = [];
      for (const [index, phase] of expectedPhases.entries()) {
        const measurement = runtimeDocument.measurementPhases[index];
        if (
          !measurement || measurement.phase !== phase ||
          !measurement.prompt || !measurement.response
        ) fail(`Operational browser ${role}:${check}:${phase} is malformed.`);
        const visualId = `${prefix}_${browserPhaseArtifactToken(phase)}_shot`;
        const visualArtifact = artifactRecord(
          evidence,
          visualId,
          "screenshot"
        );
        if (
          screenshotPaths.has(visualArtifact.relativePath) ||
          screenshotDigests.has(visualArtifact.sha256)
        ) fail(`Operational browser ${role}:${check}:${phase} screenshot is reused.`);
        const visualBytes = await readArtifactBytes(
          visualArtifact,
          root,
          MAX_SCREENSHOT_BYTES
        );
        const prompt = measurement.prompt;
        const response = measurement.response;
        let jpeg;
        try {
          const decoded = validateM1BOperationalBrowserJpeg(
            visualBytes,
            response.measurement?.viewport,
            prompt.capture?.challengeHash
          );
          if (decoded.sha256 !== visualArtifact.sha256) {
            fail(`Operational browser ${role}:${check}:${phase} JPEG digest is invalid.`);
          }
          jpeg = Object.freeze({
            width: decoded.width,
            height: decoded.height,
            jfifVersion: decoded.jfifVersion,
            iccProfileSegmentCount: decoded.iccProfileSegmentCount,
            iccProfileBytes: decoded.iccProfileBytes,
            quality: decoded.quality,
            subsampling: decoded.subsampling,
            mcuCount: decoded.mcuCount,
            decodedChallengeHash: decoded.decodedChallengeHash
          });
        } catch (error) {
          fail(`Operational browser ${role}:${check}:${phase} JPEG is invalid: ${error.message}`);
        }
        screenshotPaths.add(visualArtifact.relativePath);
        screenshotDigests.add(visualArtifact.sha256);

        reserve(prompt.promptId, "prompt ID");
        reserve(prompt.capture?.challenge, "capture challenge");
        if (prompt.readRequest !== null) {
          reserve(prompt.readRequest?.requestId, "private-read request ID");
          reserve(prompt.readRequest?.correlationId, "private-read correlation ID");
          for (const event of measurement.authorizationObservation
            ?.authorizationAuditEvents ?? []) {
            reserve(event?.eventId, "authorization audit event ID");
            reserve(event?.decisionId, "authorization decision ID");
          }
        }
        prompts.push(prompt);
        responses.push(response);
        phaseEvidence.push(Object.freeze({
          prompt,
          promptIssuedAt: measurement.promptIssuedAt,
          response,
          responseCapturedAt: measurement.responseCapturedAt,
          authorizationObservation: measurement.authorizationObservation
        }));
        visualArtifacts.push(Object.freeze({
          phase,
          id: visualArtifact.id,
          kind: visualArtifact.kind,
          relativePath: visualArtifact.relativePath,
          sha256: visualArtifact.sha256,
          mediaType: prompt.capture?.mediaType,
          codecProfile: prompt.capture?.codecProfile,
          challengeHash: prompt.capture?.challengeHash,
          jpeg
        }));
      }

      let row;
      try {
        row = Object.freeze({
          ...deriveM1BOperationalBrowserRow({
            prompts,
            responses,
            capturedAt: runtimeDocument.observedAt
          }),
          phaseEvidence: Object.freeze(phaseEvidence)
        });
      } catch (error) {
        fail(`Operational browser ${role}:${check} row cannot be derived: ${error.message}`);
      }
      const negativeCaseArtifact = row.negativeCase === null
        ? null
        : (() => {
            const definition = browserNegativeDefinition(
              row.negativeCase.group,
              row.negativeCase.id
            );
            const artifact = artifactRecord(
              evidence,
              `negative_${definition.group}_${definition.id}`,
              "negative_receipt"
            );
            return Object.freeze({
              id: artifact.id,
              kind: artifact.kind,
              sha256: artifact.sha256,
              caseDefinitionHash: definition.caseDefinitionHash
            });
          })();
      const context = Object.freeze({
        candidateReleaseId: expectedCommitSha,
        sourceTreeHash,
        runtimeImageId: expectedRuntimeImageId,
        databaseStartedAt,
        row,
        releaseIdentityArtifact: Object.freeze({
          id: releaseIdentity.id,
          sha256: releaseIdentity.sha256
        }),
        criticalArtifact: Object.freeze({
          id: criticalArtifact.id,
          kind: criticalArtifact.kind,
          sha256: criticalArtifact.sha256
        }),
        restartArtifact: check === "restart_recovery"
          ? Object.freeze({ id: restart.id, sha256: restart.sha256 })
          : null,
        negativeCaseArtifact,
        visualArtifacts: Object.freeze(visualArtifacts),
        readinessObservation: runtimeDocument.readinessObservation,
        outputRootRelativePath: dirname(runtimeArtifact.relativePath)
      });
      reserve(
        runtimeDocument.readinessObservation?.request?.requestId,
        "readiness request ID"
      );
      let reconstructed;
      try {
        reconstructed = createM1BOperationalBrowserRowDocuments(context);
        validateM1BOperationalBrowserRowDocuments(Object.freeze({
          runtimeDocument,
          runtimeArtifact: artifactReference(runtimeArtifact),
          auditDocument,
          auditArtifact: artifactReference(auditArtifact),
          visualArtifacts: Object.freeze(visualArtifacts)
        }), context);
      } catch (error) {
        fail(`Operational browser ${role}:${check} documents do not reconstruct: ${error.message}`);
      }
      const [runtimeBytes, auditBytes] = await Promise.all([
        readArtifactBytes(runtimeArtifact, root, MAX_JSON_BYTES),
        readArtifactBytes(auditArtifact, root, MAX_JSON_BYTES)
      ]);
      if (
        !runtimeBytes.equals(Buffer.from(
          `${JSON.stringify(reconstructed.runtimeDocument, null, 2)}\n`
        )) ||
        !auditBytes.equals(Buffer.from(
          `${JSON.stringify(reconstructed.auditDocument, null, 2)}\n`
        ))
      ) fail(`Operational browser ${role}:${check} JSON bytes are not canonical.`);
      const startedAt = Date.parse(corpus.preRiskReceipt.startedAt);
      const completedAt = Date.parse(corpus.preRiskReceipt.completedAt);
      if (
        phaseEvidence.some(({ promptIssuedAt, responseCapturedAt }) =>
          Date.parse(promptIssuedAt) < startedAt ||
          Date.parse(responseCapturedAt) > completedAt) ||
        Date.parse(row.capturedAt) > completedAt ||
        Date.parse(runtimeDocument.readinessObservation?.request?.requestedAt) <
          startedAt ||
        Date.parse(runtimeDocument.readinessObservation?.response?.respondedAt) >
          completedAt
      ) fail(`Operational browser ${role}:${check} is outside the pre-Risk window.`);
      rows.push(Object.freeze({
        row,
        runtimeDocument,
        runtimeArtifact: artifactReference(runtimeArtifact),
        auditDocument,
        auditArtifact: artifactReference(auditArtifact)
      }));
    }
  }
  if (
    rows.length !== 24 || screenshotPaths.size !== 33 ||
    screenshotDigests.size !== 33
  ) fail("Operational browser corpus is not the exact 24-row, 33-phase set.");
  return Object.freeze(rows);
}

function restartIdentityIsClosed(value) {
  return exactKeys(value, [
    "containerId",
    "imageId",
    "startedAt",
    "configHash"
  ]) && /^[0-9a-f]{12,64}$/.test(value.containerId ?? "") &&
    IMAGE_ID.test(value.imageId ?? "") && canonicalIso(value.startedAt) &&
    HASH.test(value.configHash ?? "");
}

function pendingVolumeReceipt(value) {
  return exactKeys(value, [
    "name",
    "driver",
    "createdAt",
    "scope",
    "labelsHash",
    "optionsHash",
    "destination",
    "readWrite",
    "metadataHash"
  ]) && typeof value.name === "string" && value.name !== "" &&
    typeof value.driver === "string" && value.driver !== "" &&
    canonicalIso(value.createdAt) && typeof value.scope === "string" &&
    value.scope !== "" && HASH.test(value.labelsHash ?? "") &&
    HASH.test(value.optionsHash ?? "") &&
    value.destination === "/var/lib/postgresql/data" &&
    value.readWrite === true && HASH.test(value.metadataHash ?? "");
}

export async function verifyM1BOperationalRestartArtifacts(
  evidence,
  {
    evidenceRoot,
    expectedCommitSha,
    expectedRuntimeImageId,
    corpus
  }
) {
  if (evidence.schemaVersion !== CURRENT_SCHEMA) return true;
  const root = corpus?.root ?? await realpath(resolve(evidenceRoot));
  const artifact = (id, kind) => artifactRecord(evidence, id, kind);
  const document = async (id, kind) =>
    corpus?.files?.get(id)?.document ??
      readJsonArtifact(artifact(id, kind), root);
  const pendingArtifact = artifact("operational_restart_pending", "restart_log");
  const completedArtifact = artifact("operational_restart", "restart_log");
  const linkageArtifact = artifact("operational_restart_linkage", "restart_log");
  const beforePhaseArtifact = artifact("agent_before_phase", "runtime_receipt");
  const afterPhaseArtifact = artifact("agent_after_phase", "runtime_receipt");
  const foreignArtifact = artifact(
    "agent_foreign_offer_setup",
    "postgres_receipt"
  );
  const agentBeforeArtifact = artifact("agent_before", "runtime_receipt");
  const [
    pending,
    completed,
    linkage,
    beforePhase,
    afterPhase,
    foreign,
    human,
    capitalPartner
  ] = await Promise.all([
    document(pendingArtifact.id, pendingArtifact.kind),
    document(completedArtifact.id, completedArtifact.kind),
    document(linkageArtifact.id, linkageArtifact.kind),
    document(beforePhaseArtifact.id, beforePhaseArtifact.kind),
    document(afterPhaseArtifact.id, afterPhaseArtifact.kind),
    document(foreignArtifact.id, foreignArtifact.kind),
    document("human_critical", "postgres_receipt"),
    document("capital_partner_critical", "postgres_receipt")
  ]);

  if (!exactKeys(pending, [
    "schemaVersion",
    "candidateReleaseId",
    "sourceTreeHash",
    "runtimeImageId",
    "sourceRuntime",
    "capturedAt",
    "databaseStartedAt",
    "engine",
    "volume",
    "services",
    "agentBeforeSha256",
    "agentBeforePhaseReceipt",
    "agentForeignOfferSetupArtifact",
    "containsSecrets",
    "containsRawPii",
    "containsSessionMaterial"
  ]) ||
    pending.schemaVersion !== "m1_b_operational_restart_pending.v2" ||
    pending.candidateReleaseId !== expectedCommitSha ||
    pending.sourceTreeHash !== evidence.source?.treeSha ||
    pending.runtimeImageId !== expectedRuntimeImageId ||
    pending.sourceRuntime !== "local_exact_commit" ||
    !canonicalIso(pending.capturedAt) ||
    !canonicalIso(pending.databaseStartedAt) ||
    !exactKeys(pending.engine, ["observedAt", "receipt"]) ||
    pending.engine.observedAt !== pending.capturedAt ||
    !exactKeys(pending.volume, ["name", "receipt"]) ||
    pending.volume.name !== pending.volume.receipt?.name ||
    !pendingVolumeReceipt(pending.volume.receipt) ||
    !exactKeys(pending.services, ["postgres", "pilot", "worker"]) ||
    !Object.values(pending.services).every(restartIdentityIsClosed) ||
    !SHA256.test(pending.agentBeforeSha256 ?? "") ||
    !exactKeys(pending.agentBeforePhaseReceipt, ["sha256", "completedAt"]) ||
    !SHA256.test(pending.agentBeforePhaseReceipt.sha256 ?? "") ||
    !canonicalIso(pending.agentBeforePhaseReceipt.completedAt) ||
    !exactKeys(pending.agentForeignOfferSetupArtifact, [
      "id",
      "sha256",
      "completedAt"
    ]) ||
    pending.agentForeignOfferSetupArtifact.id !== foreignArtifact.id ||
    !SHA256.test(pending.agentForeignOfferSetupArtifact.sha256 ?? "") ||
    !canonicalIso(pending.agentForeignOfferSetupArtifact.completedAt) ||
    pending.containsSecrets !== false ||
    pending.containsRawPii !== false ||
    pending.containsSessionMaterial !== false
  ) fail("Operational pending restart journal is open, unsafe, or candidate-drifted.");

  if (!exactKeys(completed, [
    "schemaVersion",
    "status",
    "candidateReleaseId",
    "sourceTreeHash",
    "runtimeImageId",
    "sourceRuntime",
    "pendingJournalSha256",
    "agentBeforeSha256",
    "agentBeforePhaseReceipt",
    "agentForeignOfferSetupArtifact",
    "restartCount",
    "capturedAt",
    "beforeDatabaseStartedAt",
    "afterDatabaseStartedAt",
    "eventWindow",
    "engine",
    "volume",
    "services",
    "fixtureUsed",
    "productionFundsMoved",
    "redaction"
  ]) ||
    completed.schemaVersion !== "m1_b_restart_receipt.v2" ||
    completed.status !== "passed" ||
    completed.candidateReleaseId !== expectedCommitSha ||
    completed.sourceTreeHash !== evidence.source?.treeSha ||
    completed.runtimeImageId !== expectedRuntimeImageId ||
    completed.sourceRuntime !== "local_exact_commit" ||
    completed.pendingJournalSha256 !== pendingArtifact.sha256 ||
    completed.agentBeforeSha256 !== pending.agentBeforeSha256 ||
    completed.agentBeforeSha256 !== agentBeforeArtifact.sha256 ||
    canonicalJson(completed.agentBeforePhaseReceipt) !==
      canonicalJson(pending.agentBeforePhaseReceipt) ||
    canonicalJson(completed.agentForeignOfferSetupArtifact) !==
      canonicalJson(pending.agentForeignOfferSetupArtifact) ||
    completed.restartCount !== 1 ||
    completed.beforeDatabaseStartedAt !== pending.databaseStartedAt ||
    completed.eventWindow?.engineBeforeAt !== pending.capturedAt ||
    completed.capturedAt !== completed.eventWindow?.engineAfterAt ||
    canonicalJson(completed.engine) !== canonicalJson(pending.engine.receipt) ||
    canonicalJson(Object.fromEntries(Object.entries(completed.volume ?? {})
      .filter(([key]) => key !== "createDestroyEventCount"))) !==
      canonicalJson(pending.volume.receipt) ||
    !Array.isArray(completed.services) ||
    completed.services.length !== 3 ||
    completed.services.some(({ service, before }) =>
      canonicalJson(before) !== canonicalJson(pending.services[service])) ||
    completed.fixtureUsed !== false ||
    completed.productionFundsMoved !== false ||
    !exactKeys(completed.redaction, [
      "containsSecrets",
      "containsRawPii",
      "containsSessionMaterial",
      "containsEnvironment",
      "containsVolumeSourceOrMountpoint"
    ]) || Object.values(completed.redaction).some((value) => value !== false)
  ) fail("Operational completed restart receipt does not close its pending journal.");

  if (
    pending.agentBeforePhaseReceipt.sha256 !== beforePhaseArtifact.sha256 ||
    pending.agentBeforePhaseReceipt.completedAt !== beforePhase.completedAt ||
    pending.agentForeignOfferSetupArtifact.sha256 !== foreignArtifact.sha256 ||
    pending.agentForeignOfferSetupArtifact.completedAt !==
      foreign.createdBeforeRestartAt
  ) fail("Operational restart provenance does not bind Agent before and foreign setup.");

  const restart = Object.freeze({
    capturedAt: completed.capturedAt,
    beforeDatabaseStartedAt: completed.beforeDatabaseStartedAt,
    afterDatabaseStartedAt: completed.afterDatabaseStartedAt,
    eventWindow: completed.eventWindow,
    engine: completed.engine,
    volume: completed.volume,
    services: completed.services
  });
  let expectedLinkage;
  try {
    expectedLinkage = createM1BOperationalRestartLinkageDocument({
      candidateReleaseId: expectedCommitSha,
      sourceTreeHash: evidence.source.treeSha,
      runtimeImageId: expectedRuntimeImageId,
      databaseStartedAt: completed.afterDatabaseStartedAt,
      restart,
      restartPendingArtifact: artifactReference(pendingArtifact),
      restartArtifact: artifactReference(completedArtifact),
      supportingArtifacts: [
        artifactReference(beforePhaseArtifact),
        artifactReference(afterPhaseArtifact),
        artifactReference(foreignArtifact)
      ]
    });
  } catch (error) {
    fail(`Operational restart context cannot be reconstructed: ${error.message}`);
  }
  if (canonicalJson(linkage) !== canonicalJson(expectedLinkage)) {
    fail("Operational restart linkage differs from pending, completed, and Agent receipts.");
  }
  try {
    validateM1BAgentAcceptanceChronology({
      beforePhase,
      restart,
      afterPhase,
      humanCapturedAt: human.capturedAt,
      capitalPartnerCapturedAt: capitalPartner.capturedAt,
      riskCapturedAt: corpus?.risk?.capturedAt
    });
  } catch (error) {
    fail(`Operational restart and role chronology is invalid: ${error.message}`);
  }
  return Object.freeze({ pending, completed, linkage, restart });
}

function expectedExactSourceDefinitions() {
  const definitions = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS.filter(
    ({ sourceMode }) => sourceMode !== "live_post_restart"
  );
  if (
    definitions.length !== 12 ||
    definitions.filter(({ sourceMode }) =>
      sourceMode === "exact_source_disposable_postgres").length !== 10 ||
    definitions.filter(({ sourceMode }) =>
      sourceMode === "exact_source_ui_binding").length !== 1 ||
    definitions.filter(({ sourceMode }) =>
      sourceMode === "exact_source_transport").length !== 1
  ) fail("The operational exact-source negative registry is not the closed 10/1/1 set.");
  return definitions;
}

export async function verifyM1BExactSourceNegativeProofArtifactPair({
  proofArtifact,
  tapArtifact,
  evidenceRoot,
  expectedCommitSha,
  expectedTreeSha,
  expectedRuntimeImageId,
  expectedDefinition
}) {
  const root = await realpath(resolve(evidenceRoot));
  const [proof, tapBytes] = await Promise.all([
    readJsonArtifact(proofArtifact, root),
    readArtifactBytes(tapArtifact, root, MAX_TAP_BYTES)
  ]);
  let rebuilt;
  try {
    assertM1BOperationalNegativeSafeValue(proof, "negativeSourceProof");
    const run = await createM1BOperationalExactSourceRunFromTap({
      definition: expectedDefinition,
      candidateReleaseId: expectedCommitSha,
      sourceTreeHash: expectedTreeSha,
      runtimeImageId: expectedRuntimeImageId,
      tapBytes,
      exitCode: 0,
      sourceFiles: proof?.sourceEvidence?.sourceFiles
    });
    rebuilt = createM1BOperationalExactSourceNegativeProof(run);
  } catch (error) {
    fail(
      `Operational proof ${proofArtifact.id} cannot be reconstructed from its exact TAP and candidate source: ${error.message}`
    );
  }
  if (canonicalJson(rebuilt) !== canonicalJson(proof)) {
    fail(`Operational proof ${proofArtifact.id} differs from its TAP-derived proof.`);
  }
  return Object.freeze({ proof, tapSha256: tapArtifact.sha256 });
}

function validateExecutionManifest({
  manifest,
  receipt,
  definitions,
  expectedCommitSha,
  expectedTreeSha
}) {
  if (!exactKeys(manifest, [
    "schemaVersion",
    "candidateReleaseId",
    "sourceTreeHash",
    "runtimeImageId",
    "capturedAt",
    "postgres",
    "exactCandidateRunner",
    "cases",
    "caseCount",
    "productionFundsMoved",
    "redaction"
  ])) fail("Exact-source negative execution manifest has an open or incomplete shape.");
  const postgres = manifest.postgres;
  const runner = manifest.exactCandidateRunner;
  if (
    manifest.schemaVersion !== "m1_b_negative_exact_source_execution_manifest.v2" ||
    manifest.candidateReleaseId !== expectedCommitSha ||
    manifest.sourceTreeHash !== expectedTreeSha ||
    manifest.runtimeImageId !== receipt.runtimeImageId ||
    !canonicalIso(manifest.capturedAt) ||
    Date.parse(manifest.capturedAt) < Date.parse(receipt.startedAt) ||
    Date.parse(manifest.capturedAt) > Date.parse(receipt.completedAt) ||
    manifest.caseCount !== 12 ||
    manifest.productionFundsMoved !== false ||
    !redactionIsClosed(manifest.redaction) ||
    !exactKeys(postgres, [
      "imageReference",
      "imageId",
      "containerIdHash",
      "networkIdHash",
      "volumeNameHash",
      "databaseName",
      "databaseStartedAt",
      "publishedPortCount",
      "retainedRuntimeAttached",
      "internallyGeneratedCredentialsRemoved",
      "containerRemoved",
      "volumeRemoved",
      "networkRemoved"
    ]) ||
    postgres.imageReference !== POSTGRES_IMAGE ||
    !IMAGE_ID.test(postgres.imageId ?? "") ||
    !HASH.test(postgres.containerIdHash ?? "") ||
    !HASH.test(postgres.networkIdHash ?? "") ||
    !HASH.test(postgres.volumeNameHash ?? "") ||
    postgres.databaseName !== "ipo_one_m1b_negative_test" ||
    !canonicalIso(postgres.databaseStartedAt) ||
    Date.parse(postgres.databaseStartedAt) < Date.parse(receipt.startedAt) ||
    Date.parse(postgres.databaseStartedAt) > Date.parse(manifest.capturedAt) ||
    postgres.publishedPortCount !== 0 ||
    postgres.retainedRuntimeAttached !== false ||
    postgres.internallyGeneratedCredentialsRemoved !== true ||
    postgres.containerRemoved !== true ||
    postgres.volumeRemoved !== true ||
    postgres.networkRemoved !== true ||
    !exactKeys(runner, [
      "imageId",
      "readOnlyRootFilesystem",
      "capDropAll",
      "noNewPrivileges",
      "exactArchiveReadOnlyMounts",
      "rawTapPersistedPerCase"
    ]) ||
    runner.imageId !== receipt.runtimeImageId ||
    runner.readOnlyRootFilesystem !== true ||
    runner.capDropAll !== true ||
    runner.noNewPrivileges !== true ||
    canonicalJson(runner.exactArchiveReadOnlyMounts) !==
      canonicalJson(EXACT_SOURCE_MOUNTS) ||
    runner.rawTapPersistedPerCase !== true ||
    !Array.isArray(manifest.cases) ||
    manifest.cases.length !== definitions.length
  ) fail("Exact-source negative execution manifest is not exact-candidate isolated Evidence.");
}

function validateRunReceipt({
  receipt,
  evidence,
  expectedCommitSha,
  definitions
}) {
  if (!exactKeys(receipt, [
    "schemaVersion",
    "status",
    "candidateReleaseId",
    "sourceTreeHash",
    "runtimeImageId",
    "sourceRuntime",
    "databaseStartedAt",
    "retainedPrimaryOrigin",
    "startedAt",
    "completedAt",
    "producerOwnedClock",
    "prerequisites",
    "exactSourceExecutionArtifact",
    "cases",
    "exactSourceCaseCount",
    "boundArtifactCount",
    "sealedFileCount",
    "fixtureUsed",
    "productionFundsMoved",
    "redaction"
  ])) fail("Exact-source negative-run receipt has an open or incomplete shape.");
  const afterDatabaseStartedAt =
    evidence.runtime?.local?.agentAcceptance?.afterRestart?.databaseStartedAt;
  if (
    receipt.schemaVersion !== "m1_b_operational_exact_source_negative_run_receipt.v2" ||
    receipt.status !== "exact_source_negative_run_passed" ||
    receipt.candidateReleaseId !== expectedCommitSha ||
    receipt.sourceTreeHash !== evidence.source?.treeSha ||
    !IMAGE_ID.test(receipt.runtimeImageId ?? "") ||
    receipt.sourceRuntime !== "local_exact_commit" ||
    receipt.databaseStartedAt !== afterDatabaseStartedAt ||
    receipt.retainedPrimaryOrigin !== evidence.runtime?.local?.origins?.human ||
    !canonicalIso(receipt.startedAt) ||
    !canonicalIso(receipt.completedAt) ||
    Date.parse(receipt.startedAt) <= Date.parse(receipt.databaseStartedAt ?? "") ||
    Date.parse(receipt.completedAt) <= Date.parse(receipt.startedAt) ||
    receipt.producerOwnedClock !== true ||
    !Array.isArray(receipt.prerequisites) ||
    receipt.prerequisites.length !== 5 ||
    !Array.isArray(receipt.cases) ||
    receipt.cases.length !== definitions.length ||
    receipt.exactSourceCaseCount !== 12 ||
    receipt.boundArtifactCount !== 25 ||
    receipt.sealedFileCount !== 26 ||
    receipt.fixtureUsed !== false ||
    receipt.productionFundsMoved !== false ||
    !redactionIsClosed(receipt.redaction)
  ) fail("Exact-source negative-run receipt does not prove a private post-restart pre-Risk run.");
}

export async function verifyM1BExactSourceNegativeRunArtifacts(
  evidence,
  { evidenceRoot, expectedCommitSha }
) {
  if (evidence.schemaVersion !== CURRENT_SCHEMA) return true;
  if (!SHA.test(expectedCommitSha ?? "") || evidence.source?.commitSha !== expectedCommitSha) {
    fail("Exact-source negative-run verification requires the exact candidate commit.");
  }
  const expectedTreeSha = evidence.source?.treeSha;
  if (!SHA.test(expectedTreeSha ?? "")) {
    fail("Exact-source negative-run verification requires the exact candidate tree SHA.");
  }
  const root = await realpath(resolve(evidenceRoot));
  const definitions = expectedExactSourceDefinitions();
  const receiptArtifact = artifactRecord(
    evidence,
    "operational_negative_run",
    "negative_receipt"
  );
  const executionArtifact = artifactRecord(
    evidence,
    "operational_negative_exact_source_execution",
    "runtime_receipt"
  );
  const [receipt, manifest] = await Promise.all([
    readJsonArtifact(receiptArtifact, root),
    readJsonArtifact(executionArtifact, root)
  ]);
  validateRunReceipt({ receipt, evidence, expectedCommitSha, definitions });
  validateExecutionManifest({
    manifest,
    receipt,
    definitions,
    expectedCommitSha,
    expectedTreeSha
  });
  if (!exactArtifactReference(
    receipt.exactSourceExecutionArtifact,
    executionArtifact,
    "runtime_receipt"
  )) fail("Negative-run receipt does not bind its exact execution manifest artifact.");

  const expectedPrerequisites = [
    ["operational_restart", "restart_log"],
    ["agent_after", "runtime_receipt"],
    ["agent_after_phase", "runtime_receipt"],
    ["human_critical", "postgres_receipt"],
    ["capital_partner_critical", "postgres_receipt"]
  ];
  const prerequisiteArtifacts = [];
  for (const [index, [id, kind]] of expectedPrerequisites.entries()) {
    const artifact = artifactRecord(evidence, id, kind);
    prerequisiteArtifacts.push(artifact);
    if (!exactArtifactReference(receipt.prerequisites[index], artifact, kind)) {
      fail(`Negative-run receipt prerequisite ${id} is not digest-bound.`);
    }
  }
  await Promise.all(prerequisiteArtifacts.map((artifact) =>
    readArtifactBytes(artifact, root, MAX_JSON_BYTES)));

  const proofs = [];
  const runnerContainerIdHashes = new Set();
  for (const [index, definition] of definitions.entries()) {
    const receiptCase = receipt.cases[index];
    const manifestCase = manifest.cases[index];
    if (
      !exactKeys(receiptCase, [
        "group",
        "id",
        "sourceMode",
        "caseDefinitionHash",
        "capturedAt",
        "proofArtifact",
        "tapArtifact"
      ]) ||
      !exactKeys(manifestCase, [
        "group",
        "id",
        "sourceMode",
        "caseDefinitionHash",
        "runnerContainerIdHash",
        "tapArtifact"
      ]) ||
      !exactKeys(manifestCase.tapArtifact, ["id", "sha256"]) ||
      receiptCase.group !== definition.group ||
      receiptCase.id !== definition.id ||
      receiptCase.sourceMode !== definition.sourceMode ||
      receiptCase.caseDefinitionHash !== definition.caseDefinitionHash ||
      manifestCase.group !== definition.group ||
      manifestCase.id !== definition.id ||
      manifestCase.sourceMode !== definition.sourceMode ||
      manifestCase.caseDefinitionHash !== definition.caseDefinitionHash ||
      !HASH.test(manifestCase.runnerContainerIdHash ?? "") ||
      !canonicalIso(receiptCase.capturedAt) ||
      Date.parse(receiptCase.capturedAt) < Date.parse(receipt.startedAt) ||
      Date.parse(receiptCase.capturedAt) > Date.parse(receipt.completedAt)
    ) fail(`Exact-source negative case ${definition.group}:${definition.id} is not registry-bound.`);
    if (runnerContainerIdHashes.has(manifestCase.runnerContainerIdHash)) {
      fail("Exact-source negative cases reuse one runner container identity.");
    }
    runnerContainerIdHashes.add(manifestCase.runnerContainerIdHash);
    const proofId = `negative_source_proof_${definition.group}_${definition.id}`
      .replace(/[^a-z0-9_]/g, "_");
    const tapId = `negative_tap_${definition.group}_${definition.id}`
      .replace(/[^a-z0-9_]/g, "_");
    const proofArtifact = artifactRecord(evidence, proofId, "negative_source_proof");
    const tapArtifact = artifactRecord(evidence, tapId, "tap_log");
    if (
      !exactArtifactReference(
        receiptCase.proofArtifact,
        proofArtifact,
        "negative_source_proof"
      ) ||
      !exactArtifactReference(receiptCase.tapArtifact, tapArtifact, "tap_log") ||
      manifestCase.tapArtifact.id !== tapArtifact.id ||
      manifestCase.tapArtifact.sha256 !== tapArtifact.sha256
    ) fail(`Exact-source negative case ${definition.group}:${definition.id} has a broken artifact link.`);
    const result = await verifyM1BExactSourceNegativeProofArtifactPair({
      proofArtifact,
      tapArtifact,
      evidenceRoot: root,
      expectedCommitSha,
      expectedTreeSha,
      expectedRuntimeImageId: receipt.runtimeImageId,
      expectedDefinition: definition
    });
    if (
      result.proof.capturedAt !== receiptCase.capturedAt ||
      result.proof.sourceEvidence?.tapSha256 !== tapArtifact.sha256
    ) fail(`Exact-source negative case ${definition.group}:${definition.id} has drifted chronology or TAP linkage.`);
    proofs.push(result.proof);
  }
  try {
    assertM1BOperationalNegativeProofIdentifiersUnique(proofs);
  } catch (error) {
    fail(`Exact-source negative cases reuse a request, correlation, or audit identifier: ${error.message}`);
  }
  if (proofs.some(({ capturedAt }) => {
    const captured = Date.parse(capturedAt ?? "");
    return captured < Date.parse(manifest.postgres.databaseStartedAt) ||
      captured > Date.parse(manifest.capturedAt);
  })) {
    fail("Exact-source case proof is outside its disposable PostgreSQL and cleanup window.");
  }

  const prerequisiteDocuments = await Promise.all(
    prerequisiteArtifacts.slice(2).map((artifact) =>
      readJsonArtifact(artifact, root))
  );
  const [agentAfterPhase, human, capitalPartner] = prerequisiteDocuments;
  if (
    !canonicalIso(agentAfterPhase?.completedAt) ||
    !canonicalIso(human?.capturedAt) ||
    !canonicalIso(capitalPartner?.capturedAt) ||
    Date.parse(agentAfterPhase.completedAt) > Date.parse(receipt.startedAt) ||
    Date.parse(human.capturedAt) > Date.parse(receipt.startedAt) ||
    Date.parse(capitalPartner.capturedAt) > Date.parse(receipt.startedAt)
  ) fail("Exact-source negatives were not collected after Agent, Human, and Capital Partner acceptance.");
  const riskArtifact = artifactRecord(
    evidence,
    evidence.riskBoundary?.artifactId,
    "negative_receipt"
  );
  const risk = await readJsonArtifact(riskArtifact, root);
  if (!canonicalIso(risk?.capturedAt) ||
      risk?.runtimeBinding?.imageId !== receipt.runtimeImageId ||
      Date.parse(risk.capturedAt) <= Date.parse(receipt.completedAt)) {
    fail("Risk MFA boundary Evidence must be captured after the sealed exact-source negative run.");
  }
  return Object.freeze({
    runtimeImageId: receipt.runtimeImageId,
    startedAt: receipt.startedAt,
    completedAt: receipt.completedAt,
    receipt,
    manifest,
    proofs: Object.freeze(proofs),
    receiptArtifact: artifactReference(receiptArtifact),
    executionArtifact: artifactReference(executionArtifact)
  });
}

export async function verifyM1BAgentForeignOfferSetupArtifact(
  evidence,
  { evidenceRoot, expectedCommitSha, expectedRuntimeImageId }
) {
  if (evidence.schemaVersion !== CURRENT_SCHEMA) return true;
  const root = await realpath(resolve(evidenceRoot));
  const artifact = artifactRecord(
    evidence,
    "agent_foreign_offer_setup",
    "postgres_receipt"
  );
  const document = await readJsonArtifact(artifact, root);
  let receipt;
  try {
    receipt = validateM1BAgentForeignOfferSetupReceipt(document, {
      candidateReleaseId: expectedCommitSha,
      sourceTreeHash: evidence.source?.treeSha,
      runtimeImageId: expectedRuntimeImageId
    });
  } catch (error) {
    fail(`Foreign Agent offered-v1 setup receipt is invalid: ${error.message}`);
  }
  const beforeDatabaseStartedAt =
    evidence.runtime?.local?.agentAcceptance?.beforeRestart?.databaseStartedAt;
  const afterDatabaseStartedAt =
    evidence.runtime?.local?.agentAcceptance?.afterRestart?.databaseStartedAt;
  if (
    document.databaseStartedAt !== receipt.databaseStartedAt ||
    document.createdBeforeRestartAt !== receipt.createdBeforeRestartAt ||
    receipt.databaseStartedAt !== beforeDatabaseStartedAt ||
    Date.parse(receipt.createdBeforeRestartAt) >=
      Date.parse(afterDatabaseStartedAt ?? "") ||
    receipt.offer?.schemaVersion !== "credit_offer.v1"
  ) fail("Foreign Agent setup does not bind the exact pre-restart offered-v1 state.");
  return receipt;
}

export async function verifyM1BExpiredOfferSetupArtifact(
  evidence,
  {
    evidenceRoot,
    expectedCommitSha,
    expectedRuntimeImageId,
    negativeRunStartedAt
  }
) {
  if (evidence.schemaVersion !== CURRENT_SCHEMA) return true;
  const root = await realpath(resolve(evidenceRoot));
  const setupArtifact = artifactRecord(
    evidence,
    "expired_offer_setup",
    "postgres_receipt"
  );
  const capitalPartnerArtifact = artifactRecord(
    evidence,
    "capital_partner_critical",
    "postgres_receipt"
  );
  const [document, capitalPartnerReceipt] = await Promise.all([
    readJsonArtifact(setupArtifact, root),
    readJsonArtifact(capitalPartnerArtifact, root)
  ]);
  const databaseStartedAt =
    evidence.runtime?.local?.agentAcceptance?.afterRestart?.databaseStartedAt;
  let receipt;
  let expectedBinding;
  try {
    receipt = validateM1BExpiredOfferSetupReceipt(document, {
      candidateReleaseId: expectedCommitSha,
      sourceTreeHash: evidence.source?.treeSha,
      runtimeImageId: expectedRuntimeImageId,
      databaseStartedAt,
      capitalPartnerCriticalArtifact: capitalPartnerArtifact,
      expectedFixtureUsed: false
    });
    expectedBinding = createM1BExpiredOfferCriticalBinding(
      capitalPartnerReceipt,
      {
        artifactId: capitalPartnerArtifact.id,
        sha256: capitalPartnerArtifact.sha256
      }
    );
  } catch (error) {
    fail(`Expired-Offer setup receipt is invalid: ${error.message}`);
  }
  if (
    canonicalJson(receipt.criticalReceiptBinding) !==
      canonicalJson(expectedBinding) ||
    !canonicalIso(negativeRunStartedAt) ||
    Date.parse(receipt.capturedAt) >= Date.parse(negativeRunStartedAt)
  ) fail(
    "Expired-Offer setup does not bind the exact Capital Partner receipt or pre-negative chronology."
  );
  return receipt;
}

function phaseReferenceMatchesArtifact(reference, artifact) {
  return reference?.id === artifact?.id &&
    reference?.relativePath === artifact?.relativePath &&
    reference?.sha256 === artifact?.sha256;
}

function phaseExtractedMatchesArtifact(reference, phaseId, artifact) {
  return reference?.id === phaseId &&
    reference?.relativePath === artifact?.relativePath &&
    reference?.sha256 === artifact?.sha256;
}

export async function verifyM1BAgentPhaseArtifacts(
  evidence,
  {
    evidenceRoot,
    expectedCommitSha,
    expectedRuntimeImageId,
    foreignOfferSetup
  }
) {
  if (evidence.schemaVersion !== CURRENT_SCHEMA) return true;
  const root = await realpath(resolve(evidenceRoot));
  const beforeArtifact = artifactRecord(
    evidence,
    "agent_before_phase",
    "runtime_receipt"
  );
  const afterArtifact = artifactRecord(
    evidence,
    "agent_after_phase",
    "runtime_receipt"
  );
  const foreignArtifact = artifactRecord(
    evidence,
    "agent_foreign_offer_setup",
    "postgres_receipt"
  );
  const agentBeforeArtifact = artifactRecord(
    evidence,
    evidence.runtime?.local?.agentAcceptance?.beforeRestart?.acceptanceArtifactId,
    "runtime_receipt"
  );
  const agentAfterArtifact = artifactRecord(
    evidence,
    evidence.runtime?.local?.agentAcceptance?.afterRestart?.acceptanceArtifactId,
    "runtime_receipt"
  );
  const applicationMcpArtifact = artifactRecord(
    evidence,
    "agent_application_mcp",
    "agent_mcp_receipt"
  );
  const runtimeMcpArtifact = artifactRecord(
    evidence,
    "agent_runtime_mcp",
    "agent_mcp_receipt"
  );
  const recoveryArtifact = artifactRecord(
    evidence,
    "agent_recovery_receipt",
    "runtime_receipt"
  );
  const [beforeDocument, afterDocument, agentBefore, agentAfter] = await Promise.all([
    readJsonArtifact(beforeArtifact, root),
    readJsonArtifact(afterArtifact, root),
    readJsonArtifact(agentBeforeArtifact, root),
    readJsonArtifact(agentAfterArtifact, root)
  ]);
  let before;
  let after;
  try {
    before = validateM1BAgentPhaseReceipt(beforeDocument, {
      candidateReleaseId: expectedCommitSha,
      runtimeImageId: expectedRuntimeImageId,
      acceptancePhase: "before_restart",
      databaseStartedAt:
        evidence.runtime.local.agentAcceptance.beforeRestart.databaseStartedAt
    });
    after = validateM1BAgentPhaseReceipt(afterDocument, {
      candidateReleaseId: expectedCommitSha,
      runtimeImageId: expectedRuntimeImageId,
      acceptancePhase: "after_restart",
      databaseStartedAt:
        evidence.runtime.local.agentAcceptance.afterRestart.databaseStartedAt
    });
  } catch (error) {
    fail(`Agent phase receipt is invalid: ${error.message}`);
  }
  const foreignReferenceIsExact = (reference) =>
    exactKeys(reference, ["id", "relativePath", "sha256", "completedAt"]) &&
    reference.id === foreignArtifact.id &&
    reference.relativePath === foreignArtifact.relativePath &&
    reference.sha256 === foreignArtifact.sha256 &&
    reference.completedAt === foreignOfferSetup.createdBeforeRestartAt;
  const reconciliation = agentAfter.foreignOfferSetupReconciliation;
  if (
    !phaseReferenceMatchesArtifact(before.acceptanceArtifact, agentBeforeArtifact) ||
    !phaseReferenceMatchesArtifact(after.acceptanceArtifact, agentAfterArtifact) ||
    !foreignReferenceIsExact(before.foreignOfferSetupArtifact) ||
    !foreignReferenceIsExact(after.foreignOfferSetupArtifact) ||
    !foreignReferenceIsExact(agentBefore.foreignOfferSetupArtifact) ||
    !foreignReferenceIsExact(agentAfter.foreignOfferSetupArtifact) ||
    !exactKeys(reconciliation, [
      "schemaVersion",
      "databaseStartedAt",
      "observedAt",
      "references",
      "ownershipProof",
      "offer",
      "lifecycleAbsence",
      "canonicalMandateStatusAtSetup",
      "canonicalLifecycleReadOnly",
      "lifecycleMutationPerformed",
      "sandboxOnly",
      "productionFundsMoved"
    ]) ||
    reconciliation.schemaVersion !==
      "m1_b_agent_foreign_offer_reconciliation.v1" ||
    reconciliation.databaseStartedAt !== after.databaseStartedAt ||
    !canonicalIso(reconciliation.observedAt) ||
    Date.parse(reconciliation.observedAt) < Date.parse(after.databaseStartedAt) ||
    canonicalJson(reconciliation.references) !==
      canonicalJson(foreignOfferSetup.references) ||
    canonicalJson(reconciliation.ownershipProof) !==
      canonicalJson(foreignOfferSetup.ownershipProof) ||
    canonicalJson(reconciliation.offer) !== canonicalJson(foreignOfferSetup.offer) ||
    canonicalJson(reconciliation.lifecycleAbsence) !==
      canonicalJson(foreignOfferSetup.lifecycleAbsence) ||
    reconciliation.canonicalMandateStatusAtSetup !==
      foreignOfferSetup.canonicalMandateStatusAtSetup ||
    reconciliation.canonicalLifecycleReadOnly !== true ||
    reconciliation.lifecycleMutationPerformed !== false ||
    reconciliation.sandboxOnly !== true ||
    reconciliation.productionFundsMoved !== false ||
    Date.parse(before.startedAt) < Date.parse(before.databaseStartedAt) ||
    Date.parse(after.startedAt) < Date.parse(after.databaseStartedAt) ||
    Date.parse(before.completedAt) >= Date.parse(after.databaseStartedAt)
  ) fail("Agent before/after phase receipts do not bind the sealed restart lifecycle.");
  const extractedPaths = new Set();
  const extractedByPhase = new Map();
  for (const phase of [before, after]) {
    const byId = new Map();
    for (const extracted of phase.extractedArtifacts) {
      if (byId.has(extracted.id)) {
        fail("Agent phase receipt duplicates one extracted artifact ID.");
      }
      byId.set(extracted.id, extracted);
      if (extractedPaths.has(extracted.relativePath)) {
        const isSharedForeign = extracted.id === "agent_foreign_offer_setup" &&
          extracted.relativePath === foreignArtifact.relativePath;
        if (!isSharedForeign) {
          fail("Agent phase receipts reuse an extracted artifact path across phases.");
        }
      }
      extractedPaths.add(extracted.relativePath);
      await readArtifactBytes(extracted, root, MAX_JSON_BYTES);
    }
    extractedByPhase.set(phase.acceptancePhase, byId);
  }
  const beforeExtracted = extractedByPhase.get("before_restart");
  const afterExtracted = extractedByPhase.get("after_restart");
  const offerBinding = beforeExtracted?.get("offer_receipt");
  const mcpBinding = beforeExtracted?.get("mcp_receipt");
  const recoveryBinding = afterExtracted?.get("recovery_receipt");
  if (
    !phaseExtractedMatchesArtifact(
      offerBinding,
      "offer_receipt",
      applicationMcpArtifact
    ) ||
    !phaseExtractedMatchesArtifact(
      mcpBinding,
      "mcp_receipt",
      runtimeMcpArtifact
    ) ||
    !phaseExtractedMatchesArtifact(
      recoveryBinding,
      "recovery_receipt",
      recoveryArtifact
    )
  ) fail("Agent phase receipts do not bind the canonical MCP and recovery artifacts.");
  const [applicationMcp, runtimeMcp, recovery] = await Promise.all([
    readJsonArtifact(applicationMcpArtifact, root),
    readJsonArtifact(runtimeMcpArtifact, root),
    readJsonArtifact(recoveryArtifact, root)
  ]);
  if (
    canonicalJson(applicationMcp) !== canonicalJson(agentBefore.offerReceipt) ||
    canonicalJson(runtimeMcp) !== canonicalJson(agentBefore.lifecycle?.mcpReceipt) ||
    canonicalJson(recovery) !== canonicalJson(agentAfter.recoveryReceipt)
  ) fail("Agent MCP or recovery artifact differs from its sealed Agent acceptance truth.");
  return Object.freeze({
    before,
    after,
    agentBefore,
    agentAfter,
    supportingDocuments: Object.freeze({
      agent_application_mcp: applicationMcp,
      agent_runtime_mcp: runtimeMcp,
      agent_recovery_receipt: recovery
    })
  });
}

export async function verifyM1BOperationalJourneyArtifacts(
  evidence,
  {
    evidenceRoot,
    expectedCommitSha,
    expectedRuntimeImageId,
    corpus,
    restart,
    browserRows,
    phases
  }
) {
  if (evidence.schemaVersion !== CURRENT_SCHEMA) return true;
  const root = corpus?.root ?? await realpath(resolve(evidenceRoot));
  if (
    !Array.isArray(browserRows) || browserRows.length !== 24 ||
    !phases?.agentBefore || !phases?.agentAfter || !restart?.restart
  ) fail("Operational journey verification lacks parsed source receipts.");
  const artifact = (id, kind) => artifactRecord(evidence, id, kind);
  const releaseIdentity = artifact("release_identity", "release_identity");
  const restartArtifact = artifact("operational_restart", "restart_log");
  const criticalArtifacts = Object.freeze([
    artifact("release_identity", "release_identity"),
    artifact("agent_before", "runtime_receipt"),
    artifact("agent_after", "runtime_receipt"),
    artifact("human_critical", "postgres_receipt"),
    artifact("capital_partner_critical", "postgres_receipt")
  ].map(artifactReference));
  const supportingArtifacts = Object.freeze([
    artifact("agent_application_mcp", "agent_mcp_receipt"),
    artifact("agent_runtime_mcp", "agent_mcp_receipt")
  ].map(artifactReference));
  const criticalDocuments = Object.freeze({
    agent_before: phases.agentBefore,
    agent_after: phases.agentAfter,
    human_critical: corpus.files.get("human_critical")?.document,
    capital_partner_critical:
      corpus.files.get("capital_partner_critical")?.document
  });
  if (
    !criticalDocuments.human_critical ||
    !criticalDocuments.capital_partner_critical
  ) fail("Operational journey critical documents are missing.");
  const browserAuditRecords = Object.freeze(browserRows.map((entry) =>
    Object.freeze({
      artifact: entry.auditArtifact,
      document: entry.auditDocument
    })));
  const receipts = {};
  const receiptArtifacts = {};
  for (const role of M1_B_OPERATIONAL_ROLES) {
    const receiptArtifact = artifact(
      `journey_${role}_receipt`,
      "runtime_receipt"
    );
    receiptArtifacts[role] = receiptArtifact;
    receipts[role] = corpus.files.get(receiptArtifact.id)?.document ??
      await readJsonArtifact(receiptArtifact, root);
  }
  const reconciledAt = receipts.human?.derivation?.reconciledAt;
  const context = Object.freeze({
    candidateReleaseId: expectedCommitSha,
    sourceTreeHash: evidence.source?.treeSha,
    runtimeImageId: expectedRuntimeImageId,
    databaseStartedAt: corpus.databaseStartedAt,
    criticalDocuments,
    criticalArtifacts,
    supportingArtifacts,
    browserAuditRecords,
    restart: restart.restart,
    restartArtifact: artifactReference(restartArtifact),
    releaseIdentityArtifact: artifactReference(releaseIdentity),
    reconciledAt
  });
  let reconstructed;
  try {
    reconstructed = createM1BOperationalJourneyReceipts(context);
    validateM1BOperationalJourneyReceipts(
      Object.freeze({
        human: receipts.human,
        principal_agent: receipts.principal_agent,
        capital_partner: receipts.capital_partner
      }),
      context
    );
  } catch (error) {
    fail(`Operational journey receipts do not reconstruct: ${error.message}`);
  }
  const startedAt = Date.parse(corpus.preRiskReceipt.startedAt);
  const completedAt = Date.parse(corpus.preRiskReceipt.completedAt);
  if (
    !canonicalIso(reconciledAt) ||
    Date.parse(reconciledAt) < startedAt ||
    Date.parse(reconciledAt) > completedAt
  ) fail("Operational journey reconciliation is outside the pre-Risk window.");
  for (const role of M1_B_OPERATIONAL_ROLES) {
    const bytes = await readArtifactBytes(
      receiptArtifacts[role],
      root,
      MAX_JSON_BYTES
    );
    if (!bytes.equals(Buffer.from(
      `${JSON.stringify(reconstructed[role], null, 2)}\n`
    ))) fail(`Operational ${role} journey bytes are not canonical.`);
  }
  return Object.freeze(reconstructed);
}

function compactArtifactLink(artifact) {
  return Object.freeze({ id: artifact.id, sha256: artifact.sha256 });
}

function expectedLiveNegativeContext({
  definition,
  evidence,
  corpus,
  foreignOfferSetup,
  expiredOfferSetup
}) {
  const link = (id, kind) => compactArtifactLink(
    artifactRecord(evidence, id, kind)
  );
  const common = {
    candidateReleaseId: evidence.source.commitSha,
    sourceTreeHash: evidence.source.treeSha,
    runtimeImageId: corpus.runtimeImageId,
    databaseStartedAt: corpus.databaseStartedAt,
    group: definition.group,
    id: definition.id
  };
  if (definition.group === "human" && definition.id === "expired_offer") {
    return Object.freeze({
      ...common,
      supportingArtifacts: Object.freeze([
        link("human_critical", "postgres_receipt"),
        link("expired_offer_setup", "postgres_receipt")
      ]),
      resourceType: "credit_offer",
      resourceId: expiredOfferSetup?.offer?.creditOfferId,
      expectedOfferHash: expiredOfferSetup?.offer?.creditOfferHash,
      expectedTermsHash: expiredOfferSetup?.offer?.termsHash,
      disclosureRef: null,
      validUntil: expiredOfferSetup?.offer?.validUntil
    });
  }
  if (
    definition.group === "human" &&
    definition.id === "unauthorized_subject"
  ) {
    return Object.freeze({
      ...common,
      supportingArtifacts: Object.freeze([
        link("human_critical", "postgres_receipt"),
        link("agent_foreign_offer_setup", "postgres_receipt")
      ]),
      resourceType: "credit_offer",
      resourceId: foreignOfferSetup?.references?.creditOfferId,
      expectedOfferHash: foreignOfferSetup?.offer?.creditOfferHash,
      expectedTermsHash: foreignOfferSetup?.offer?.termsHash,
      disclosureRef: foreignOfferSetup?.offer?.disclosureRef,
      validUntil: foreignOfferSetup?.offer?.validUntil
    });
  }
  if (
    definition.group === "authorization" &&
    definition.id === "cross_role_private_read"
  ) {
    return Object.freeze({
      ...common,
      supportingArtifacts: Object.freeze([
        link("capital_partner_critical", "postgres_receipt"),
        link("human_critical", "postgres_receipt")
      ]),
      resourceType: "obligation",
      resourceId: corpus.files.get("human_critical")?.document
        ?.linkage?.obligationId,
      expectedOfferHash: null,
      expectedTermsHash: null,
      disclosureRef: null,
      validUntil: null
    });
  }
  fail(`Operational live negative ${definition.group}:${definition.id} is not executable.`);
}

export async function verifyM1BOperationalNegativeArtifacts(
  evidence,
  {
    evidenceRoot,
    expectedCommitSha,
    corpus,
    negativeRun,
    foreignOfferSetup,
    expiredOfferSetup
  }
) {
  if (evidence.schemaVersion !== CURRENT_SCHEMA) return true;
  const root = corpus?.root ?? await realpath(resolve(evidenceRoot));
  const sourceTreeHash = evidence.source?.treeSha;
  const availableArtifacts = Object.freeze(
    evidence.artifacts.map(artifactReference)
  );
  const definitions = M1_B_OPERATIONAL_NEGATIVE_CASE_DEFINITIONS;
  const proofByKey = new Map(
    (negativeRun?.proofs ?? []).map((proof) => [
      `${proof.group}:${proof.id}`,
      proof
    ])
  );
  const capitalPartnerArtifact = artifactRecord(
    evidence,
    "capital_partner_critical",
    "postgres_receipt"
  );
  const capitalPartner = corpus.files.get(capitalPartnerArtifact.id)?.document;
  let replacedProof;
  try {
    replacedProof = deriveM1BReplacedStaleOfferNegativeProofFromCritical({
      criticalDocument: capitalPartner,
      criticalArtifact: compactArtifactLink(capitalPartnerArtifact),
      candidateReleaseId: expectedCommitSha,
      sourceTreeHash,
      runtimeImageId: corpus.runtimeImageId,
      databaseStartedAt: corpus.databaseStartedAt
    });
    await validateM1BOperationalNegativeProof(replacedProof, {
      candidateReleaseId: expectedCommitSha,
      sourceTreeHash,
      runtimeImageId: corpus.runtimeImageId,
      databaseStartedAt: corpus.databaseStartedAt,
      availableArtifacts
    });
  } catch (error) {
    fail(`Replaced stale-Offer proof cannot be derived from CP critical Evidence: ${error.message}`);
  }
  proofByKey.set("human:replaced_stale_offer", replacedProof);

  const liveAttemptByKey = new Map();
  for (const definition of definitions.filter(
    ({ sourceMode, id }) =>
      sourceMode === "live_post_restart" && id !== "replaced_stale_offer"
  )) {
    const key = `${definition.group}:${definition.id}`;
    const attemptArtifact = artifactRecord(
      evidence,
      `negative_live_attempt_${definition.group}_${definition.id}`,
      "negative_receipt"
    );
    const proofArtifact = artifactRecord(
      evidence,
      `negative_live_source_proof_${definition.group}_${definition.id}`,
      "negative_source_proof"
    );
    const attemptReceipt = corpus.files.get(attemptArtifact.id)?.document;
    const proof = corpus.files.get(proofArtifact.id)?.document;
    const context = expectedLiveNegativeContext({
      definition,
      evidence,
      corpus,
      foreignOfferSetup,
      expiredOfferSetup
    });
    try {
      await validateM1BOperationalLiveAttemptReceipt(attemptReceipt, {
        context,
        negativeProof: proof,
        availableArtifacts
      });
    } catch (error) {
      fail(`Operational live negative ${key} does not reconstruct: ${error.message}`);
    }
    const request = attemptReceipt?.requestProjection;
    const offerCommand = request?.operationId === "pilotAcceptCreditOffer";
    const confirmation = request?.payload?.actionConfirmation;
    if (
      offerCommand && (
        request.payload?.expectedOfferHash !== context.expectedOfferHash ||
        request.payload?.expectedTermsHash !== context.expectedTermsHash ||
        !REQUEST_IDENTIFIER.test(request.idempotencyKey ?? "") ||
        confirmation?.actionType !== "accept_offer" ||
        confirmation?.resourceId !== context.resourceId ||
        confirmation?.resourceHash !== context.expectedOfferHash ||
        confirmation?.requestId !== request.requestId ||
        confirmation?.confirmationMethod !== "wallet_personal_sign" ||
        confirmation?.rawSignaturePersisted !== false ||
        confirmation?.blockchainTransactionSubmitted !== false
      )
    ) fail(`Operational live negative ${key} is not bound to its exact Offer and wallet confirmation.`);
    if (offerCommand && context.disclosureRef !== null) {
      let parsed;
      try {
        parsed = inspectM1BOperationalLiveNegativeResponse({
          requestProjection: request,
          response: attemptReceipt.outwardResponse
        }, {
          id: definition.id,
          requestId: request.requestId,
          correlationId: request.correlationId,
          resourceType: context.resourceType,
          resourceId: context.resourceId,
          expectedOfferHash: context.expectedOfferHash,
          expectedTermsHash: context.expectedTermsHash,
          disclosureRef: context.disclosureRef,
          idempotencyKey: request.idempotencyKey,
          observedAt: new Date(attemptReceipt.outwardCapturedAt)
        });
      } catch (error) {
        fail(`Operational live negative ${key} wallet request cannot be reconstructed: ${error.message}`);
      }
      if (
        parsed.requestProjectionHash !== attemptReceipt.requestProjectionHash ||
        parsed.responseHash !== attemptReceipt.outwardResponseHash ||
        parsed.capturedAt !== attemptReceipt.outwardCapturedAt
      ) fail(`Operational live negative ${key} wallet response hash is not exact.`);
    }
    const baselineAt = Date.parse(attemptReceipt?.baselineCapturedAt ?? "");
    const verificationAt = Date.parse(
      attemptReceipt?.verificationCapturedAt ?? ""
    );
    const validUntil = Date.parse(context.validUntil ?? "");
    if (
      definition.id === "expired_offer" && (
        !Number.isFinite(validUntil) ||
        !Number.isFinite(baselineAt) ||
        baselineAt < validUntil ||
        attemptReceipt.protectedStateBeforeHash !==
          expiredOfferSetup?.expiration?.protectedStateAfterHash
      )
    ) fail("Expired-Offer denial baseline does not match the sealed post-expiry protected state.");
    if (
      definition.id === "unauthorized_subject" && (
        !Number.isFinite(validUntil) ||
        !Number.isFinite(verificationAt) ||
        verificationAt >= validUntil
      )
    ) fail("Unauthorized-subject denial no longer targets the retained unexpired foreign Offer.");
    await Promise.all([
      assertCanonicalJsonArtifactBytes(
        attemptArtifact,
        root,
        attemptReceipt,
        `${key} live attempt`
      ),
      assertCanonicalJsonArtifactBytes(
        proofArtifact,
        root,
        proof,
        `${key} live source proof`
      )
    ]);
    const criticalCompletedAt = Math.max(
      Date.parse(corpus.files.get("human_critical")?.document?.capturedAt ?? ""),
      Date.parse(
        corpus.files.get("capital_partner_critical")?.document?.capturedAt ?? ""
      )
    );
    const setupCompletedAt = definition.id === "expired_offer"
      ? Date.parse(expiredOfferSetup?.capturedAt ?? "")
      : criticalCompletedAt;
    if (
      Date.parse(proof.capturedAt ?? "") >= Date.parse(negativeRun.startedAt) ||
      Date.parse(proof.capturedAt ?? "") <
        Date.parse(corpus.databaseStartedAt) ||
      !Number.isFinite(criticalCompletedAt) ||
      !Number.isFinite(setupCompletedAt) ||
      Date.parse(proof.capturedAt ?? "") <=
        Math.max(criticalCompletedAt, setupCompletedAt)
    ) fail(`Operational live negative ${key} is outside the post-restart pre-run window.`);
    proofByKey.set(key, proof);
    liveAttemptByKey.set(key, attemptArtifact);
  }

  const proofs = definitions.map((definition) => {
    const proof = proofByKey.get(`${definition.group}:${definition.id}`);
    if (!proof) {
      fail(`Operational negative ${definition.group}:${definition.id} has no source proof.`);
    }
    return proof;
  });
  try {
    assertCompleteM1BOperationalNegativeProofSet(proofs);
    assertM1BOperationalNegativeProofIdentifiersUnique(proofs);
  } catch (error) {
    fail(`Operational 16-case negative proof set is incomplete or substitutable: ${error.message}`);
  }
  if (
    Date.parse(negativeRun.completedAt) >=
      Date.parse(corpus.preRiskReceipt.startedAt) ||
    proofs.some(({ capturedAt }) =>
      Date.parse(capturedAt ?? "") >=
        Date.parse(corpus.preRiskReceipt.startedAt))
  ) fail("Operational negatives were not sealed before browser/journey collection.");

  const caseReceipts = [];
  for (const definition of definitions) {
    const key = `${definition.group}:${definition.id}`;
    const proof = proofByKey.get(key);
    const live = definition.sourceMode === "live_post_restart";
    const replaced = live && definition.id === "replaced_stale_offer";
    const sourceProofArtifact = replaced
      ? capitalPartnerArtifact
      : live
        ? artifactRecord(
            evidence,
            `negative_live_source_proof_${definition.group}_${definition.id}`,
            "negative_source_proof"
          )
        : artifactRecord(
            evidence,
            `negative_source_proof_${definition.group}_${definition.id}`,
            "negative_source_proof"
          );
    const tapArtifact = live
      ? null
      : artifactRecord(
          evidence,
          `negative_tap_${definition.group}_${definition.id}`,
          "tap_log"
        );
    const finalArtifact = artifactRecord(
      evidence,
      `negative_${definition.group}_${definition.id}`,
      "negative_receipt"
    );
    const actual = corpus.files.get(finalArtifact.id)?.document;
    let expected;
    try {
      expected = createM1BOperationalNegativeCaseReceipt({
        candidateReleaseId: expectedCommitSha,
        sourceTreeHash,
        runtimeImageId: corpus.runtimeImageId,
        databaseStartedAt: corpus.databaseStartedAt,
        proof,
        sourceProofArtifact: compactArtifactLink(sourceProofArtifact),
        liveAttemptArtifact: live && !replaced
          ? compactArtifactLink(liveAttemptByKey.get(key))
          : null,
        exactSourceExecutionArtifact: live
          ? null
          : compactArtifactLink(artifactRecord(
              evidence,
              "operational_negative_exact_source_execution",
              "runtime_receipt"
            )),
        tapArtifact: tapArtifact === null
          ? null
          : compactArtifactLink(tapArtifact)
      });
      await validateM1BOperationalNegativeCaseReceipt(actual, {
        candidateReleaseId: expectedCommitSha,
        sourceTreeHash,
        runtimeImageId: corpus.runtimeImageId,
        databaseStartedAt: corpus.databaseStartedAt,
        availableArtifacts
      });
    } catch (error) {
      fail(`Operational final negative ${key} is invalid: ${error.message}`);
    }
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      fail(`Operational final negative ${key} differs from its source proof.`);
    }
    if (!live) {
      await assertCanonicalJsonArtifactBytes(
        sourceProofArtifact,
        root,
        proof,
        `${key} exact-source proof`
      );
    }
    await assertCanonicalJsonArtifactBytes(
      finalArtifact,
      root,
      expected,
      `${key} final receipt`
    );
    caseReceipts.push(Object.freeze({
      receipt: expected,
      artifact: artifactReference(finalArtifact)
    }));
  }

  const manifestArtifact = artifactRecord(
    evidence,
    "operational_negative_cases",
    "negative_receipt"
  );
  const manifest = corpus.files.get(manifestArtifact.id)?.document;
  const releaseIdentityArtifact = artifactRecord(
    evidence,
    "release_identity",
    "release_identity"
  );
  const executionArtifact = artifactRecord(
    evidence,
    "operational_negative_exact_source_execution",
    "runtime_receipt"
  );
  let expectedManifest;
  try {
    expectedManifest = createM1BOperationalNegativeCaseManifest({
      candidateReleaseId: expectedCommitSha,
      sourceTreeHash,
      runtimeImageId: corpus.runtimeImageId,
      databaseStartedAt: corpus.databaseStartedAt,
      releaseIdentityArtifact: compactArtifactLink(releaseIdentityArtifact),
      exactSourceExecutionArtifact: compactArtifactLink(executionArtifact),
      caseReceipts
    });
    await validateM1BOperationalNegativeCaseManifest(manifest, {
      candidateReleaseId: expectedCommitSha,
      sourceTreeHash,
      runtimeImageId: corpus.runtimeImageId,
      databaseStartedAt: corpus.databaseStartedAt,
      availableArtifacts,
      caseReceipts
    });
  } catch (error) {
    fail(`Operational negative manifest is invalid: ${error.message}`);
  }
  if (canonicalJson(manifest) !== canonicalJson(expectedManifest)) {
    fail("Operational negative manifest differs from its 16 source proofs.");
  }
  await assertCanonicalJsonArtifactBytes(
    manifestArtifact,
    root,
    expectedManifest,
    "16-case negative manifest"
  );
  return Object.freeze({
    proofs: Object.freeze(proofs),
    caseReceipts: Object.freeze(caseReceipts),
    manifest: expectedManifest
  });
}

export async function verifyM1BOperationalArtifactContents(
  evidence,
  options
) {
  if (evidence.schemaVersion !== CURRENT_SCHEMA) return true;
  const corpus = await verifyM1BOperationalCorpusClosure(evidence, options);
  const restart = await verifyM1BOperationalRestartArtifacts(evidence, {
    ...options,
    expectedRuntimeImageId: corpus.runtimeImageId,
    corpus
  });
  const browserRows = await verifyM1BOperationalBrowserArtifacts(evidence, {
    ...options,
    expectedRuntimeImageId: corpus.runtimeImageId,
    corpus,
    restart
  });
  const negativeRun = await verifyM1BExactSourceNegativeRunArtifacts(
    evidence,
    options
  );
  const foreignOfferSetup = await verifyM1BAgentForeignOfferSetupArtifact(evidence, {
    ...options,
    expectedRuntimeImageId: negativeRun.runtimeImageId
  });
  const expiredOfferSetup = await verifyM1BExpiredOfferSetupArtifact(evidence, {
    ...options,
    expectedRuntimeImageId: negativeRun.runtimeImageId,
    negativeRunStartedAt: negativeRun.startedAt
  });
  const phases = await verifyM1BAgentPhaseArtifacts(evidence, {
    ...options,
    expectedRuntimeImageId: negativeRun.runtimeImageId,
    foreignOfferSetup
  });
  await verifyM1BOperationalNegativeArtifacts(evidence, {
    ...options,
    corpus,
    negativeRun,
    foreignOfferSetup,
    expiredOfferSetup
  });
  await verifyM1BOperationalJourneyArtifacts(evidence, {
    ...options,
    expectedRuntimeImageId: negativeRun.runtimeImageId,
    corpus,
    restart,
    browserRows,
    phases
  });
  return true;
}
