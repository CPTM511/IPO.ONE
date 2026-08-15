import { createHash, randomUUID } from "node:crypto";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import {
  M1_B_OPERATIONAL_BROWSER_CONTROL_BASE,
  M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES,
  M1_B_OPERATIONAL_BROWSER_NEGATIVE_CASE,
  M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE,
  M1_B_OPERATIONAL_BROWSER_PRIVATE_READ,
  M1_B_OPERATIONAL_BROWSER_WORKSPACE_NAME,
  canonicalM1BOperationalBrowserJson,
  createM1BOperationalBrowserControl,
  createM1BOperationalBrowserContextLineageProjection,
  createM1BOperationalBrowserPixelChallengeBits,
  validateM1BOperationalBrowserPromptShape,
  validateM1BOperationalBrowserResponseShape
} from "../../web/src/m1-b-operational-browser-measurement-console.js";
export {
  validateM1BOperationalBrowserJpeg
} from "./m1-b-operational-browser-jpeg.js";

const SHA = /^[0-9a-f]{40}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
export {
  M1_B_OPERATIONAL_BROWSER_CONTROL_BASE,
  M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES,
  M1_B_OPERATIONAL_BROWSER_NEGATIVE_CASE,
  M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE,
  M1_B_OPERATIONAL_BROWSER_PRIVATE_READ,
  M1_B_OPERATIONAL_BROWSER_WORKSPACE_NAME,
  createM1BOperationalBrowserContextLineageProjection,
  createM1BOperationalBrowserPixelChallengeBits
};

export class M1BOperationalBrowserMeasurementError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BOperationalBrowserMeasurementError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BOperationalBrowserMeasurementError(code, message);
}

function plain(value) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function canonicalJson(value) {
  return canonicalM1BOperationalBrowserJson(value);
}

function manifestHash(value) {
  return `0x${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function token(prefix, random = randomUUID) {
  return `${prefix}_${random()}`;
}

function phaseIsAuthenticated(phase) {
  return phase !== "signed_out";
}

function browserRolePort(role, portBase) {
  return portBase + ({ human: 0, principal_agent: 1, capital_partner: 3 }[role]);
}

function captureRequired(phases, phase) {
  return phases.includes(phase);
}

function primaryActionCode(role) {
  return role === "capital_partner"
    ? "capitalPartnerRefreshWorkspaceBtn"
    : "privatePortfolioPrimaryBtn";
}

function activeView(role, check) {
  if (role === "capital_partner") return "capital-partners";
  return check === "back_forward" ? "request-credit" : "overview";
}

function viewportClass(check) {
  return check === "mobile" ? "mobile" : "desktop";
}

function navigationKind(check) {
  if (check === "reload") return "reload";
  if (check === "back_forward") return "same_document_history";
  return "navigate_or_restore";
}

export function validateM1BOperationalBrowserMeasurementPrompt(value) {
  let prompt;
  try {
    prompt = validateM1BOperationalBrowserPromptShape(value);
  } catch {
    fail("operational_browser_prompt_invalid", "Browser prompt is not exact.");
  }
  if (
    prompt.capture.challengeHash !== manifestHash({
      challenge: prompt.capture.challenge
    })
  ) fail("operational_browser_prompt_invalid", "Browser challenge hash is invalid.");
  return Object.freeze(prompt);
}

export function createM1BOperationalBrowserMeasurementPrompts({
  candidateReleaseId,
  sourceTreeHash,
  runtimeImageId,
  databaseStartedAt,
  portBase,
  outputRootRelativePath,
  roles,
  checks,
  random = randomUUID
}) {
  if (
    !SHA.test(candidateReleaseId ?? "") || !SHA.test(sourceTreeHash ?? "") ||
    !IMAGE_ID.test(runtimeImageId ?? "") ||
    !Number.isSafeInteger(portBase) || portBase < 1_024 || portBase > 65_532 ||
    typeof outputRootRelativePath !== "string" ||
    !/^output\/playwright\/[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/.test(
      outputRootRelativePath
    ) ||
    !Array.isArray(roles) || !Array.isArray(checks)
  ) fail("operational_browser_prompt_invalid", "Browser prompt identity is invalid.");
  const prompts = [];
  for (const role of roles) {
    const privateRead = M1_B_OPERATIONAL_BROWSER_PRIVATE_READ[role];
    if (!privateRead) fail("operational_browser_prompt_invalid", "Browser role is invalid.");
    for (const check of checks) {
      const phases = M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES[check];
      if (!phases) fail("operational_browser_prompt_invalid", "Browser check is invalid.");
      for (const phase of phases) {
        const challenge = token("m1b_browser_challenge", random);
        const promptId = token("m1b_browser_prompt", random);
        const authenticated = phaseIsAuthenticated(phase);
        const readRequest = authenticated
          ? Object.freeze({
              operationId: privateRead.operationId,
              payload: Object.freeze({}),
              requestId: token("m1b_browser_request", random),
              correlationId: token("m1b_browser_correlation", random),
              schemaVersion: "tenant_protocol_request.v1"
            })
          : null;
        const required = captureRequired(phases, phase);
        const capture = Object.freeze({
          required,
          relativePath: required
            ? `${outputRootRelativePath}/${candidateReleaseId}.browser-capture.${role}.${check}.${phase}.jpg`
            : null,
          mediaType: "image/jpeg",
          codecProfile: "chrome_jpeg_quality_80_baseline_420",
          markerId: "ipo-one-m1-b-measurement-marker",
          challenge,
          challengeHash: manifestHash({ challenge })
        });
        const base = {
          schemaVersion: "m1_b_operational_browser_measurement_prompt.v1",
          kind: "browser_measurement_prompt",
          promptId,
          candidateReleaseId,
          sourceTreeHash,
          runtimeImageId,
          databaseStartedAt,
          role,
          check,
          phase,
          origin: `http://127.0.0.1:${browserRolePort(role, portBase)}/`,
          expected: Object.freeze({
            authentication: Object.freeze({
              active: authenticated,
              method: authenticated ? "siwe" : null
            }),
            workspaceName: M1_B_OPERATIONAL_BROWSER_WORKSPACE_NAME[role],
            workspaceKind: privateRead.workspaceKind,
            activeView: activeView(role, check),
            privateReadSchemaVersion: authenticated ? privateRead.schemaVersion : null,
            viewportClass: viewportClass(check),
            navigationKind: navigationKind(check),
            primaryActionCode: primaryActionCode(role),
            negativeCase: check === "negative_authorization"
              ? M1_B_OPERATIONAL_BROWSER_NEGATIVE_CASE[role]
              : null,
            restartReceiptRequired: check === "restart_recovery"
          }),
          readRequest,
          capture,
          browserControl: createM1BOperationalBrowserControl(check)
        };
        prompts.push(validateM1BOperationalBrowserMeasurementPrompt(base));
      }
    }
  }
  for (const values of [
    prompts.map(({ promptId }) => promptId),
    prompts.map(({ capture }) => capture.challenge),
    prompts.flatMap(({ readRequest }) => readRequest === null ? [] : [readRequest.requestId]),
    prompts.flatMap(({ readRequest }) => readRequest === null ? [] : [readRequest.correlationId])
  ]) {
    if (new Set(values).size !== values.length) {
      fail("operational_browser_prompt_invalid", "Browser prompt identifiers collide.");
    }
  }
  return Object.freeze(prompts);
}

export function validateM1BOperationalBrowserMeasurementResponse(value, prompt) {
  validateM1BOperationalBrowserMeasurementPrompt(prompt);
  try {
    validateM1BOperationalBrowserResponseShape(value, prompt);
  } catch {
    fail(
      "operational_browser_measurement_invalid",
      "Browser measurement response is invalid."
    );
  }
  if (
    value.measurement.privateRead !== null &&
    value.measurement.privateRead.projectionHash !==
      manifestHash(value.measurement.privateRead.projection)
  ) fail("operational_browser_measurement_invalid", "Private browser read is not exact.");
  const contextClaim = value.browserControl.contextClaim;
  if (
    contextClaim !== null &&
    contextClaim.lineageHash !== manifestHash(
      createM1BOperationalBrowserContextLineageProjection(prompt, contextClaim)
    )
  ) fail(
    "operational_browser_measurement_invalid",
    "Fresh top-level browser context lineage hash is invalid."
  );
  return Object.freeze(value);
}

export function parseM1BOperationalBrowserMeasurementResponseLine(line, prompt) {
  if (typeof line !== "string" || Buffer.byteLength(line) > 256 * 1024) {
    fail("operational_browser_measurement_invalid", "Browser response line is oversized.");
  }
  let value;
  try {
    value = parseStrictJson(line, {
      maximumBytes: 256 * 1024,
      maximumDepth: 12,
      maximumKeys: 160
    });
  } catch {
    fail("operational_browser_measurement_invalid", "Browser response is not JSON.");
  }
  return validateM1BOperationalBrowserMeasurementResponse(value, prompt);
}

export function deriveM1BOperationalBrowserRow({ prompts, responses, capturedAt }) {
  if (!Array.isArray(prompts) || !Array.isArray(responses) || prompts.length === 0 ||
    prompts.length !== responses.length || prompts.some((prompt, index) =>
      prompt.role !== prompts[0].role || prompt.check !== prompts[0].check ||
      responsePhaseMismatch(responses[index], prompt)
    )) fail("operational_browser_measurement_invalid", "Browser row phases are incomplete.");
  const role = prompts[0].role;
  const check = prompts[0].check;
  const phases = M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES[check];
  if (prompts.some((prompt, index) => prompt.phase !== phases[index])) {
    fail("operational_browser_measurement_invalid", "Browser row phase order is invalid.");
  }
  const final = responses.at(-1);
  return Object.freeze({
    type: "browser_measurement_row",
    role,
    check,
    capturedAt,
    origin: prompts[0].origin,
    driver: final.browserControl.driver,
    phases: Object.freeze(responses.map((response, index) => Object.freeze({
      phase: response.phase,
      promptId: response.promptId,
      challenge: prompts[index].capture.challenge,
      measurement: response.measurement,
      browserControl: response.browserControl
    }))),
    measurementManifestHash: manifestHash(responses),
    negativeCase: check === "negative_authorization"
      ? M1_B_OPERATIONAL_BROWSER_NEGATIVE_CASE[role]
      : null,
    visualArtifacts: Object.freeze(prompts.map((prompt) => Object.freeze({
      phase: prompt.phase,
      kind: "screenshot",
      relativePath: prompt.capture.relativePath,
      mediaType: prompt.capture.mediaType,
      codecProfile: prompt.capture.codecProfile,
      challengeHash: prompt.capture.challengeHash
    })))
  });
}

function responsePhaseMismatch(response, prompt) {
  return response?.promptId !== prompt.promptId || response?.phase !== prompt.phase ||
    response?.role !== prompt.role || response?.check !== prompt.check;
}
