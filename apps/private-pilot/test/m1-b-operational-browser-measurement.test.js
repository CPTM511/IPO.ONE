import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { deflateSync } from "node:zlib";
import { assertTenantProtocolRequest } from "../../../packages/api-contract/src/tenant-protocol.js";
import {
  M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES,
  createM1BOperationalBrowserExpression,
  createM1BOperationalBrowserMeasurementPrompts,
  deriveM1BOperationalBrowserRow,
  parseM1BOperationalBrowserMeasurementResponseLine,
  validateM1BOperationalBrowserMeasurementPrompt,
  validateM1BOperationalBrowserMeasurementResponse,
  validateM1BOperationalBrowserPng
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
      consoleErrorCount: 0,
      failedNetworkRequestCount: 0
    }
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function png(width, height, idatBytes = null) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc((1 + width * 4) * height);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", idatBytes ?? deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

test("closed prompts cover all 33 phases and carry contract-valid safe private reads", () => {
  const prompts = promptSet();
  assert.equal(prompts.length, 33);
  assert.equal(new Set(prompts.map(({ promptId }) => promptId)).size, 33);
  assert.equal(new Set(prompts.map(({ capture }) => capture.relativePath)).size, 33);
  for (const prompt of prompts.filter(({ readRequest }) => readRequest !== null)) {
    assert.equal(assertTenantProtocolRequest(prompt.readRequest).operationId, prompt.readRequest.operationId);
    assert.match(prompt.browserExpression, /__ipoOneM1BControlledBrowserMeasurement/);
    assert.doesNotMatch(prompt.browserExpression, /consoleErrorCount:0/);
  }
  const cp = prompts.find(({ role, check }) => role === "capital_partner" && check === "desktop");
  assert.match(cp.browserExpression, /b\.resource\?\.resourceType/);
  const human = prompts.find(({ role, check }) => role === "human" && check === "desktop");
  assert.match(human.browserExpression, /Array\.isArray\(b\.resources\)/);
  assert.doesNotMatch(human.browserExpression, /b\.resourceCount/);
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

test("serialized prompts deterministically reconstruct the tracked browser expression", () => {
  const prompt = promptSet()[0];
  const { browserExpression, ...base } = prompt;
  const serialized = {
    ...base,
    browserExpressionHash: projectionHash(browserExpression)
  };
  assert.equal(
    createM1BOperationalBrowserExpression(serialized),
    browserExpression
  );
  assert.equal(
    validateM1BOperationalBrowserMeasurementPrompt(serialized),
    serialized
  );
  assert.throws(
    () => createM1BOperationalBrowserExpression({
      ...serialized,
      browserExpressionHash: `0x${"0".repeat(64)}`
    }),
    /expression hash/
  );
  assert.throws(
    () => validateM1BOperationalBrowserMeasurementPrompt({
      ...prompt,
      browserExpression: `${browserExpression} `
    }),
    /expression does not match/
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
    /Signed-out privacy boundary/
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
  assert.equal(row.visualArtifacts.every(({ relativePath }) => relativePath.endsWith(".png")), true);
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

function browserHarness(prompt) {
  let popstate;
  const element = ({ hidden = false, dataset = {}, textContent = "" } = {}) => ({
    hidden,
    disabled: false,
    dataset,
    textContent,
    style: {},
    remove() {},
    removeAttribute() {},
    getClientRects: () => hidden ? [] : [{}]
  });
  const marker = element();
  const primary = element();
  const surface = element();
  const active = element({ dataset: { viewPanel: prompt.expected.activeView } });
  const connection = element({ textContent: prompt.expected.authentication.active
    ? "Secure session active"
    : "Sign-in required" });
  const shield = element({ hidden: prompt.expected.authentication.active });
  const gate = element({ hidden: true });
  const mobile = element({ hidden: prompt.expected.viewportClass !== "mobile" });
  const elements = new Map([
    [prompt.expected.primaryActionCode, primary],
    ["signedOutPrivacyShield", shield],
    ["authenticatedRuntimeGate", gate],
    ["connectionStatus", connection],
    ["mobileMenuBtn", mobile]
  ]);
  const location = { origin: new URL(prompt.origin).origin, hash: "#overview" };
  const history = {
    replaceState(_state, _title, hash) { location.hash = hash; },
    pushState(_state, _title, hash) { location.hash = hash; },
    back() { location.hash = prompt.role === "capital_partner" ? "#capital-partners" : "#overview"; popstate?.(); },
    forward() { location.hash = prompt.role === "capital_partner" ? "#mainContent" : "#request-credit"; popstate?.(); }
  };
  const workspace = prompt.role === "capital_partner"
    ? {
        schemaVersion: "tenant_capital_partner_self_view.v1",
        resource: { resourceType: "capital_partner_profile", resourceId: "not_projected" },
        profile: { displayName: "not_projected" },
        serverTruth: true,
        readOnly: true,
        fundsAuthority: false
      }
    : {
        schemaVersion: "tenant_workspace_resume_view.v2",
        workspaceKind: prompt.expected.workspaceKind,
        resources: [{}],
        continuationReceipts: [{}],
        controlledAgentActorIds: prompt.role === "principal_agent" ? ["not_projected"] : undefined,
        humanOfferReview: prompt.role === "human" ? {} : undefined,
        hasMore: false,
        serverTruth: true
      };
  return {
    crypto: webcrypto,
    TextEncoder,
    URL,
    location,
    history,
    performance: { getEntriesByType: () => [{ type: prompt.check === "reload" ? "reload" : "navigate" }] },
    innerWidth: prompt.expected.viewportClass === "mobile" ? 390 : 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    setTimeout,
    addEventListener(_type, callback) { popstate = callback; },
    document: {
      documentElement: {
        clientWidth: prompt.expected.viewportClass === "mobile" ? 390 : 1280,
        scrollWidth: prompt.expected.viewportClass === "mobile" ? 390 : 1280
      },
      body: { append(value) { elements.set(value.id, value); } },
      createElement: () => marker,
      getElementById: (id) => elements.get(id) ?? null,
      querySelector(selector) {
        if (selector.includes("ipo-one-workspace-name")) {
          return { content: prompt.expected.workspaceName };
        }
        if (selector.includes("ipo-one-csrf-token")) return { content: "Abcdefghijklmnopqrstuvwxyz_0123456789-ABCDE" };
        if (selector === "[data-view-panel].active") return active;
        if (selector === ".capital-partners-page" || selector === "#privatePortfolioSurface") {
          return prompt.expected.authentication.active ? surface : element({ hidden: true });
        }
        return null;
      },
      querySelectorAll: () => []
    },
    fetch: async (path, options) => path === "/auth/v1/options"
      ? {
          json: async () => ({
            sessionActive: prompt.expected.authentication.active,
            sessionAuthenticationMethod: prompt.expected.authentication.method
          })
        }
      : {
          status: 200,
          headers: { get: () => JSON.parse(options.body).requestId },
          json: async () => workspace
        },
    console: { log() {} },
    __ipoOneM1BControlledBrowserMeasurement: {
      driver: "chrome_control",
      consoleErrorCount: 0,
      failedNetworkRequestCount: 0
    }
  };
}

test("tracked browser expressions execute for each role projection and exact history sequence", async () => {
  const prompts = promptSet().filter(({ phase, check }) =>
    phase === "authenticated" && new Set(["desktop", "back_forward"]).has(check)
  );
  for (const prompt of prompts) {
    const measured = JSON.parse(JSON.stringify(
      await runInNewContext(prompt.browserExpression, browserHarness(prompt))
    ));
    const expected = response(prompt);
    assert.deepEqual(measured, expected, `${prompt.role}:${prompt.check}`);
    assert.equal(
      validateM1BOperationalBrowserMeasurementResponse(measured, prompt),
      measured
    );
    assert.equal(Object.hasOwn(measured.measurement.privateRead.projection, "profile"), false);
    assert.equal(Object.hasOwn(measured.measurement.privateRead.projection, "resources"), false);
  }
});

test("PNG validator requires exact CRC, chunks, viewport dimensions, and no trailing bytes", () => {
  const viewport = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1
  };
  const bytes = png(1280, 720);
  assert.deepEqual(
    validateM1BOperationalBrowserPng(bytes, viewport),
    {
      width: 1280,
      height: 720,
      idatCount: 1,
      sha256: createHash("sha256").update(bytes).digest("hex")
    }
  );
  assert.throws(
    () => validateM1BOperationalBrowserPng(Buffer.concat([bytes, Buffer.from([0])]), viewport),
    /trailing/
  );
  assert.throws(
    () => validateM1BOperationalBrowserPng(
      png(1280, 720, Buffer.from([1])),
      viewport
    ),
    /cannot be decoded/
  );
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => validateM1BOperationalBrowserPng(corrupt, viewport), /invalid/);
  assert.throws(() => validateM1BOperationalBrowserPng(png(1279, 720), viewport), /dimensions/);
});
