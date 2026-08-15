const SHA = /^[0-9a-f]{40}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const MAXIMUM_EXCHANGE_BYTES = 256 * 1024;
const NUMBER_PATTERN = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

export const M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE = Object.freeze({
  schemaVersion: "m1_b_operational_browser_pixel_challenge.v1",
  offsetX: 8,
  offsetY: 8,
  columns: 40,
  rows: 10,
  cellSize: 8,
  locatorPrefixHex: "d391b7e5",
  locatorSuffixHex: "5aa5c33c96966969966a",
  zeroColor: "#ffffff",
  oneColor: "#000000"
});

export const M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS = Object.freeze({
  maximumBytes: 32 * 1024 * 1024,
  maximumWidth: 8_192,
  maximumHeight: 8_192,
  maximumPixels: 64 * 1024 * 1024,
  maximumMcuCount: 262_144
});

const PROMPT_KEYS = Object.freeze([
  "schemaVersion", "kind", "promptId", "candidateReleaseId",
  "sourceTreeHash", "runtimeImageId", "databaseStartedAt", "role",
  "check", "phase", "origin", "expected", "readRequest", "capture",
  "browserControl"
]);
const EXPECTED_KEYS = Object.freeze([
  "authentication", "workspaceName", "workspaceKind", "activeView",
  "privateReadSchemaVersion", "viewportClass", "navigationKind",
  "primaryActionCode", "negativeCase", "restartReceiptRequired"
]);
const CONTROL_KEYS = Object.freeze([
  "driver", "surface", "promptTransport", "executionControl",
  "responseTransport", "screenshotControl", "telemetrySource",
  "viewportPreparation", "navigationPreparation", "contextPreparation",
  "controls"
]);
const CONTROL_ELEMENT_KEYS = Object.freeze([
  "root", "promptInput", "loadButton", "contextClaimInput",
  "loadContextClaimButton", "preflightButton", "runButton",
  "captureAcknowledgementButton", "copyButton", "resetButton",
  "desktopWindowButton", "mobileWindowButton", "responseOutput", "status",
  "summary"
]);
const RESPONSE_CONTROL_KEYS = Object.freeze([
  "driver", "surface", "promptTransport", "executionControl",
  "responseTransport", "screenshotControl", "telemetrySource",
  "screenshotStatus", "contextClaim", "runtimeErrorCount",
  "unhandledRejectionCount", "measurementRequestFailureCount"
]);
const CONTEXT_CLAIM_KEYS = Object.freeze([
  "schemaVersion", "promptId", "challenge", "role", "check", "phase",
  "createdVia", "initialUrl", "topLevelContextKind", "contextHash",
  "lineageHash", "controllerObservedAt", "isolatedStorageClaimed"
]);

export const M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES = Object.freeze({
  desktop: Object.freeze(["authenticated"]),
  mobile: Object.freeze(["authenticated"]),
  reload: Object.freeze(["authenticated"]),
  fresh_browser_context: Object.freeze(["signed_out", "authenticated"]),
  back_forward: Object.freeze(["authenticated"]),
  sign_out_relogin: Object.freeze([
    "before_sign_out", "signed_out", "authenticated"
  ]),
  negative_authorization: Object.freeze(["authenticated"]),
  restart_recovery: Object.freeze(["authenticated"])
});

export const M1_B_OPERATIONAL_BROWSER_PRIVATE_READ = Object.freeze({
  human: Object.freeze({
    operationId: "pilotReadWorkspaceResume",
    schemaVersion: "tenant_workspace_resume_view.v2",
    workspaceKind: "human_borrower"
  }),
  principal_agent: Object.freeze({
    operationId: "pilotReadWorkspaceResume",
    schemaVersion: "tenant_workspace_resume_view.v2",
    workspaceKind: "principal_controller"
  }),
  capital_partner: Object.freeze({
    operationId: "pilotReadCapitalPartnerSelf",
    schemaVersion: "tenant_capital_partner_self_view.v1",
    workspaceKind: "capital_partner"
  })
});

export const M1_B_OPERATIONAL_BROWSER_WORKSPACE_NAME = Object.freeze({
  human: "borrower",
  principal_agent: "controller",
  capital_partner: "capitalPartner"
});

export const M1_B_OPERATIONAL_BROWSER_NEGATIVE_CASE = Object.freeze({
  human: Object.freeze({ group: "human", id: "expired_offer" }),
  principal_agent: Object.freeze({ group: "agent", id: "revoked_mandate" }),
  capital_partner: Object.freeze({
    group: "authorization",
    id: "cross_role_private_read"
  })
});

export const M1_B_OPERATIONAL_BROWSER_CONSOLE_CONTROLS = Object.freeze({
  root: "m1bOperationalMeasurementConsole",
  promptInput: "m1bOperationalMeasurementPromptInput",
  loadButton: "m1bOperationalMeasurementLoadBtn",
  contextClaimInput: "m1bOperationalMeasurementContextClaimInput",
  loadContextClaimButton: "m1bOperationalMeasurementLoadContextClaimBtn",
  preflightButton: "m1bOperationalMeasurementPreflightBtn",
  runButton: "m1bOperationalMeasurementRunBtn",
  captureAcknowledgementButton:
    "m1bOperationalMeasurementCaptureAcknowledgementBtn",
  copyButton: "m1bOperationalMeasurementCopyBtn",
  resetButton: "m1bOperationalMeasurementResetBtn",
  desktopWindowButton: "m1bOperationalMeasurementDesktopWindowBtn",
  mobileWindowButton: "m1bOperationalMeasurementMobileWindowBtn",
  responseOutput: "m1bOperationalMeasurementResponseOutput",
  status: "m1bOperationalMeasurementStatus",
  summary: "m1bOperationalMeasurementSummary"
});

export const M1_B_OPERATIONAL_BROWSER_CONTROL_BASE = Object.freeze({
  driver: "chrome_control",
  surface: "visible_loopback_measurement_console",
  promptTransport: "visible_paste_and_load",
  executionControl: "visible_click_once",
  responseTransport: "visible_clipboard_copy_button",
  screenshotControl: "external_chrome_control_jpeg_quality_80",
  telemetrySource: "trusted_app_measurement_interval",
  controls: M1_B_OPERATIONAL_BROWSER_CONSOLE_CONTROLS
});

export class M1BOperationalBrowserConsoleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M1BOperationalBrowserConsoleError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new M1BOperationalBrowserConsoleError(code, message);
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

export function canonicalM1BOperationalBrowserJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalM1BOperationalBrowserJson).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalM1BOperationalBrowserJson(value[key])}`
  ).join(",")}}`;
}

function pixelChallengeCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pixelChallengeBitsFromHex(value) {
  const bits = [];
  for (const character of value) {
    const nibble = Number.parseInt(character, 16);
    for (let shift = 3; shift >= 0; shift -= 1) {
      bits.push((nibble >>> shift) & 1);
    }
  }
  return bits;
}

export function createM1BOperationalBrowserPixelChallengeBits(challengeHash) {
  if (!HASH.test(challengeHash ?? "")) fail(
    "operational_browser_pixel_challenge_invalid",
    "Pixel challenge hash is invalid."
  );
  const payloadHex = challengeHash.slice(2);
  const payload = new Uint8Array(32);
  for (let index = 0; index < payload.length; index += 1) {
    payload[index] = Number.parseInt(payloadHex.slice(index * 2, index * 2 + 2), 16);
  }
  const checksumHex = pixelChallengeCrc32(payload).toString(16).padStart(8, "0");
  const encodedHex =
    M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE.locatorPrefixHex +
    payloadHex +
    checksumHex +
    M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE.locatorSuffixHex;
  const bits = pixelChallengeBitsFromHex(encodedHex);
  if (
    bits.length !== M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE.columns *
      M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE.rows
  ) fail(
    "operational_browser_pixel_challenge_invalid",
    "Pixel challenge layout is invalid."
  );
  return Object.freeze(bits);
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function scanStrictJson(source, { maximumDepth, maximumKeys }) {
  let cursor = 0;
  let keyCount = 0;

  function invalid() {
    fail("operational_browser_prompt_invalid", "Measurement prompt is not strict JSON.");
  }

  function whitespace() {
    while (/[\t\n\r ]/.test(source[cursor] ?? "")) cursor += 1;
  }

  function stringToken() {
    if (source[cursor] !== '"') invalid();
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === '"') {
        cursor += 1;
        try {
          return JSON.parse(source.slice(start, cursor));
        } catch {
          invalid();
        }
      }
      if (character === "\\") {
        cursor += 1;
        const escape = source[cursor];
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(cursor + 1, cursor + 5))) {
            invalid();
          }
          cursor += 5;
          continue;
        }
        if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escape)) {
          invalid();
        }
        cursor += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) invalid();
      cursor += 1;
    }
    invalid();
  }

  function value(depth) {
    if (depth > maximumDepth) invalid();
    whitespace();
    const character = source[cursor];
    if (character === "{") return object(depth + 1);
    if (character === "[") return array(depth + 1);
    if (character === '"') return void stringToken();
    for (const literal of ["true", "false", "null"]) {
      if (source.startsWith(literal, cursor)) {
        cursor += literal.length;
        return;
      }
    }
    NUMBER_PATTERN.lastIndex = cursor;
    if (!NUMBER_PATTERN.exec(source)) invalid();
    cursor = NUMBER_PATTERN.lastIndex;
  }

  function object(depth) {
    cursor += 1;
    whitespace();
    const keys = new Set();
    if (source[cursor] === "}") {
      cursor += 1;
      return;
    }
    while (cursor < source.length) {
      whitespace();
      const key = stringToken();
      keyCount += 1;
      if (keyCount > maximumKeys || keys.has(key)) invalid();
      keys.add(key);
      whitespace();
      if (source[cursor] !== ":") invalid();
      cursor += 1;
      value(depth);
      whitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ",") invalid();
      cursor += 1;
    }
    invalid();
  }

  function array(depth) {
    cursor += 1;
    whitespace();
    if (source[cursor] === "]") {
      cursor += 1;
      return;
    }
    while (cursor < source.length) {
      value(depth);
      whitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ",") invalid();
      cursor += 1;
    }
    invalid();
  }

  whitespace();
  value(0);
  whitespace();
  if (cursor !== source.length) invalid();
}

export function parseM1BOperationalBrowserPromptText(source) {
  if (
    typeof source !== "string" || source.length === 0 ||
    byteLength(source) > MAXIMUM_EXCHANGE_BYTES
  ) fail("operational_browser_prompt_invalid", "Measurement prompt is oversized.");
  scanStrictJson(source, { maximumDepth: 12, maximumKeys: 192 });
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    fail("operational_browser_prompt_invalid", "Measurement prompt is not JSON.");
  }
  return validateM1BOperationalBrowserPromptShape(value);
}

export function validateM1BOperationalBrowserContextClaim(value, prompt) {
  validateM1BOperationalBrowserPromptShape(prompt);
  if (
    prompt.check !== "fresh_browser_context" ||
    !exactKeys(value, CONTEXT_CLAIM_KEYS) ||
    value.schemaVersion !== "m1_b_operational_browser_context_claim.v1" ||
    value.promptId !== prompt.promptId ||
    value.challenge !== prompt.capture.challenge ||
    value.role !== prompt.role || value.check !== prompt.check ||
    value.phase !== prompt.phase ||
    value.createdVia !== "chrome_control_tabs_new" ||
    value.initialUrl !== "about:blank" ||
    value.topLevelContextKind !== "fresh_top_level_browsing_context" ||
    !HASH.test(value.contextHash ?? "") || !HASH.test(value.lineageHash ?? "") ||
    !canonicalIso(value.controllerObservedAt) ||
    value.isolatedStorageClaimed !== false
  ) fail(
    "operational_browser_context_claim_invalid",
    "Fresh top-level browsing context claim is invalid."
  );
  return value;
}

export function createM1BOperationalBrowserContextLineageProjection(
  prompt,
  contextClaim
) {
  validateM1BOperationalBrowserPromptShape(prompt);
  validateM1BOperationalBrowserContextClaim(contextClaim, prompt);
  return Object.freeze({
    schemaVersion: "m1_b_operational_browser_context_lineage.v1",
    candidateReleaseId: prompt.candidateReleaseId,
    role: prompt.role,
    contextHash: contextClaim.contextHash,
    controllerObservedAt: contextClaim.controllerObservedAt,
    createdVia: contextClaim.createdVia,
    initialUrl: contextClaim.initialUrl,
    topLevelContextKind: contextClaim.topLevelContextKind
  });
}

export function parseM1BOperationalBrowserContextClaimText(source, prompt) {
  if (
    typeof source !== "string" || source.length === 0 ||
    byteLength(source) > MAXIMUM_EXCHANGE_BYTES
  ) fail(
    "operational_browser_context_claim_invalid",
    "Fresh top-level browsing context claim is oversized."
  );
  scanStrictJson(source, { maximumDepth: 5, maximumKeys: 32 });
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    fail(
      "operational_browser_context_claim_invalid",
      "Fresh top-level browsing context claim is not JSON."
    );
  }
  return validateM1BOperationalBrowserContextClaim(value, prompt);
}

function phaseAuthenticated(phase) {
  return phase !== "signed_out";
}

function viewportClass(check) {
  return check === "mobile" ? "mobile" : "desktop";
}

function navigationKind(check) {
  if (check === "reload") return "reload";
  if (check === "back_forward") return "same_document_history";
  return "navigate_or_restore";
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

function expectedControlPreparation(check) {
  return Object.freeze({
    viewportPreparation: check === "mobile"
      ? "actual_same_origin_mobile_window"
      : "actual_desktop_viewport",
    navigationPreparation: check === "reload"
      ? "reload_before_prompt_load"
      : check === "back_forward"
        ? "trusted_app_same_document_history"
        : "none",
    contextPreparation: check === "fresh_browser_context"
      ? "fresh_browser_context_required"
      : check === "sign_out_relogin"
        ? "same_context_sign_out_relogin"
        : "current_context"
  });
}

export function createM1BOperationalBrowserControl(check) {
  const preparation = expectedControlPreparation(check);
  return Object.freeze({
    driver: M1_B_OPERATIONAL_BROWSER_CONTROL_BASE.driver,
    surface: M1_B_OPERATIONAL_BROWSER_CONTROL_BASE.surface,
    promptTransport: M1_B_OPERATIONAL_BROWSER_CONTROL_BASE.promptTransport,
    executionControl: M1_B_OPERATIONAL_BROWSER_CONTROL_BASE.executionControl,
    responseTransport: M1_B_OPERATIONAL_BROWSER_CONTROL_BASE.responseTransport,
    screenshotControl: M1_B_OPERATIONAL_BROWSER_CONTROL_BASE.screenshotControl,
    telemetrySource: M1_B_OPERATIONAL_BROWSER_CONTROL_BASE.telemetrySource,
    viewportPreparation: preparation.viewportPreparation,
    navigationPreparation: preparation.navigationPreparation,
    contextPreparation: preparation.contextPreparation,
    controls: M1_B_OPERATIONAL_BROWSER_CONSOLE_CONTROLS
  });
}

function canonicalIso(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

export function validateM1BOperationalBrowserPromptShape(value) {
  const privateRead = M1_B_OPERATIONAL_BROWSER_PRIVATE_READ[value?.role];
  const phases = M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES[value?.check];
  const authenticated = phaseAuthenticated(value?.phase);
  const negativeCase = value?.check === "negative_authorization"
    ? M1_B_OPERATIONAL_BROWSER_NEGATIVE_CASE[value?.role]
    : null;
  let origin;
  try {
    origin = new URL(value?.origin);
  } catch {
    fail("operational_browser_prompt_invalid", "Measurement prompt origin is invalid.");
  }
  const roleOffset = value?.role === "human" ? 0 :
    value?.role === "principal_agent" ? 1 : 3;
  const basePort = Number(origin.port) - roleOffset;
  const expectedCaptureSuffix =
    `${value?.candidateReleaseId}.browser-capture.${value?.role}.` +
    `${value?.check}.${value?.phase}.jpg`;
  const control = createM1BOperationalBrowserControl(value?.check);
  if (
    !exactKeys(value, PROMPT_KEYS) ||
    value.schemaVersion !== "m1_b_operational_browser_measurement_prompt.v1" ||
    value.kind !== "browser_measurement_prompt" ||
    !REQUEST_ID.test(value.promptId ?? "") ||
    !SHA.test(value.candidateReleaseId ?? "") ||
    !SHA.test(value.sourceTreeHash ?? "") ||
    !IMAGE_ID.test(value.runtimeImageId ?? "") ||
    !canonicalIso(value.databaseStartedAt) || !privateRead ||
    !phases?.includes(value.phase) ||
    origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" ||
    origin.pathname !== "/" || origin.search !== "" || origin.hash !== "" ||
    !Number.isSafeInteger(basePort) || basePort < 1_024 || basePort > 65_532 ||
    origin.toString() !== value.origin ||
    !exactKeys(value.expected, EXPECTED_KEYS) ||
    !exactKeys(value.expected.authentication, ["active", "method"]) ||
    value.expected.authentication.active !== authenticated ||
    value.expected.authentication.method !== (authenticated ? "siwe" : null) ||
    value.expected.workspaceName !==
      M1_B_OPERATIONAL_BROWSER_WORKSPACE_NAME[value.role] ||
    value.expected.workspaceKind !== privateRead.workspaceKind ||
    value.expected.activeView !== activeView(value.role, value.check) ||
    value.expected.privateReadSchemaVersion !==
      (authenticated ? privateRead.schemaVersion : null) ||
    value.expected.viewportClass !== viewportClass(value.check) ||
    value.expected.navigationKind !== navigationKind(value.check) ||
    value.expected.primaryActionCode !== primaryActionCode(value.role) ||
    canonicalM1BOperationalBrowserJson(value.expected.negativeCase) !==
      canonicalM1BOperationalBrowserJson(negativeCase) ||
    value.expected.restartReceiptRequired !==
      (value.check === "restart_recovery") ||
    !exactKeys(value.capture, [
      "required", "relativePath", "mediaType", "codecProfile", "markerId",
      "challenge", "challengeHash"
    ]) || value.capture.required !== true ||
    value.capture.mediaType !== "image/jpeg" ||
    value.capture.codecProfile !== "chrome_jpeg_quality_80_baseline_420" ||
    value.capture.markerId !== "ipo-one-m1-b-measurement-marker" ||
    !REQUEST_ID.test(value.capture.challenge ?? "") ||
    !HASH.test(value.capture.challengeHash ?? "") ||
    typeof value.capture.relativePath !== "string" ||
    !/^output\/playwright\/[A-Za-z0-9][A-Za-z0-9._-]{1,127}\//.test(
      value.capture.relativePath
    ) || value.capture.relativePath.includes("..") ||
    !value.capture.relativePath.endsWith(`/${expectedCaptureSuffix}`) ||
    !exactKeys(value.browserControl, CONTROL_KEYS) ||
    !exactKeys(value.browserControl.controls, CONTROL_ELEMENT_KEYS) ||
    canonicalM1BOperationalBrowserJson(value.browserControl) !==
      canonicalM1BOperationalBrowserJson(control)
  ) fail("operational_browser_prompt_invalid", "Measurement prompt is not exact.");
  if (authenticated) {
    if (
      !exactKeys(value.readRequest, [
        "operationId", "payload", "requestId", "correlationId", "schemaVersion"
      ]) || value.readRequest.operationId !== privateRead.operationId ||
      !exactKeys(value.readRequest.payload, []) ||
      !REQUEST_ID.test(value.readRequest.requestId ?? "") ||
      !REQUEST_ID.test(value.readRequest.correlationId ?? "") ||
      value.readRequest.schemaVersion !== "tenant_protocol_request.v1"
    ) fail("operational_browser_prompt_invalid", "Measurement private read is invalid.");
  } else if (value.readRequest !== null) {
    fail(
      "operational_browser_prompt_invalid",
      "Signed-out measurement cannot carry a private read."
    );
  }
  return value;
}

export async function validateM1BOperationalBrowserPromptForPage(
  value,
  { hashCanonical, locationObject, workspaceName }
) {
  const prompt = validateM1BOperationalBrowserPromptShape(value);
  if (
    typeof hashCanonical !== "function" ||
    !locationObject ||
    typeof workspaceName !== "string"
  ) fail("operational_browser_prompt_invalid", "Measurement page binding is unavailable.");
  const challengeHash = await hashCanonical({ challenge: prompt.capture.challenge });
  if (
    challengeHash !== prompt.capture.challengeHash ||
    `${locationObject.origin}/` !== prompt.origin ||
    workspaceName !== prompt.expected.workspaceName
  ) fail("operational_browser_prompt_invalid", "Measurement page binding is invalid.");
  return prompt;
}

export function validateM1BOperationalBrowserResponseRequestId({
  expectedRequestId,
  responseRequestIdHeader
}) {
  if (
    !REQUEST_ID.test(expectedRequestId ?? "") ||
    !REQUEST_ID.test(responseRequestIdHeader ?? "") ||
    responseRequestIdHeader !== expectedRequestId
  ) fail(
    "operational_browser_measurement_transport_invalid",
    "Measurement response request ID echo is missing or mismatched."
  );
  return responseRequestIdHeader;
}

export function projectM1BOperationalBrowserPrivateRead(role, body) {
  if (role === "capital_partner") {
    return Object.freeze({
      schemaVersion: body?.schemaVersion,
      resourceType: body?.resource?.resourceType,
      serverTruth: body?.serverTruth,
      readOnly: body?.readOnly,
      fundsAuthority: body?.fundsAuthority
    });
  }
  return Object.freeze({
    schemaVersion: body?.schemaVersion,
    workspaceKind: body?.workspaceKind,
    serverTruth: body?.serverTruth,
    resourceCount: Array.isArray(body?.resources) ? body.resources.length : -1,
    continuationCount: Array.isArray(body?.continuationReceipts)
      ? body.continuationReceipts.length
      : -1,
    hasMore: body?.hasMore,
    controlledAgentCount: Array.isArray(body?.controlledAgentActorIds)
      ? body.controlledAgentActorIds.length
      : 0,
    humanOfferReviewPresent:
      body?.humanOfferReview !== undefined && body?.humanOfferReview !== null
  });
}

function validWorkspaceProjection(role, projection) {
  if (role === "capital_partner") {
    return exactKeys(projection, [
      "schemaVersion", "resourceType", "serverTruth", "readOnly", "fundsAuthority"
    ]) && projection.schemaVersion === "tenant_capital_partner_self_view.v1" &&
      projection.resourceType === "capital_partner_profile" &&
      projection.serverTruth === true && projection.readOnly === true &&
      projection.fundsAuthority === false;
  }
  return exactKeys(projection, [
    "schemaVersion", "workspaceKind", "serverTruth", "resourceCount",
    "continuationCount", "hasMore", "controlledAgentCount",
    "humanOfferReviewPresent"
  ]) && projection.schemaVersion === "tenant_workspace_resume_view.v2" &&
    projection.workspaceKind ===
      M1_B_OPERATIONAL_BROWSER_PRIVATE_READ[role]?.workspaceKind &&
    projection.serverTruth === true &&
    ["resourceCount", "continuationCount", "controlledAgentCount"].every(
      (key) => Number.isSafeInteger(projection[key]) && projection[key] >= 0
    ) && typeof projection.hasMore === "boolean" &&
    typeof projection.humanOfferReviewPresent === "boolean";
}

function visible(element) {
  return Boolean(
    element && !element.hidden &&
    typeof element.getClientRects === "function" &&
    element.getClientRects().length > 0
  );
}

function privateSurfaceSelector(role) {
  return role === "capital_partner"
    ? ".capital-partners-page"
    : "#privatePortfolioSurface";
}

function validateRuntimeBinding(prompt, authentication, runtimeState) {
  const active = prompt.expected.authentication.active;
  if (
    !plain(runtimeState) ||
    runtimeState.authenticationProfile !== "local_no_funds" ||
    typeof runtimeState.connected !== "boolean" ||
    typeof runtimeState.protectedAuthorityAvailable !== "boolean" ||
    authentication.active !== active ||
    authentication.method !== prompt.expected.authentication.method ||
    (active && (
      runtimeState.connected !== true ||
      runtimeState.protectedAuthorityAvailable !== true ||
      runtimeState.workspaceKind !== prompt.expected.workspaceKind ||
      runtimeState.authenticationMethod !== prompt.expected.authentication.method
    )) ||
    (!active && (
      runtimeState.connected !== false ||
      runtimeState.protectedAuthorityAvailable !== false
    ))
  ) fail("operational_browser_measurement_invalid", "Runtime role binding is invalid.");
}

function responseBrowserControl(
  prompt,
  telemetry,
  screenshotStatus,
  contextClaim
) {
  const source = prompt.browserControl;
  return Object.freeze({
    driver: source.driver,
    surface: source.surface,
    promptTransport: source.promptTransport,
    executionControl: source.executionControl,
    responseTransport: source.responseTransport,
    screenshotControl: source.screenshotControl,
    telemetrySource: source.telemetrySource,
    screenshotStatus,
    contextClaim,
    runtimeErrorCount: telemetry.runtimeErrorCount,
    unhandledRejectionCount: telemetry.unhandledRejectionCount,
    measurementRequestFailureCount: telemetry.measurementRequestFailureCount
  });
}

function observeRuntimeFailures(globalObject) {
  let runtimeErrorCount = 0;
  let unhandledRejectionCount = 0;
  const errorListener = () => {
    runtimeErrorCount += 1;
  };
  const rejectionListener = () => {
    unhandledRejectionCount += 1;
  };
  globalObject.addEventListener("error", errorListener);
  globalObject.addEventListener("unhandledrejection", rejectionListener);
  return Object.freeze({
    snapshot: () => Object.freeze({
      runtimeErrorCount,
      unhandledRejectionCount
    }),
    stop() {
      globalObject.removeEventListener("error", errorListener);
      globalObject.removeEventListener("unhandledrejection", rejectionListener);
    }
  });
}

function nextPaint(globalObject) {
  return new Promise((resolve) => {
    if (typeof globalObject.requestAnimationFrame === "function") {
      globalObject.requestAnimationFrame(() => resolve());
    } else {
      globalObject.setTimeout(resolve, 0);
    }
  });
}

async function historyStep(globalObject, action) {
  const hash = await new Promise((resolve, reject) => {
    let timer;
    const listener = () => {
      globalObject.clearTimeout(timer);
      resolve(globalObject.location.hash);
    };
    globalObject.addEventListener("popstate", listener, { once: true });
    timer = globalObject.setTimeout(() => {
      globalObject.removeEventListener("popstate", listener);
      reject(new M1BOperationalBrowserConsoleError(
        "operational_browser_navigation_invalid",
        "Same-document history did not settle."
      ));
    }, 2_000);
    action();
  });
  await nextPaint(globalObject);
  return hash;
}

async function measureNavigation(prompt, globalObject) {
  if (prompt.check === "back_forward") {
    const startHash = prompt.role === "capital_partner"
      ? "#capital-partners"
      : "#overview";
    const intermediateHash = prompt.role === "capital_partner"
      ? "#mainContent"
      : "#request-credit";
    globalObject.history.replaceState(
      { m1bOperationalMeasurement: true },
      "",
      startHash
    );
    globalObject.history.pushState(
      { m1bOperationalMeasurement: true },
      "",
      intermediateHash
    );
    const backHash = await historyStep(globalObject, () => globalObject.history.back());
    const forwardHash = await historyStep(
      globalObject,
      () => globalObject.history.forward()
    );
    return Object.freeze({
      kind: "same_document_history",
      startHash,
      intermediateHash,
      backHash,
      forwardHash,
      sameDocument: true
    });
  }
  const kind = globalObject.performance
    .getEntriesByType("navigation")[0]?.type ?? "navigate";
  if (prompt.check === "reload" && kind !== "reload") {
    fail(
      "operational_browser_navigation_invalid",
      "Reload measurement requires a real reload before prompt load."
    );
  }
  return Object.freeze({
    kind,
    startHash: globalObject.location.hash,
    intermediateHash: null,
    backHash: null,
    forwardHash: null,
    sameDocument: false
  });
}

function appendChallengeMarker(prompt, documentObject) {
  documentObject.getElementById(prompt.capture.markerId)?.remove();
  const specification = M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE;
  const bits = createM1BOperationalBrowserPixelChallengeBits(
    prompt.capture.challengeHash
  );
  const marker = documentObject.createElement("div");
  marker.id = prompt.capture.markerId;
  marker.textContent = "";
  marker.setAttribute("role", "status");
  marker.setAttribute(
    "aria-label",
    "M1-B machine-readable screenshot challenge marker"
  );
  Object.assign(marker.style, {
    position: "fixed",
    zIndex: "2147483647",
    left: `${specification.offsetX}px`,
    top: `${specification.offsetY}px`,
    width: `${specification.columns * specification.cellSize}px`,
    height: `${specification.rows * specification.cellSize}px`,
    display: "grid",
    gridTemplateColumns:
      `repeat(${specification.columns}, ${specification.cellSize}px)`,
    gridTemplateRows:
      `repeat(${specification.rows}, ${specification.cellSize}px)`,
    margin: "0",
    padding: "0",
    border: "0",
    borderRadius: "0",
    overflow: "hidden",
    boxSizing: "content-box",
    background: specification.zeroColor,
    opacity: "1",
    transform: "none",
    pointerEvents: "none"
  });
  for (const bit of bits) {
    const cell = documentObject.createElement("span");
    cell.setAttribute("aria-hidden", "true");
    Object.assign(cell.style, {
      display: "block",
      width: `${specification.cellSize}px`,
      height: `${specification.cellSize}px`,
      margin: "0",
      padding: "0",
      border: "0",
      background: bit === 1 ? specification.oneColor : specification.zeroColor
    });
    marker.append(cell);
  }
  documentObject.body.append(marker);
  return marker;
}

function measureDocument(prompt, documentObject, globalObject, marker) {
  const privateSurface = documentObject.querySelector(
    privateSurfaceSelector(prompt.role)
  );
  const activePanel = documentObject.querySelector("[data-view-panel].active");
  const primaryAction = documentObject.getElementById(
    prompt.expected.primaryActionCode
  );
  const privacyShield = documentObject.getElementById("signedOutPrivacyShield");
  const runtimeGate = documentObject.getElementById("authenticatedRuntimeGate");
  const clientWidth = documentObject.documentElement.clientWidth;
  return Object.freeze({
    document: Object.freeze({
      workspaceName: documentObject.querySelector(
        'meta[name="ipo-one-workspace-name"]'
      )?.content ?? "",
      activeView: activePanel?.dataset?.viewPanel ?? null,
      connectionState:
        documentObject.getElementById("connectionStatus")?.textContent?.trim() ?? "",
      privacyShieldState: visible(privacyShield) ? "visible" : "hidden",
      runtimeGateState: visible(runtimeGate) ? "visible" : "hidden",
      privateSurfaceState: visible(privateSurface) ? "visible" : "hidden",
      primaryAction: Object.freeze({
        code: prompt.expected.primaryActionCode,
        rendered: visible(primaryAction),
        enabled: Boolean(primaryAction) && !primaryAction.disabled
      }),
      dialogOpen: Boolean(documentObject.querySelector("#accessLayer:not([hidden])")),
      technicalDetailsOpenCount:
        documentObject.querySelectorAll("details[open]").length
    }),
    viewport: Object.freeze({
      class: prompt.expected.viewportClass,
      innerWidth: globalObject.innerWidth,
      innerHeight: globalObject.innerHeight,
      clientWidth,
      scrollWidth: documentObject.documentElement.scrollWidth,
      innerHeightVisible: globalObject.innerHeight > 0,
      devicePixelRatio: globalObject.devicePixelRatio,
      horizontalOverflow: documentObject.documentElement.scrollWidth > clientWidth,
      mobileMenuRendered: visible(documentObject.getElementById("mobileMenuBtn"))
    }),
    marker: Object.freeze({
      rendered: visible(marker),
      challengeHash: prompt.capture.challengeHash
    })
  });
}

function validateViewport(viewport, expectedClass) {
  if (!exactKeys(viewport, [
    "class", "innerWidth", "innerHeight", "clientWidth", "scrollWidth",
    "innerHeightVisible", "devicePixelRatio", "horizontalOverflow",
    "mobileMenuRendered"
  ])) return false;
  const integers = [
    "innerWidth", "innerHeight", "clientWidth", "scrollWidth", "devicePixelRatio"
  ];
  const physicalWidth = viewport.innerWidth * viewport.devicePixelRatio;
  const physicalHeight = viewport.innerHeight * viewport.devicePixelRatio;
  if (
    viewport.class !== expectedClass ||
    integers.some((key) => !Number.isSafeInteger(viewport[key]) || viewport[key] <= 0) ||
    viewport.innerHeightVisible !== true || viewport.horizontalOverflow !== false ||
    viewport.scrollWidth > viewport.clientWidth ||
    viewport.devicePixelRatio < 1 || viewport.devicePixelRatio > 4 ||
    physicalWidth > M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS.maximumWidth ||
    physicalHeight > M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS.maximumHeight ||
    physicalWidth * physicalHeight >
      M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS.maximumPixels ||
    Math.ceil(physicalWidth / 16) * Math.ceil(physicalHeight / 16) >
      M1_B_OPERATIONAL_BROWSER_JPEG_LIMITS.maximumMcuCount
  ) return false;
  return expectedClass === "mobile"
    ? viewport.innerWidth >= 360 && viewport.innerWidth <= 430 &&
      viewport.innerHeight >= 640 && viewport.innerHeight <= 1_200 &&
      viewport.mobileMenuRendered === true
    : viewport.innerWidth >= 1_280 && viewport.innerWidth <= 3_840 &&
      viewport.innerHeight >= 720 && viewport.innerHeight <= 2_160 &&
      viewport.mobileMenuRendered === false;
}

function validateNavigation(navigation, prompt) {
  if (!exactKeys(navigation, [
    "kind", "startHash", "intermediateHash", "backHash", "forwardHash",
    "sameDocument"
  ])) return false;
  if (prompt.check === "reload") return navigation.kind === "reload";
  if (prompt.check === "back_forward") {
    const start = prompt.role === "capital_partner"
      ? "#capital-partners"
      : "#overview";
    const intermediate = prompt.role === "capital_partner"
      ? "#mainContent"
      : "#request-credit";
    return navigation.kind === "same_document_history" &&
      navigation.startHash === start && navigation.intermediateHash === intermediate &&
      navigation.backHash === start && navigation.forwardHash === intermediate &&
      navigation.sameDocument === true;
  }
  return new Set(["navigate", "reload", "back_forward"]).has(navigation.kind);
}

export function validateM1BOperationalBrowserResponseShape(value, prompt) {
  validateM1BOperationalBrowserPromptShape(prompt);
  if (
    !exactKeys(value, [
      "schemaVersion", "promptId", "challenge", "role", "check", "phase",
      "origin", "measurement", "browserControl"
    ]) ||
    value.schemaVersion !== "m1_b_operational_browser_measurement_response.v1" ||
    value.promptId !== prompt.promptId ||
    value.challenge !== prompt.capture.challenge ||
    value.role !== prompt.role || value.check !== prompt.check ||
    value.phase !== prompt.phase || value.origin !== prompt.origin ||
    !exactKeys(value.measurement, [
      "authentication", "document", "viewport", "navigation", "privateRead",
      "marker"
    ]) ||
    !exactKeys(value.measurement.authentication, ["active", "method"]) ||
    value.measurement.authentication.active !== prompt.expected.authentication.active ||
    value.measurement.authentication.method !== prompt.expected.authentication.method ||
    !exactKeys(value.measurement.document, [
      "workspaceName", "activeView", "connectionState", "privacyShieldState",
      "runtimeGateState", "privateSurfaceState", "primaryAction", "dialogOpen",
      "technicalDetailsOpenCount"
    ]) ||
    !exactKeys(value.measurement.document.primaryAction, [
      "code", "rendered", "enabled"
    ]) ||
    value.measurement.document.workspaceName !== prompt.expected.workspaceName ||
    value.measurement.document.activeView !== prompt.expected.activeView ||
    value.measurement.document.primaryAction.code !==
      prompt.expected.primaryActionCode ||
    typeof value.measurement.document.connectionState !== "string" ||
    value.measurement.document.connectionState.length < 1 ||
    !new Set(["visible", "hidden"]).has(
      value.measurement.document.privacyShieldState
    ) ||
    !new Set(["visible", "hidden"]).has(
      value.measurement.document.runtimeGateState
    ) ||
    !new Set(["visible", "hidden"]).has(
      value.measurement.document.privateSurfaceState
    ) ||
    typeof value.measurement.document.dialogOpen !== "boolean" ||
    !Number.isSafeInteger(
      value.measurement.document.technicalDetailsOpenCount
    ) ||
    !validateViewport(value.measurement.viewport, prompt.expected.viewportClass) ||
    !validateNavigation(value.measurement.navigation, prompt) ||
    !exactKeys(value.measurement.marker, ["rendered", "challengeHash"]) ||
    value.measurement.marker.rendered !== true ||
    value.measurement.marker.challengeHash !== prompt.capture.challengeHash ||
    !exactKeys(value.browserControl, RESPONSE_CONTROL_KEYS) ||
    value.browserControl.driver !== prompt.browserControl.driver ||
    value.browserControl.surface !== prompt.browserControl.surface ||
    value.browserControl.promptTransport !== prompt.browserControl.promptTransport ||
    value.browserControl.executionControl !== prompt.browserControl.executionControl ||
    value.browserControl.responseTransport !== prompt.browserControl.responseTransport ||
    value.browserControl.screenshotControl !== prompt.browserControl.screenshotControl ||
    value.browserControl.telemetrySource !== prompt.browserControl.telemetrySource ||
    value.browserControl.screenshotStatus !==
      "external_capture_acknowledged_pending_builder_validation" ||
    value.browserControl.runtimeErrorCount !== 0 ||
    value.browserControl.unhandledRejectionCount !== 0 ||
    value.browserControl.measurementRequestFailureCount !== 0
  ) fail(
    "operational_browser_measurement_invalid",
    "Browser measurement response is invalid."
  );
  if (prompt.check === "fresh_browser_context") {
    validateM1BOperationalBrowserContextClaim(
      value.browserControl.contextClaim,
      prompt
    );
  } else if (value.browserControl.contextClaim !== null) {
    fail(
      "operational_browser_measurement_invalid",
      "Only fresh-context measurement may carry a context claim."
    );
  }
  const authenticated = prompt.expected.authentication.active;
  if (authenticated) {
    const read = value.measurement.privateRead;
    if (
      !exactKeys(read, [
        "operationId", "requestId", "correlationId", "httpStatus",
        "responseRequestId", "projection", "projectionHash"
      ]) || read.operationId !== prompt.readRequest.operationId ||
      read.requestId !== prompt.readRequest.requestId ||
      read.correlationId !== prompt.readRequest.correlationId ||
      read.httpStatus !== 200 || read.responseRequestId !== read.requestId ||
      !validWorkspaceProjection(prompt.role, read.projection) ||
      !HASH.test(read.projectionHash ?? "")
    ) fail(
      "operational_browser_measurement_invalid",
      "Private browser read is not exact."
    );
    if (
      value.measurement.document.privacyShieldState !== "hidden" ||
      value.measurement.document.runtimeGateState !== "hidden" ||
      value.measurement.document.privateSurfaceState !== "visible" ||
      value.measurement.document.connectionState !== "Secure session active" ||
      value.measurement.document.primaryAction.rendered !== true ||
      value.measurement.document.primaryAction.enabled !== true ||
      value.measurement.document.dialogOpen !== false ||
      value.measurement.document.technicalDetailsOpenCount !== 0
    ) fail(
      "operational_browser_measurement_invalid",
      "Authenticated workspace DOM is not ready."
    );
  } else if (
    value.measurement.privateRead !== null ||
    value.measurement.document.privacyShieldState !== "visible" ||
    value.measurement.document.privateSurfaceState !== "hidden" ||
    value.measurement.document.connectionState !== "Sign-in required" ||
    value.measurement.document.runtimeGateState !== "hidden" ||
    value.measurement.document.primaryAction.rendered !== false ||
    value.measurement.document.primaryAction.enabled !== false ||
    value.measurement.document.dialogOpen !== false ||
    value.measurement.document.technicalDetailsOpenCount !== 0
  ) fail(
    "operational_browser_measurement_invalid",
    "Signed-out privacy boundary is invalid."
  );
  return value;
}

function publicError(error) {
  return error instanceof M1BOperationalBrowserConsoleError
    ? error
    : new M1BOperationalBrowserConsoleError(
        "operational_browser_measurement_invalid",
        "Measurement failed closed."
      );
}

function validatePreflightSurface(prompt, measured) {
  const documentMeasurement = measured.document;
  const authenticated = prompt.expected.authentication.active;
  if (
    documentMeasurement.workspaceName !== prompt.expected.workspaceName ||
    documentMeasurement.activeView !== prompt.expected.activeView ||
    documentMeasurement.primaryAction.code !== prompt.expected.primaryActionCode ||
    !validateViewport(measured.viewport, prompt.expected.viewportClass) ||
    documentMeasurement.runtimeGateState !== "hidden" ||
    documentMeasurement.dialogOpen !== false ||
    documentMeasurement.technicalDetailsOpenCount !== 0 ||
    (authenticated && (
      documentMeasurement.connectionState !== "Secure session active" ||
      documentMeasurement.privacyShieldState !== "hidden" ||
      documentMeasurement.privateSurfaceState !== "visible" ||
      documentMeasurement.primaryAction.rendered !== true ||
      documentMeasurement.primaryAction.enabled !== true
    )) ||
    (!authenticated && (
      documentMeasurement.connectionState !== "Sign-in required" ||
      documentMeasurement.privacyShieldState !== "visible" ||
      documentMeasurement.privateSurfaceState !== "hidden" ||
      documentMeasurement.primaryAction.rendered !== false ||
      documentMeasurement.primaryAction.enabled !== false
    ))
  ) fail(
    "operational_browser_preflight_blocked",
    "The role workspace, authentication surface, or actual viewport is not ready."
  );
}

export function createM1BOperationalBrowserMeasurementController({
  globalObject,
  documentObject,
  hashCanonical,
  readAuthenticationOptions,
  tenantRead,
  getRuntimeState,
  prepareView = async () => {},
  onStateChange = () => {}
}) {
  if (
    !globalObject || !documentObject || typeof hashCanonical !== "function" ||
    typeof readAuthenticationOptions !== "function" ||
    typeof tenantRead !== "function" || typeof getRuntimeState !== "function" ||
    typeof prepareView !== "function" || typeof onStateChange !== "function"
  ) fail(
    "operational_browser_console_invalid",
    "Measurement console dependencies are invalid."
  );
  const consumedPromptIds = new Set();
  const consumedChallenges = new Set();
  let state = "idle";
  let prompt = null;
  let contextClaim = null;
  let preflight = null;
  let measurementDraft = null;
  let response = null;
  let responseText = "";
  let error = null;

  function snapshot() {
    return Object.freeze({
      state,
      prompt: prompt === null ? null : Object.freeze({
        promptId: prompt.promptId,
        role: prompt.role,
        check: prompt.check,
        phase: prompt.phase,
        challenge: prompt.capture.challenge,
        screenshotPath: prompt.capture.relativePath
      }),
      contextClaimLoaded: contextClaim !== null,
      responseText,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null
    });
  }

  function publish() {
    const value = snapshot();
    onStateChange(value);
    return value;
  }

  async function load(source) {
    if (state !== "idle") fail(
      "operational_browser_measurement_replay",
      "Reset the copied measurement before loading another prompt."
    );
    const candidate = parseM1BOperationalBrowserPromptText(source);
    const workspaceName = documentObject.querySelector(
      'meta[name="ipo-one-workspace-name"]'
    )?.content ?? "";
    await validateM1BOperationalBrowserPromptForPage(candidate, {
      hashCanonical,
      locationObject: globalObject.location,
      workspaceName
    });
    if (
      consumedPromptIds.has(candidate.promptId) ||
      consumedChallenges.has(candidate.capture.challenge)
    ) fail(
      "operational_browser_measurement_replay",
      "This measurement prompt has already been consumed."
    );
    prompt = candidate;
    state = "loaded";
    error = null;
    response = null;
    preflight = null;
    measurementDraft = null;
    contextClaim = null;
    responseText = "";
    return publish();
  }

  async function loadContextClaim(source) {
    if (
      !new Set(["loaded", "preflight_blocked"]).has(state) ||
      prompt === null || contextClaim !== null
    ) fail(
      "operational_browser_context_claim_invalid",
      "A fresh-context claim may be loaded exactly once before preflight."
    );
    const candidate = parseM1BOperationalBrowserContextClaimText(source, prompt);
    const expectedLineageHash = await hashCanonical(
      createM1BOperationalBrowserContextLineageProjection(prompt, candidate)
    );
    if (candidate.lineageHash !== expectedLineageHash) fail(
      "operational_browser_context_claim_invalid",
      "Fresh top-level browsing context lineage hash is invalid."
    );
    contextClaim = Object.freeze(candidate);
    error = null;
    state = "loaded";
    return publish();
  }

  async function preflightPage() {
    if (!new Set(["loaded", "preflight_blocked"]).has(state) || prompt === null) {
      fail(
        "operational_browser_measurement_replay",
        "Exactly one loaded prompt may be checked."
      );
    }
    state = "preflighting";
    error = null;
    publish();
    try {
      if (
        prompt.check === "fresh_browser_context" && contextClaim === null
      ) fail(
        "operational_browser_context_unsupported",
        "Fresh-context preflight requires the closed Chrome tabs.new top-level-context claim."
      );
      for (const details of documentObject.querySelectorAll("details[open]")) {
        details.removeAttribute("open");
      }
      await prepareView(prompt.expected.activeView);
      const options = await readAuthenticationOptions();
      const authentication = Object.freeze({
        active: options?.sessionActive === true,
        method: options?.sessionActive === true
          ? options?.sessionAuthenticationMethod ?? null
          : null
      });
      validateRuntimeBinding(prompt, authentication, getRuntimeState());
      const navigation = await measureNavigation(prompt, globalObject);
      const measured = measureDocument(
        prompt,
        documentObject,
        globalObject,
        null
      );
      validatePreflightSurface(prompt, measured);
      preflight = Object.freeze({ authentication, navigation });
      state = "preflight_ready";
      error = null;
      return publish();
    } catch (cause) {
      error = publicError(cause);
      state = "preflight_blocked";
      publish();
      throw error;
    }
  }

  async function run() {
    if (state !== "preflight_ready" || prompt === null || preflight === null) fail(
      "operational_browser_measurement_replay",
      "The exact prompt must pass preflight before one-shot execution."
    );
    state = "running";
    publish();
    let committed = false;
    let measurementRequestFailureCount = 0;
    const runtimeObservation = observeRuntimeFailures(globalObject);
    try {
      const options = await readAuthenticationOptions();
      const authentication = Object.freeze({
        active: options?.sessionActive === true,
        method: options?.sessionActive === true
          ? options?.sessionAuthenticationMethod ?? null
          : null
      });
      validateRuntimeBinding(prompt, authentication, getRuntimeState());
      const precommitSurface = measureDocument(
        prompt,
        documentObject,
        globalObject,
        null
      );
      validatePreflightSurface(prompt, precommitSurface);
      if (
        canonicalM1BOperationalBrowserJson(authentication) !==
          canonicalM1BOperationalBrowserJson(preflight.authentication)
      ) fail(
        "operational_browser_preflight_blocked",
        "Authentication changed after preflight."
      );
      let privateRead = null;
      if (prompt.expected.authentication.active) {
        let transport;
        committed = true;
        consumedPromptIds.add(prompt.promptId);
        consumedChallenges.add(prompt.capture.challenge);
        try {
          transport = await tenantRead(Object.freeze({
            operationId: prompt.readRequest.operationId,
            payload: Object.freeze({}),
            requestId: prompt.readRequest.requestId,
            correlationId: prompt.readRequest.correlationId
          }));
        } catch (cause) {
          measurementRequestFailureCount += 1;
          throw cause;
        }
        if (
          !plain(transport) ||
          transport.requestId !== prompt.readRequest.requestId ||
          transport.responseRequestIdHeader !== prompt.readRequest.requestId ||
          transport.correlationId !== prompt.readRequest.correlationId
        ) fail(
          "operational_browser_measurement_invalid",
          "Private read transport binding is invalid."
        );
        const projection = projectM1BOperationalBrowserPrivateRead(
          prompt.role,
          transport.result
        );
        if (!validWorkspaceProjection(prompt.role, projection)) fail(
          "operational_browser_measurement_invalid",
          "Private read projection is invalid."
        );
        privateRead = Object.freeze({
          operationId: prompt.readRequest.operationId,
          requestId: prompt.readRequest.requestId,
          correlationId: prompt.readRequest.correlationId,
          httpStatus: 200,
          responseRequestId: transport.responseRequestIdHeader,
          projection,
          projectionHash: await hashCanonical(projection)
        });
        validateRuntimeBinding(prompt, authentication, getRuntimeState());
      } else {
        committed = true;
        consumedPromptIds.add(prompt.promptId);
        consumedChallenges.add(prompt.capture.challenge);
      }
      const marker = appendChallengeMarker(prompt, documentObject);
      await nextPaint(globalObject);
      const dom = measureDocument(prompt, documentObject, globalObject, marker);
      const runtimeFailures = runtimeObservation.snapshot();
      const telemetry = Object.freeze({
        runtimeErrorCount: runtimeFailures.runtimeErrorCount,
        unhandledRejectionCount: runtimeFailures.unhandledRejectionCount,
        measurementRequestFailureCount
      });
      measurementDraft = Object.freeze({
        schemaVersion: "m1_b_operational_browser_measurement_response.v1",
        promptId: prompt.promptId,
        challenge: prompt.capture.challenge,
        role: prompt.role,
        check: prompt.check,
        phase: prompt.phase,
        origin: `${globalObject.location.origin}/`,
        measurement: Object.freeze({
          authentication,
          document: dom.document,
          viewport: dom.viewport,
          navigation: preflight.navigation,
          privateRead,
          marker: dom.marker
        }),
        telemetry
      });
      if (privateRead !== null &&
        privateRead.projectionHash !== await hashCanonical(privateRead.projection)) {
        fail(
          "operational_browser_measurement_invalid",
          "Private read projection hash is invalid."
        );
      }
      state = "capture_required";
      error = null;
      return publish();
    } catch (cause) {
      error = publicError(cause);
      state = committed ? "failed" : "preflight_blocked";
      publish();
      throw error;
    } finally {
      runtimeObservation.stop();
    }
  }

  function acknowledgeCapture() {
    if (state !== "capture_required" || measurementDraft === null) fail(
      "operational_browser_measurement_replay",
      "External screenshot capture can be acknowledged exactly once."
    );
    const { telemetry, ...draft } = measurementDraft;
    response = Object.freeze({
      ...draft,
      browserControl: responseBrowserControl(
        prompt,
        telemetry,
        "external_capture_acknowledged_pending_builder_validation",
        contextClaim
      )
    });
    validateM1BOperationalBrowserResponseShape(response, prompt);
    responseText = JSON.stringify(response);
    if (byteLength(responseText) > MAXIMUM_EXCHANGE_BYTES) fail(
      "operational_browser_measurement_invalid",
      "Measurement response is oversized."
    );
    state = "capture_acknowledged";
    return publish();
  }

  async function copy(writeText) {
    if (
      state !== "capture_acknowledged" || response === null ||
      typeof writeText !== "function"
    ) {
      fail(
        "operational_browser_measurement_replay",
        "Only one ready response may be copied."
      );
    }
    const value = responseText;
    response = null;
    responseText = "";
    measurementDraft = null;
    state = "copying";
    publish();
    try {
      await writeText(value);
      error = null;
      state = "copied";
      return publish();
    } catch (cause) {
      error = publicError(cause);
      state = "failed";
      publish();
      throw error;
    }
  }

  function reset() {
    if (!new Set(["copied", "failed", "preflight_blocked"]).has(state)) fail(
      "operational_browser_measurement_replay",
      "A response must be copied or fail closed before reset."
    );
    prompt = null;
    contextClaim = null;
    preflight = null;
    measurementDraft = null;
    response = null;
    responseText = "";
    error = null;
    documentObject.getElementById(
      "ipo-one-m1-b-measurement-marker"
    )?.remove();
    state = "idle";
    return publish();
  }

  publish();
  return Object.freeze({
    snapshot,
    load,
    loadContextClaim,
    preflight: preflightPage,
    run,
    acknowledgeCapture,
    copy,
    reset
  });
}

export function openM1BOperationalBrowserMobileWindow(globalObject) {
  const location = globalObject?.location;
  if (
    !location || location.protocol !== "http:" ||
    location.hostname !== "127.0.0.1" ||
    typeof globalObject.open !== "function"
  ) fail(
    "operational_browser_console_invalid",
    "Mobile measurement is limited to the exact loopback origin."
  );
  const target = `${location.origin}${location.pathname}${location.hash}`;
  const opened = globalObject.open(
    target,
    "_blank",
    "popup,width=390,height=720,resizable=yes,scrollbars=yes"
  );
  if (!opened) fail(
    "operational_browser_console_invalid",
    "The visible mobile measurement window was blocked."
  );
  return opened;
}

export function openM1BOperationalBrowserDesktopWindow(globalObject) {
  const location = globalObject?.location;
  if (
    !location || location.protocol !== "http:" ||
    location.hostname !== "127.0.0.1" ||
    typeof globalObject.open !== "function"
  ) fail(
    "operational_browser_console_invalid",
    "Desktop measurement is limited to the exact loopback origin."
  );
  const target = `${location.origin}${location.pathname}${location.hash}`;
  const opened = globalObject.open(
    target,
    "_blank",
    "popup,width=1440,height=900,resizable=yes,scrollbars=yes"
  );
  if (!opened) fail(
    "operational_browser_console_invalid",
    "The visible desktop measurement window was blocked."
  );
  return opened;
}

function requiredConsoleElements(documentObject) {
  const result = {};
  for (const [key, id] of Object.entries(
    M1_B_OPERATIONAL_BROWSER_CONSOLE_CONTROLS
  )) {
    const element = documentObject.getElementById(id);
    if (!element) fail(
      "operational_browser_console_invalid",
      `Measurement console control ${key} is unavailable.`
    );
    result[key] = element;
  }
  return Object.freeze(result);
}

export function installM1BOperationalBrowserMeasurementConsole({
  globalObject = globalThis,
  documentObject = globalThis.document,
  hashCanonical,
  readAuthenticationOptions,
  tenantRead,
  getRuntimeState,
  prepareView,
  announce = () => {},
  toast = () => {}
}) {
  if (
    globalObject.location.protocol !== "http:" ||
    globalObject.location.hostname !== "127.0.0.1"
  ) return null;
  const elements = requiredConsoleElements(documentObject);
  elements.root.hidden = false;
  elements.promptInput.maxLength = MAXIMUM_EXCHANGE_BYTES;
  elements.contextClaimInput.maxLength = MAXIMUM_EXCHANGE_BYTES;

  function render(snapshot) {
    const states = {
      idle: "Paste the next closed builder prompt.",
      loaded: "Prompt validated. Check role, session, navigation, and actual viewport.",
      preflighting: "Checking page preconditions without a private read…",
      preflight_ready: "Preflight passed. Run the exact one-shot measurement.",
      preflight_blocked: "Preflight blocked without consuming the prompt.",
      running: "Measuring trusted app state…",
      capture_required:
        "Marker ready. Capture the screenshot with Chrome, then acknowledge capture.",
      capture_acknowledged:
        "External JPEG capture acknowledged; the builder will validate it. Copy the response.",
      copied: "Response copied. Submit it to the waiting builder, then reset.",
      failed: "Measurement failed closed. Reset only after reviewing the prompt and page."
    };
    elements.status.textContent = states[snapshot.state];
    elements.summary.textContent = snapshot.prompt === null
      ? "No prompt loaded."
      : `${snapshot.prompt.role} · ${snapshot.prompt.check} · ` +
        `${snapshot.prompt.phase} · ${snapshot.prompt.screenshotPath}`;
    elements.responseOutput.value = snapshot.responseText;
    elements.loadButton.disabled = snapshot.state !== "idle";
    elements.loadContextClaimButton.disabled = !(
      snapshot.prompt?.check === "fresh_browser_context" &&
      new Set(["loaded", "preflight_blocked"]).has(snapshot.state) &&
      snapshot.contextClaimLoaded === false
    );
    elements.preflightButton.disabled = !new Set([
      "loaded", "preflight_blocked"
    ]).has(snapshot.state);
    elements.runButton.disabled = snapshot.state !== "preflight_ready";
    elements.captureAcknowledgementButton.disabled =
      snapshot.state !== "capture_required";
    elements.copyButton.disabled = snapshot.state !== "capture_acknowledged";
    elements.resetButton.disabled = !new Set([
      "copied", "failed", "preflight_blocked"
    ]).has(snapshot.state);
  }

  const controller = createM1BOperationalBrowserMeasurementController({
    globalObject,
    documentObject,
    hashCanonical,
    readAuthenticationOptions,
    tenantRead,
    getRuntimeState,
    prepareView,
    onStateChange: render
  });

  async function guarded(action) {
    try {
      await action();
    } catch (error) {
      toast(error?.message ?? "Measurement failed closed.", "error");
      announce(error?.message ?? "Measurement failed closed.");
    }
  }

  elements.loadButton.addEventListener("click", () => guarded(async () => {
    await controller.load(elements.promptInput.value);
    announce("M1-B measurement prompt loaded");
  }));
  elements.loadContextClaimButton.addEventListener(
    "click",
    () => guarded(async () => {
      await controller.loadContextClaim(elements.contextClaimInput.value);
      announce("Fresh top-level browsing context claim loaded");
    })
  );
  elements.preflightButton.addEventListener("click", () => guarded(async () => {
    await controller.preflight();
    announce("M1-B measurement preflight passed");
  }));
  elements.runButton.addEventListener("click", () => guarded(async () => {
    await controller.run();
    announce("M1-B measurement marker ready for external screenshot capture");
  }));
  elements.captureAcknowledgementButton.addEventListener(
    "click",
    () => guarded(async () => {
      controller.acknowledgeCapture();
      announce(
        "External JPEG screenshot acknowledged; builder validation remains pending"
      );
    })
  );
  elements.copyButton.addEventListener("click", () => guarded(async () => {
    await controller.copy((value) => globalObject.navigator.clipboard.writeText(value));
    toast("Closed measurement response copied");
    announce("M1-B measurement response copied");
  }));
  elements.resetButton.addEventListener("click", () => guarded(async () => {
    controller.reset();
    elements.promptInput.value = "";
    elements.contextClaimInput.value = "";
    elements.responseOutput.value = "";
    announce("M1-B measurement console reset");
  }));
  elements.desktopWindowButton.addEventListener("click", () => guarded(async () => {
    openM1BOperationalBrowserDesktopWindow(globalObject);
    announce("Same-origin desktop measurement window opened");
  }));
  elements.mobileWindowButton.addEventListener("click", () => guarded(async () => {
    openM1BOperationalBrowserMobileWindow(globalObject);
    announce("Same-origin mobile measurement window opened");
  }));
  render(controller.snapshot());
  return controller;
}
