import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createM1BOperationalBrowserMeasurementPrompts
} from "../../private-pilot/src/m1-b-operational-browser-measurement.js";
import {
  M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE,
  canonicalM1BOperationalBrowserJson,
  createM1BOperationalBrowserContextLineageProjection,
  createM1BOperationalBrowserMeasurementController,
  createM1BOperationalBrowserPixelChallengeBits,
  parseM1BOperationalBrowserPromptText,
  validateM1BOperationalBrowserResponseRequestId
} from "../src/m1-b-operational-browser-measurement-console.js";

const RELEASE = "a".repeat(40);
const TREE = "b".repeat(40);
const IMAGE = `sha256:${"c".repeat(64)}`;

function hashCanonical(value) {
  return `0x${createHash("sha256")
    .update(canonicalM1BOperationalBrowserJson(value))
    .digest("hex")}`;
}

function prompts(check, role = "human") {
  let counter = 0;
  return createM1BOperationalBrowserMeasurementPrompts({
    candidateReleaseId: RELEASE,
    sourceTreeHash: TREE,
    runtimeImageId: IMAGE,
    databaseStartedAt: "2026-08-15T00:10:10.000Z",
    portBase: 18_887,
    outputRootRelativePath: "output/playwright/m1-b-p0-5",
    roles: [role],
    checks: [check],
    random: () =>
      `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`
  });
}

function contextClaim(prompt) {
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
    controllerObservedAt: "2026-08-15T00:10:10.500Z",
    isolatedStorageClaimed: false
  };
  claim.lineageHash = hashCanonical(
    createM1BOperationalBrowserContextLineageProjection(prompt, claim)
  );
  return claim;
}

function element({ hidden = false, textContent = "", dataset = {} } = {}) {
  const value = {
    hidden,
    disabled: false,
    textContent,
    dataset,
    style: {},
    children: [],
    append(child) {
      value.children.push(child);
    },
    setAttribute() {},
    removeAttribute() {},
    remove() {}
  };
  value.getClientRects = () => value.hidden ? [] : [{}];
  return value;
}

function harness(prompt, {
  width = prompt.expected.viewportClass === "mobile" ? 390 : 1_280,
  height = prompt.expected.viewportClass === "mobile" ? 844 : 720,
  tenantFailure = false
} = {}) {
  const authenticated = prompt.expected.authentication.active;
  const events = new Map();
  const markerElements = new Map();
  const primary = element();
  primary.disabled = !authenticated;
  primary.hidden = !authenticated;
  const surface = element({ hidden: !authenticated });
  const activePanel = element({ dataset: { viewPanel: prompt.expected.activeView } });
  const shield = element({ hidden: authenticated });
  const gate = element({ hidden: true });
  const connection = element({
    textContent: authenticated ? "Secure session active" : "Sign-in required"
  });
  const mobileMenu = element({ hidden: width > 430 });
  const elements = new Map([
    [prompt.expected.primaryActionCode, primary],
    ["signedOutPrivacyShield", shield],
    ["authenticatedRuntimeGate", gate],
    ["connectionStatus", connection],
    ["mobileMenuBtn", mobileMenu]
  ]);
  let privateReadCount = 0;
  const location = {
    origin: new URL(prompt.origin).origin,
    protocol: "http:",
    hostname: "127.0.0.1",
    pathname: "/",
    hash: prompt.role === "capital_partner" ? "#capital-partners" : "#overview"
  };
  const globalObject = {
    location,
    history: {
      replaceState(_state, _title, hash) {
        location.hash = hash;
      },
      pushState(_state, _title, hash) {
        location.hash = hash;
      },
      back() {},
      forward() {}
    },
    performance: { getEntriesByType: () => [{ type: "navigate" }] },
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: 1,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) {
      callback();
    },
    addEventListener(type, callback) {
      const values = events.get(type) ?? new Set();
      values.add(callback);
      events.set(type, values);
    },
    removeEventListener(type, callback) {
      events.get(type)?.delete(callback);
    }
  };
  const documentObject = {
    documentElement: {
      get clientWidth() {
        return globalObject.innerWidth;
      },
      get scrollWidth() {
        return globalObject.innerWidth;
      }
    },
    body: {
      append(value) {
        markerElements.set(value.id, value);
      }
    },
    createElement() {
      const value = element();
      value.remove = () => markerElements.delete(value.id);
      return value;
    },
    getElementById(id) {
      return markerElements.get(id) ?? elements.get(id) ?? null;
    },
    querySelector(selector) {
      if (selector === 'meta[name="ipo-one-workspace-name"]') {
        return { content: prompt.expected.workspaceName };
      }
      if (selector === "[data-view-panel].active") return activePanel;
      if (
        selector === ".capital-partners-page" ||
        selector === "#privatePortfolioSurface"
      ) return surface;
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const workspace = prompt.role === "capital_partner"
    ? {
        schemaVersion: "tenant_capital_partner_self_view.v1",
        resource: { resourceType: "capital_partner_profile" },
        serverTruth: true,
        readOnly: true,
        fundsAuthority: false,
        profile: { privateName: "must_not_escape" }
      }
    : {
        schemaVersion: "tenant_workspace_resume_view.v2",
        workspaceKind: prompt.expected.workspaceKind,
        serverTruth: true,
        resources: [{ private: "must_not_escape" }],
        continuationReceipts: [{}],
        controlledAgentActorIds: prompt.role === "principal_agent" ? ["private"] : [],
        humanOfferReview: prompt.role === "human" ? {} : null,
        hasMore: false
      };
  const snapshots = [];
  const controller = createM1BOperationalBrowserMeasurementController({
    globalObject,
    documentObject,
    hashCanonical,
    readAuthenticationOptions: async () => ({
      sessionActive: authenticated,
      sessionAuthenticationMethod: authenticated ? "siwe" : null
    }),
    async tenantRead(request) {
      privateReadCount += 1;
      if (tenantFailure) throw new Error("private read failed");
      return {
        requestId: request.requestId,
        responseRequestIdHeader: request.requestId,
        correlationId: request.correlationId,
        result: workspace
      };
    },
    getRuntimeState: () => ({
      authenticationProfile: "local_no_funds",
      connected: authenticated,
      protectedAuthorityAvailable: authenticated,
      workspaceKind: authenticated ? prompt.expected.workspaceKind : null,
      authenticationMethod: authenticated ? "siwe" : null
    }),
    prepareView: async (view) => {
      activePanel.dataset.viewPanel = view;
    },
    onStateChange: (snapshot) => snapshots.push(snapshot)
  });
  return {
    controller,
    globalObject,
    marker: () => markerElements.get(prompt.capture.markerId),
    mobileMenu,
    privateReadCount: () => privateReadCount,
    snapshots
  };
}

test("visible console executes one exact private read and requires capture ack before copy", async () => {
  const prompt = prompts("desktop")[0];
  const page = harness(prompt);
  await page.controller.load(JSON.stringify(prompt));
  await page.controller.preflight();
  assert.equal(page.privateReadCount(), 0);
  await page.controller.run();
  assert.equal(page.privateReadCount(), 1);
  assert.equal(page.controller.snapshot().state, "capture_required");
  const marker = page.marker();
  const pixelChallenge = M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE;
  const bits = createM1BOperationalBrowserPixelChallengeBits(
    prompt.capture.challengeHash
  );
  assert.equal(marker.style.left, `${pixelChallenge.offsetX}px`);
  assert.equal(marker.style.top, `${pixelChallenge.offsetY}px`);
  assert.equal(marker.children.length, pixelChallenge.columns * pixelChallenge.rows);
  assert.deepEqual(
    marker.children.map(({ style }) =>
      style.background === pixelChallenge.oneColor ? 1 : 0
    ),
    bits
  );
  await assert.rejects(
    page.controller.copy(async () => {}),
    /ready response|copied/
  );
  page.controller.acknowledgeCapture();
  let copied;
  await page.controller.copy(async (value) => {
    copied = value;
  });
  const response = JSON.parse(copied);
  assert.equal(
    response.browserControl.screenshotStatus,
    "external_capture_acknowledged_pending_builder_validation"
  );
  assert.equal(response.browserControl.telemetrySource, "trusted_app_measurement_interval");
  assert.equal(response.measurement.privateRead.projection.resourceCount, 1);
  assert.equal(copied.includes("must_not_escape"), false);
  assert.equal(copied.includes("csrf"), false);
  page.controller.reset();
  await assert.rejects(
    page.controller.load(JSON.stringify(prompt)),
    /already been consumed/
  );
});

test("preflight blocks wrong viewport without a private read and can retry", async () => {
  const prompt = prompts("mobile")[0];
  const page = harness(prompt, { width: 1_280, height: 720 });
  await page.controller.load(JSON.stringify(prompt));
  await assert.rejects(page.controller.preflight(), /actual viewport|not ready/);
  assert.equal(page.privateReadCount(), 0);
  page.globalObject.innerWidth = 390;
  page.globalObject.innerHeight = 844;
  page.mobileMenu.hidden = false;
  await page.controller.preflight();
  await page.controller.run();
  assert.equal(page.privateReadCount(), 1);
});

test("pixel challenge capture accepts integer Retina DPR and rejects fractional zoom", async () => {
  for (const devicePixelRatio of [1, 2, 3, 4]) {
    const prompt = prompts("desktop")[0];
    const page = harness(prompt);
    page.globalObject.devicePixelRatio = devicePixelRatio;
    await page.controller.load(JSON.stringify(prompt));
    await page.controller.preflight();
    await page.controller.run();
    assert.equal(page.controller.snapshot().state, "capture_required");
    assert.equal(
      page.marker().children.length,
      M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE.columns *
        M1_B_OPERATIONAL_BROWSER_PIXEL_CHALLENGE.rows
    );
    assert.equal(page.privateReadCount(), 1);
  }

  const helperPrompt = prompts("desktop")[0];
  const helperDpr4 = harness(helperPrompt, { width: 1_440, height: 900 });
  helperDpr4.globalObject.devicePixelRatio = 4;
  await helperDpr4.controller.load(JSON.stringify(helperPrompt));
  await helperDpr4.controller.preflight();
  assert.equal(helperDpr4.privateReadCount(), 0);

  const oversizedPrompt = prompts("desktop")[0];
  const oversized = harness(oversizedPrompt, { width: 3_840, height: 2_160 });
  oversized.globalObject.devicePixelRatio = 4;
  await oversized.controller.load(JSON.stringify(oversizedPrompt));
  await assert.rejects(
    oversized.controller.preflight(),
    /actual viewport|not ready/
  );
  assert.equal(oversized.privateReadCount(), 0);

  const fractionalPrompt = prompts("desktop")[0];
  const fractional = harness(fractionalPrompt);
  fractional.globalObject.devicePixelRatio = 1.5;
  await fractional.controller.load(JSON.stringify(fractionalPrompt));
  await assert.rejects(
    fractional.controller.preflight(),
    /actual viewport|not ready/
  );
  assert.equal(fractional.privateReadCount(), 0);
});

test("fresh top-level context requires and binds a closed tabs.new claim", async () => {
  const prompt = prompts("fresh_browser_context")[0];
  const page = harness(prompt);
  await page.controller.load(JSON.stringify(prompt));
  await assert.rejects(page.controller.preflight(), /requires.*claim/);
  assert.equal(page.controller.snapshot().state, "preflight_blocked");
  assert.equal(page.privateReadCount(), 0);
  await page.controller.loadContextClaim(JSON.stringify(contextClaim(prompt)));
  await page.controller.preflight();
  await page.controller.run();
  page.controller.acknowledgeCapture();
  let response;
  await page.controller.copy(async (value) => {
    response = JSON.parse(value);
  });
  assert.equal(
    response.browserControl.contextClaim.topLevelContextKind,
    "fresh_top_level_browsing_context"
  );
  assert.equal(
    response.browserControl.contextClaim.isolatedStorageClaimed,
    false
  );
});

test("signed-out measurement performs no private read", async () => {
  const prompt = prompts("sign_out_relogin").find(({ phase }) => phase === "signed_out");
  const page = harness(prompt);
  await page.controller.load(JSON.stringify(prompt));
  await page.controller.preflight();
  await page.controller.run();
  assert.equal(page.privateReadCount(), 0);
  page.controller.acknowledgeCapture();
  let copied;
  await page.controller.copy(async (value) => {
    copied = JSON.parse(value);
  });
  assert.equal(copied.measurement.privateRead, null);
  assert.equal(copied.measurement.authentication.active, false);
});

test("a failed committed private read consumes the prompt", async () => {
  const prompt = prompts("desktop")[0];
  const page = harness(prompt, { tenantFailure: true });
  await page.controller.load(JSON.stringify(prompt));
  await page.controller.preflight();
  await assert.rejects(page.controller.run(), /failed closed/);
  assert.equal(page.privateReadCount(), 1);
  page.controller.reset();
  await assert.rejects(
    page.controller.load(JSON.stringify(prompt)),
    /already been consumed/
  );
});

test("a failed Clipboard write removes the one-shot response before reset", async () => {
  const prompt = prompts("desktop")[0];
  const page = harness(prompt);
  await page.controller.load(JSON.stringify(prompt));
  await page.controller.preflight();
  await page.controller.run();
  page.controller.acknowledgeCapture();
  assert.notEqual(page.controller.snapshot().responseText, "");
  await assert.rejects(
    page.controller.copy(async () => {
      throw new Error("clipboard unavailable");
    }),
    /Measurement failed closed/
  );
  assert.equal(page.controller.snapshot().state, "failed");
  assert.equal(page.controller.snapshot().responseText, "");
  await assert.rejects(
    page.controller.copy(async () => {}),
    /Only one ready response/
  );
  page.controller.reset();
});

test("closed prompt parsing rejects duplicate keys, executable extras, and 256 KiB overflow", () => {
  const prompt = prompts("desktop")[0];
  const serialized = JSON.stringify(prompt);
  const duplicate = serialized.replace(
    `"promptId":"${prompt.promptId}"`,
    `"promptId":"${prompt.promptId}","promptId":"${prompt.promptId}"`
  );
  assert.throws(() => parseM1BOperationalBrowserPromptText(duplicate), /strict JSON/);
  assert.throws(
    () => parseM1BOperationalBrowserPromptText(JSON.stringify({
      ...prompt,
      browserExpression: "fetch('/tenant/v1/operations')"
    })),
    /not exact/
  );
  assert.throws(
    () => parseM1BOperationalBrowserPromptText(" ".repeat(256 * 1024 + 1)),
    /oversized/
  );
});

test("measurement transport requires the raw exact response request ID echo", () => {
  const requestId = "m1b_measurement_request_exact_00000001";
  assert.equal(
    validateM1BOperationalBrowserResponseRequestId({
      expectedRequestId: requestId,
      responseRequestIdHeader: requestId
    }),
    requestId
  );
  for (const responseRequestIdHeader of [
    null,
    "m1b_measurement_request_wrong_00000002"
  ]) {
    assert.throws(
      () => validateM1BOperationalBrowserResponseRequestId({
        expectedRequestId: requestId,
        responseRequestIdHeader
      }),
      (error) => error.code ===
        "operational_browser_measurement_transport_invalid"
    );
  }
});
