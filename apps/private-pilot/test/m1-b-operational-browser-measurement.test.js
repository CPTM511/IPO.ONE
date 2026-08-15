import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { assertTenantProtocolRequest } from "../../../packages/api-contract/src/tenant-protocol.js";
import {
  M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES,
  M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE,
  createM1BOperationalBrowserContextLineageProjection,
  createM1BOperationalBrowserMeasurementPrompts,
  createM1BOperationalBrowserPixelChallengeBits,
  deriveM1BOperationalBrowserRow,
  parseM1BOperationalBrowserMeasurementResponseLine,
  validateM1BOperationalBrowserMeasurementPrompt,
  validateM1BOperationalBrowserMeasurementResponse,
  validateM1BOperationalBrowserJpeg
} from "../src/m1-b-operational-browser-measurement.js";

const RELEASE = "a".repeat(40);
const TREE = "b".repeat(40);
const IMAGE = `sha256:${"c".repeat(64)}`;

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

function projectionHash(value) {
  return `0x${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function measurementContextClaim(prompt) {
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
    contextHash: `0x${"d".repeat(64)}`,
    lineageHash: `0x${"0".repeat(64)}`,
    controllerObservedAt: "2026-08-15T00:10:11.000Z",
    isolatedStorageClaimed: false
  };
  claim.lineageHash = projectionHash(
    createM1BOperationalBrowserContextLineageProjection(prompt, claim)
  );
  return claim;
}

function promptSet() {
  let counter = 0;
  return createM1BOperationalBrowserMeasurementPrompts({
    candidateReleaseId: RELEASE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt: "2026-08-15T00:10:10.000Z",
    portBase: 18_887,
    outputRootRelativePath: "output/playwright/m1-b-p0-5",
    roles: ["human", "principal_agent", "capital_partner"],
    checks: Object.keys(M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES),
    random: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`
  });
}

function response(prompt) {
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
        innerHeight: prompt.expected.viewportClass === "mobile" ? 720 : 720,
        clientWidth: prompt.expected.viewportClass === "mobile" ? 390 : 1280,
        scrollWidth: prompt.expected.viewportClass === "mobile" ? 390 : 1280,
        innerHeightVisible: true,
        devicePixelRatio: 1,
        horizontalOverflow: false,
        mobileMenuRendered: prompt.expected.viewportClass === "mobile"
      },
      navigation: prompt.check === "reload"
        ? {
            kind: "reload", startHash: "#overview", intermediateHash: null,
            backHash: null, forwardHash: null, sameDocument: false
          }
        : prompt.check === "back_forward"
          ? {
              kind: "same_document_history",
              startHash: prompt.role === "capital_partner"
                ? "#capital-partners"
                : "#overview",
              intermediateHash: prompt.role === "capital_partner"
                ? "#mainContent"
                : "#request-credit",
              backHash: prompt.role === "capital_partner"
                ? "#capital-partners"
                : "#overview",
              forwardHash: prompt.role === "capital_partner"
                ? "#mainContent"
                : "#request-credit",
              sameDocument: true
            }
          : {
              kind: "navigate", startHash: "#overview", intermediateHash: null,
              backHash: null, forwardHash: null, sameDocument: false
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
      marker: { rendered: true, challengeHash: prompt.capture.challengeHash }
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
      contextClaim: measurementContextClaim(prompt),
      runtimeErrorCount: 0,
      unhandledRejectionCount: 0,
      measurementRequestFailureCount: 0
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
const JPEG_AC_COUNTS = Object.freeze([0, 2, ...Array(14).fill(0)]);
const JPEG_AC_SYMBOLS = Object.freeze([0, 1]);

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

function baselineJpeg(width, height, {
  challengeHash = null,
  devicePixelRatio = 1,
  oversubscribedHuffman = false,
  completeHuffman = false,
  iccProfilePayload = null,
  markerAcNonZero = false
} = {}) {
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
    const pixelX = blockX * 8;
    const pixelY = blockY * 8;
    const column = Math.floor((pixelX - markerOffsetX) / markerCellSize);
    const row = Math.floor((pixelY - markerOffsetY) / markerCellSize);
    if (
      column < 0 || column >= specification.columns ||
      row < 0 || row >= specification.rows
    ) return -171;
    return challengeBits[row * specification.columns + column] === 1 ? -171 : 169;
  }

  function block(componentId, dc, nonzeroAc = false) {
    const difference = dc - predictors.get(componentId);
    predictors.set(componentId, dc);
    const value = jpegValueBits(difference);
    const dcCode = dcCodes.get(value.category);
    writer.write(dcCode.code, dcCode.length);
    writer.write(value.encoded, value.category);
    if (nonzeroAc) {
      const coefficient = acCodes.get(1);
      writer.write(coefficient.code, coefficient.length);
      writer.write(1, 1);
    }
    const eob = acCodes.get(0);
    writer.write(eob.code, eob.length);
  }

  for (let mcuY = 0; mcuY < Math.ceil(height / 16); mcuY += 1) {
    for (let mcuX = 0; mcuX < Math.ceil(width / 16); mcuX += 1) {
      for (let vertical = 0; vertical < 2; vertical += 1) {
        for (let horizontal = 0; horizontal < 2; horizontal += 1) {
          const blockX = mcuX * 2 + horizontal;
          const blockY = mcuY * 2 + vertical;
          block(
            1,
            lumaDc(blockX, blockY),
            markerAcNonZero &&
              blockX === specification.offsetX * devicePixelRatio / 8 &&
              blockY === specification.offsetY * devicePixelRatio / 8
          );
        }
      }
      block(2, 0);
      block(3, 0);
    }
  }

  const app0 = jpegSegment(0xe0, Buffer.from([
    0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0
  ]));
  const app2 = iccProfilePayload === null ? [] : [jpegSegment(
    0xe2,
    Buffer.concat([
      Buffer.from("ICC_PROFILE\0", "ascii"),
      Buffer.from([1, 1]),
      Buffer.from(iccProfilePayload)
    ])
  )];
  const dqt0 = jpegSegment(0xdb, Buffer.from([0, ...JPEG_Q80_LUMA]));
  const dqt1 = jpegSegment(0xdb, Buffer.from([1, ...JPEG_Q80_CHROMA]));
  const sof0 = jpegSegment(0xc0, Buffer.from([
    8, height >>> 8, height & 0xff, width >>> 8, width & 0xff, 3,
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1
  ]));
  const badCounts = [3, ...Array(15).fill(0)];
  const completeCounts = [2, ...Array(15).fill(0)];
  const dht0 = jpegDht(
    0,
    0,
    oversubscribedHuffman ? badCounts
      : completeHuffman ? completeCounts : JPEG_DC_COUNTS,
    oversubscribedHuffman ? [0, 1, 2]
      : completeHuffman ? [0, 1] : JPEG_DC_SYMBOLS
  );
  const sos = jpegSegment(0xda, Buffer.from([
    3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0
  ]));
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), app0, ...app2, dqt0, dqt1, sof0,
    dht0,
    jpegDht(1, 0, JPEG_AC_COUNTS, JPEG_AC_SYMBOLS),
    jpegDht(0, 1, JPEG_DC_COUNTS, JPEG_DC_SYMBOLS),
    jpegDht(1, 1, JPEG_AC_COUNTS, JPEG_AC_SYMBOLS),
    sos,
    writer.finish(),
    Buffer.from([0xff, 0xd9])
  ]);
}

test("closed prompts cover all 33 phases and carry contract-valid safe private reads", () => {
  const prompts = promptSet();
  assert.equal(prompts.length, 33);
  assert.equal(new Set(prompts.map(({ promptId }) => promptId)).size, 33);
  assert.equal(new Set(prompts.map(({ capture }) => capture.relativePath)).size, 33);
  assert.equal(prompts.every(({ capture, browserControl }) =>
    capture.relativePath.endsWith(".jpg") &&
    capture.mediaType === "image/jpeg" &&
    capture.codecProfile === "chrome_jpeg_quality_80_baseline_420" &&
    browserControl.screenshotControl ===
      "external_chrome_control_jpeg_quality_80"), true);
  for (const prompt of prompts.filter(({ readRequest }) => readRequest !== null)) {
    assert.equal(assertTenantProtocolRequest(prompt.readRequest).operationId, prompt.readRequest.operationId);
    assert.equal(prompt.browserControl.surface, "visible_loopback_measurement_console");
    assert.equal(prompt.browserControl.executionControl, "visible_click_once");
    assert.equal(Object.hasOwn(prompt, "browserExpression"), false);
    assert.equal(Object.hasOwn(prompt, "browserExpressionHash"), false);
  }
  const serialized = JSON.stringify(prompts);
  assert.doesNotMatch(serialized, /browserExpression|\beval\b|new Function/);
  assert.match(serialized, /fresh_browser_context_required/);
  assert.match(serialized, /actual_same_origin_mobile_window/);
});

test("prompt generation rejects identifier collisions and output-root drift", () => {
  const base = {
    candidateReleaseId: RELEASE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt: "2026-08-15T00:10:10.000Z",
    portBase: 18_887,
    roles: ["human"],
    checks: ["desktop", "mobile"],
    random: () => "00000000-0000-4000-8000-000000000001"
  };
  assert.throws(
    () => createM1BOperationalBrowserMeasurementPrompts({
      ...base,
      outputRootRelativePath: "output/playwright/m1-b-p0-5"
    }),
    /collide/
  );
  assert.throws(
    () => createM1BOperationalBrowserMeasurementPrompts({
      ...base,
      checks: ["desktop"],
      outputRootRelativePath: "output/playwright/../escape"
    }),
    /identity is invalid/
  );
});

test("serialized prompts reject executable fields, control drift, and challenge drift", () => {
  const prompt = promptSet()[0];
  assert.equal(
    validateM1BOperationalBrowserMeasurementPrompt(prompt),
    prompt
  );
  assert.throws(
    () => validateM1BOperationalBrowserMeasurementPrompt({
      ...prompt,
      browserExpression: "globalThis.fetch('/private')"
    }),
    /not exact/
  );
  assert.throws(
    () => validateM1BOperationalBrowserMeasurementPrompt({
      ...prompt,
      browserControl: { ...prompt.browserControl, surface: "hidden_bridge" }
    }),
    /not exact/
  );
  assert.throws(
    () => validateM1BOperationalBrowserMeasurementPrompt({
      ...prompt,
      capture: { ...prompt.capture, challengeHash: `0x${"0".repeat(64)}` }
    }),
    /challenge hash/
  );
});

test("response validation binds prompt, projection, DOM, navigation, and phase order", () => {
  const prompts = promptSet();
  const desktop = prompts.find(({ role, check }) => role === "human" && check === "desktop");
  const value = response(desktop);
  assert.equal(validateM1BOperationalBrowserMeasurementResponse(value, desktop), value);
  for (const changed of [
    { ...value, challenge: "m1b_browser_challenge_wrong" },
    {
      ...value,
      measurement: {
        ...value.measurement,
        privateRead: { ...value.measurement.privateRead, projectionHash: `0x${"0".repeat(64)}` }
      }
    },
    {
      ...value,
      measurement: {
        ...value.measurement,
        document: { ...value.measurement.document, privateSurfaceState: "hidden" }
      }
    }
  ]) assert.throws(
    () => validateM1BOperationalBrowserMeasurementResponse(changed, desktop),
    /invalid|not exact|not ready/
  );
  const signedOutPrompt = prompts.find(
    ({ role, check, phase }) => role === "human" &&
      check === "fresh_browser_context" && phase === "signed_out"
  );
  const signedOut = response(signedOutPrompt);
  assert.throws(
    () => validateM1BOperationalBrowserMeasurementResponse({
      ...signedOut,
      browserControl: {
        ...signedOut.browserControl,
        contextClaim: {
          ...signedOut.browserControl.contextClaim,
          lineageHash: `0x${"f".repeat(64)}`
        }
      }
    }, signedOutPrompt),
    /lineage hash/
  );
  assert.throws(
    () => validateM1BOperationalBrowserMeasurementResponse({
      ...signedOut,
      browserControl: {
        ...signedOut.browserControl,
        contextClaim: {
          ...signedOut.browserControl.contextClaim,
          isolatedStorageClaimed: true
        }
      }
    }, signedOutPrompt),
    /invalid/
  );
  for (const documentChange of [
    { connectionState: "Secure session active" },
    { runtimeGateState: "visible" },
    { primaryAction: {
      ...signedOut.measurement.document.primaryAction,
      rendered: true
    } },
    { dialogOpen: true },
    { technicalDetailsOpenCount: 1 }
  ]) assert.throws(
    () => validateM1BOperationalBrowserMeasurementResponse({
      ...signedOut,
      measurement: {
        ...signedOut.measurement,
        document: { ...signedOut.measurement.document, ...documentChange }
      }
    }, signedOutPrompt),
    /invalid/
  );
  const reloginPrompts = prompts.filter(
    ({ role, check }) => role === "human" && check === "sign_out_relogin"
  );
  const reloginResponses = reloginPrompts.map(response);
  const row = deriveM1BOperationalBrowserRow({
    prompts: reloginPrompts,
    responses: reloginResponses,
    capturedAt: "2026-08-15T01:00:00.000Z"
  });
  assert.deepEqual(row.phases.map(({ phase }) => phase), [
    "before_sign_out", "signed_out", "authenticated"
  ]);
  assert.equal(row.visualArtifacts.length, 3);
  assert.equal(row.visualArtifacts.every(({ relativePath }) => relativePath.endsWith(".jpg")), true);
  assert.throws(
    () => deriveM1BOperationalBrowserRow({
      prompts: [reloginPrompts[1], reloginPrompts[0], reloginPrompts[2]],
      responses: [reloginResponses[1], reloginResponses[0], reloginResponses[2]],
      capturedAt: "2026-08-15T01:00:00.000Z"
    }),
    /phase order/
  );
  const serialized = JSON.stringify(value);
  const duplicate = serialized.replace(
    `"promptId":"${value.promptId}"`,
    `"promptId":"${value.promptId}","promptId":"${value.promptId}"`
  );
  assert.throws(
    () => parseM1BOperationalBrowserMeasurementResponseLine(duplicate, desktop),
    /not JSON/
  );
});

test("baseline JPEG validator binds exact quality-80 structure, viewport, and challenge", () => {
  const viewport = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1
  };
  const challengeHash = `0x${"a1".repeat(32)}`;
  const bytes = baselineJpeg(1280, 720, { challengeHash });
  assert.deepEqual(
    validateM1BOperationalBrowserJpeg(bytes, viewport, challengeHash),
    {
      width: 1280,
      height: 720,
      jfifVersion: "1.01",
      iccProfileSegmentCount: 0,
      iccProfileBytes: 0,
      quality: 80,
      subsampling: "4:2:0",
      mcuCount: 3600,
      decodedChallengeHash: challengeHash,
      sha256: createHash("sha256").update(bytes).digest("hex")
    }
  );
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      Buffer.concat([bytes, Buffer.from([0])]),
      viewport
    ),
    /trailing/
  );
  const corruptEntropy = Buffer.from(bytes);
  const sos = corruptEntropy.indexOf(Buffer.from([0xff, 0xda]));
  const scanStart = sos + 2 + corruptEntropy.readUInt16BE(sos + 2);
  corruptEntropy[scanStart] ^= 0x80;
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(corruptEntropy, viewport),
    /entropy|Huffman|MCU/
  );
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      baselineJpeg(1279, 720, { challengeHash }),
      viewport,
      challengeHash
    ),
    /dimensions/
  );
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      baselineJpeg(1280, 720),
      viewport,
      challengeHash
    ),
    /pixel challenge/
  );
  const wrongChallengeHash = `0x${"b2".repeat(32)}`;
  const wrongButSelfConsistent = baselineJpeg(1280, 720, {
    challengeHash: wrongChallengeHash
  });
  assert.equal(
    validateM1BOperationalBrowserJpeg(wrongButSelfConsistent, viewport)
      .decodedChallengeHash,
    wrongChallengeHash
  );
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      wrongButSelfConsistent,
      viewport,
      challengeHash
    ),
    /expected prompt/
  );
  for (const devicePixelRatio of [1, 2, 3, 4]) {
    const retinaViewport = {
      innerWidth: 390,
      innerHeight: 180,
      devicePixelRatio
    };
    const retinaBytes = baselineJpeg(
      390 * devicePixelRatio,
      180 * devicePixelRatio,
      { challengeHash, devicePixelRatio }
    );
    assert.equal(
      validateM1BOperationalBrowserJpeg(
        retinaBytes,
        retinaViewport,
        challengeHash
      ).decodedChallengeHash,
      challengeHash
    );
  }
  const desktopDpr4Viewport = {
    innerWidth: 1_440,
    innerHeight: 900,
    devicePixelRatio: 4
  };
  assert.equal(
    validateM1BOperationalBrowserJpeg(
      baselineJpeg(5_760, 3_600, {
        challengeHash,
        devicePixelRatio: 4
      }),
      desktopDpr4Viewport,
      challengeHash
    ).decodedChallengeHash,
    challengeHash
  );
  const retinaViewport = {
    innerWidth: 390,
    innerHeight: 180,
    devicePixelRatio: 2
  };
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      baselineJpeg(390, 180, { challengeHash }),
      retinaViewport,
      challengeHash
    ),
    /dimensions/
  );
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(bytes, {
      ...viewport,
      devicePixelRatio: 1.5
    }, challengeHash),
    /viewport/
  );
  const withIccProfile = baselineJpeg(1280, 720, {
    challengeHash,
    iccProfilePayload: [1, 2, 3, 4]
  });
  const iccMetadata = validateM1BOperationalBrowserJpeg(
    withIccProfile,
    viewport,
    challengeHash
  );
  assert.equal(iccMetadata.iccProfileSegmentCount, 1);
  assert.equal(iccMetadata.iccProfileBytes, 4);
});

test("baseline JPEG validator rejects progressive, unknown, raw high-bit, and unsafe Huffman forms", () => {
  const viewport = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 };
  const challengeHash = `0x${"c3".repeat(32)}`;
  const bytes = baselineJpeg(1280, 720, { challengeHash });
  const sof = bytes.indexOf(Buffer.from([0xff, 0xc0]));
  const sos = bytes.indexOf(Buffer.from([0xff, 0xda]));
  const progressive = Buffer.from(bytes);
  progressive[sof + 1] = 0xc2;
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(progressive, viewport, challengeHash),
    /Progressive/
  );
  const quantizationDrift = Buffer.from(bytes);
  const dqt = quantizationDrift.indexOf(Buffer.from([0xff, 0xdb]));
  quantizationDrift[dqt + 5] += 1;
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      quantizationDrift,
      viewport,
      challengeHash
    ),
    /quality-80/
  );
  const samplingDrift = Buffer.from(bytes);
  samplingDrift[sof + 11] = 0x11;
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(samplingDrift, viewport, challengeHash),
    /4:2:0/
  );
  const unknown = Buffer.concat([
    bytes.subarray(0, 20),
    Buffer.from([0xff, 0xfe, 0x00, 0x03, 0x00]),
    bytes.subarray(20)
  ]);
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(unknown, viewport, challengeHash),
    /unknown|forbidden/
  );
  const firstDqtLength = 2 + bytes.readUInt16BE(dqt + 2);
  const duplicateDqt = Buffer.concat([
    bytes.subarray(0, sof),
    bytes.subarray(dqt, dqt + firstDqtLength),
    bytes.subarray(sof)
  ]);
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      duplicateDqt,
      viewport,
      challengeHash
    ),
    /DQT|duplicated/
  );
  const highBitStripped = Buffer.from(bytes);
  highBitStripped[3] = 0x60;
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      highBitStripped,
      viewport,
      challengeHash
    ),
    /unknown|marker/
  );
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      baselineJpeg(1280, 720, { challengeHash, oversubscribedHuffman: true }),
      viewport,
      challengeHash
    ),
    /oversubscribed/
  );
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      baselineJpeg(1280, 720, { challengeHash, completeHuffman: true }),
      viewport,
      challengeHash
    ),
    /complete|all-ones/
  );
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(
      baselineJpeg(1280, 720, { challengeHash, markerAcNonZero: true }),
      viewport,
      challengeHash
    ),
    /nonzero AC/
  );
  const dri = Buffer.concat([
    bytes.subarray(0, sos),
    jpegSegment(0xdd, Buffer.from([0, 1])),
    bytes.subarray(sos)
  ]);
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(dri, viewport, challengeHash),
    /DRI|restart/
  );
  const extraScan = Buffer.concat([
    bytes.subarray(0, -2),
    jpegSegment(0xda, Buffer.from([
      3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0
    ])),
    bytes.subarray(-2)
  ]);
  assert.throws(
    () => validateM1BOperationalBrowserJpeg(extraScan, viewport, challengeHash),
    /extra scan|unexpected marker/
  );
});
