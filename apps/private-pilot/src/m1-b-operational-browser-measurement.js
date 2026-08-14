import { createHash, randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";

const SHA = /^[0-9a-f]{40}$/;
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/%-]{1,255}$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PROMPT_BASE_KEYS = Object.freeze([
  "schemaVersion", "kind", "promptId", "candidateReleaseId",
  "sourceTreeHash", "runtimeImageId", "databaseStartedAt", "role",
  "check", "phase", "origin", "expected", "readRequest", "capture"
]);
const PROMPT_EXPECTED_KEYS = Object.freeze([
  "authentication", "workspaceName", "workspaceKind", "activeView",
  "privateReadSchemaVersion", "viewportClass", "navigationKind",
  "primaryActionCode", "negativeCase", "restartReceiptRequired"
]);

export const M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES = Object.freeze({
  desktop: Object.freeze(["authenticated"]),
  mobile: Object.freeze(["authenticated"]),
  reload: Object.freeze(["authenticated"]),
  fresh_browser_context: Object.freeze(["signed_out", "authenticated"]),
  back_forward: Object.freeze(["authenticated"]),
  sign_out_relogin: Object.freeze(["before_sign_out", "signed_out", "authenticated"]),
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
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
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

function privateSurfaceSelector(role) {
  return role === "capital_partner" ? ".capital-partners-page" : "#privatePortfolioSurface";
}

function viewportClass(check) {
  return check === "mobile" ? "mobile" : "desktop";
}

function navigationKind(check) {
  if (check === "reload") return "reload";
  if (check === "back_forward") return "same_document_history";
  return "navigate_or_restore";
}

function canonicalIso(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function promptBase(value) {
  if (exactKeys(value, PROMPT_BASE_KEYS)) return value;
  for (const extraKey of ["browserExpression", "browserExpressionHash"]) {
    if (exactKeys(value, [...PROMPT_BASE_KEYS, extraKey])) {
      return Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== extraKey)
      );
    }
  }
  fail("operational_browser_prompt_invalid", "Browser prompt shape is invalid.");
}

function validatePromptBase(value) {
  const privateRead = M1_B_OPERATIONAL_BROWSER_PRIVATE_READ[value.role];
  const phases = M1_B_OPERATIONAL_BROWSER_MEASUREMENT_PHASES[value.check];
  const expected = value.expected;
  const authenticated = value.phase !== "signed_out";
  let origin;
  try {
    origin = new URL(value.origin);
  } catch {
    fail("operational_browser_prompt_invalid", "Browser prompt origin is invalid.");
  }
  const roleOffset = value.role === "human" ? 0 :
    value.role === "principal_agent" ? 1 : 3;
  const port = Number(origin.port);
  const basePort = port - roleOffset;
  const negativeCase = value.check === "negative_authorization"
    ? M1_B_OPERATIONAL_BROWSER_NEGATIVE_CASE[value.role]
    : null;
  const captureSuffix =
    `${value.candidateReleaseId}.browser-capture.${value.role}.` +
    `${value.check}.${value.phase}.png`;
  if (
    value.schemaVersion !== "m1_b_operational_browser_measurement_prompt.v1" ||
    value.kind !== "browser_measurement_prompt" ||
    !REQUEST_ID.test(value.promptId ?? "") ||
    !SHA.test(value.candidateReleaseId ?? "") ||
    !SHA.test(value.sourceTreeHash ?? "") ||
    !IMAGE_ID.test(value.runtimeImageId ?? "") ||
    !canonicalIso(value.databaseStartedAt) ||
    !privateRead || !phases?.includes(value.phase) ||
    origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" ||
    origin.pathname !== "/" || origin.search !== "" || origin.hash !== "" ||
    !Number.isSafeInteger(basePort) || basePort < 1_024 || basePort > 65_532 ||
    origin.toString() !== value.origin ||
    !exactKeys(expected, PROMPT_EXPECTED_KEYS) ||
    !exactKeys(expected.authentication, ["active", "method"]) ||
    expected.authentication.active !== authenticated ||
    expected.authentication.method !== (authenticated ? "siwe" : null) ||
    expected.workspaceName !== M1_B_OPERATIONAL_BROWSER_WORKSPACE_NAME[value.role] ||
    expected.workspaceKind !== privateRead.workspaceKind ||
    expected.activeView !== activeView(value.role, value.check) ||
    expected.privateReadSchemaVersion !==
      (authenticated ? privateRead.schemaVersion : null) ||
    expected.viewportClass !== viewportClass(value.check) ||
    expected.navigationKind !== navigationKind(value.check) ||
    expected.primaryActionCode !== primaryActionCode(value.role) ||
    canonicalJson(expected.negativeCase) !== canonicalJson(negativeCase) ||
    expected.restartReceiptRequired !== (value.check === "restart_recovery") ||
    !exactKeys(value.capture, [
      "required", "relativePath", "markerId", "challenge", "challengeHash"
    ]) || value.capture.required !== true ||
    value.capture.markerId !== "ipo-one-m1-b-measurement-marker" ||
    !REQUEST_ID.test(value.capture.challenge ?? "") ||
    value.capture.challengeHash !== manifestHash({
      challenge: value.capture.challenge
    }) ||
    typeof value.capture.relativePath !== "string" ||
    !/^output\/playwright\/[A-Za-z0-9][A-Za-z0-9._-]{1,127}\//.test(
      value.capture.relativePath
    ) || value.capture.relativePath.includes("..") ||
    !value.capture.relativePath.endsWith(`/${captureSuffix}`)
  ) fail("operational_browser_prompt_invalid", "Browser prompt is not exact.");
  if (authenticated) {
    if (!exactKeys(value.readRequest, [
      "operationId", "payload", "requestId", "correlationId", "schemaVersion"
    ]) || value.readRequest.operationId !== privateRead.operationId ||
      !exactKeys(value.readRequest.payload, []) ||
      !REQUEST_ID.test(value.readRequest.requestId ?? "") ||
      !REQUEST_ID.test(value.readRequest.correlationId ?? "") ||
      value.readRequest.schemaVersion !== "tenant_protocol_request.v1"
    ) fail("operational_browser_prompt_invalid", "Browser private-read prompt is invalid.");
  } else if (value.readRequest !== null) {
    fail("operational_browser_prompt_invalid", "Signed-out prompt cannot carry a private read.");
  }
  return value;
}

function responseProjectionSource(role) {
  if (role === "capital_partner") {
    return `({schemaVersion:b.schemaVersion,resourceType:b.resource?.resourceType,serverTruth:b.serverTruth,readOnly:b.readOnly,fundsAuthority:b.fundsAuthority})`;
  }
  return `({schemaVersion:b.schemaVersion,workspaceKind:b.workspaceKind,serverTruth:b.serverTruth,resourceCount:Array.isArray(b.resources)?b.resources.length:-1,continuationCount:Array.isArray(b.continuationReceipts)?b.continuationReceipts.length:-1,hasMore:b.hasMore,controlledAgentCount:Array.isArray(b.controlledAgentActorIds)?b.controlledAgentActorIds.length:0,humanOfferReviewPresent:b.humanOfferReview!==undefined&&b.humanOfferReview!==null})`;
}

function browserExpression(prompt) {
  const authenticated = prompt.expected.authentication.active;
  const primary = prompt.expected.primaryActionCode;
  const read = prompt.readRequest;
  const markerText = [
    prompt.candidateReleaseId.slice(0, 12),
    prompt.role,
    prompt.check,
    prompt.capture.challenge
  ].join(" · ");
  const navigationStart = prompt.role === "capital_partner"
    ? "#capital-partners"
    : "#overview";
  const navigationIntermediate = prompt.role === "capital_partner"
    ? "#mainContent"
    : "#request-credit";
  const navigation = prompt.check === "back_forward"
    ? `const sh=${JSON.stringify(navigationStart)};const ih=${JSON.stringify(navigationIntermediate)};history.replaceState({m1b:true},"",sh);history.pushState({m1b:true},"",ih);await new Promise(r=>setTimeout(r,50));const im=location.hash;const bp=new Promise(r=>addEventListener("popstate",()=>r(location.hash),{once:true}));history.back();const bh=await bp;const fp=new Promise(r=>addEventListener("popstate",()=>r(location.hash),{once:true}));history.forward();const fh=await fp;nav={kind:"same_document_history",startHash:sh,intermediateHash:im,backHash:bh,forwardHash:fh,sameDocument:true};`
    : `const n=performance.getEntriesByType("navigation")[0]?.type??"navigate";nav={kind:n,startHash:location.hash,intermediateHash:null,backHash:null,forwardHash:null,sameDocument:false};`;
  const privateRead = authenticated
    ? `const q=${JSON.stringify(read)};const c=document.querySelector('meta[name="ipo-one-csrf-token"]')?.content;if(!/^[A-Za-z0-9_-]{32,128}$/.test(c??""))throw new Error("Exact SIWE CSRF bootstrap required");const rr=await fetch("/tenant/v1/operations",{method:"POST",credentials:"same-origin",headers:{accept:"application/json, application/problem+json","content-type":"application/json","x-csrf-token":c,"x-request-id":q.requestId},body:JSON.stringify(q)});const responseRequestId=rr.headers.get("x-request-id");const b=await rr.json();if(rr.status!==200||responseRequestId!==q.requestId)throw new Error("Private read failed");const projection=${responseProjectionSource(prompt.role)};const ph=await h(cj(projection));pr={operationId:q.operationId,requestId:q.requestId,correlationId:q.correlationId,httpStatus:rr.status,responseRequestId,projection,projectionHash:ph};`
    : `pr=null;`;
  return `(async()=>{
    const cj=v=>v===null?"null":typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?"["+v.map(cj).join(",")+"]":"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+cj(v[k])).join(",")+"}";
    const h=async v=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return "0x"+[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")};
    const bc=globalThis.__ipoOneM1BControlledBrowserMeasurement;
    if(!bc||bc.driver!=="chrome_control"||!Number.isSafeInteger(bc.consoleErrorCount)||!Number.isSafeInteger(bc.failedNetworkRequestCount)||bc.consoleErrorCount<0||bc.failedNetworkRequestCount<0)throw new Error("Controlled Chrome telemetry required");
    for(const d of document.querySelectorAll("details[open]"))d.removeAttribute("open");
    let m=document.getElementById("ipo-one-m1-b-measurement-marker");if(m)m.remove();
    m=document.createElement("div");m.id="ipo-one-m1-b-measurement-marker";m.textContent=${JSON.stringify(markerText)};
    Object.assign(m.style,{position:"fixed",zIndex:"2147483647",right:"12px",bottom:"12px",padding:"10px",background:"#111827",color:"#fff",font:"700 12px system-ui",border:"2px solid #22d3ee",borderRadius:"6px"});document.body.append(m);
    const ao=await fetch("/auth/v1/options",{credentials:"same-origin",headers:{accept:"application/json"}});const ab=await ao.json();
    const authentication={active:ab?.sessionActive===true,method:ab?.sessionActive===true?ab?.sessionAuthenticationMethod??null:null};
    let nav;${navigation}let pr;${privateRead}
    const visible=e=>!!e&&!e.hidden&&e.getClientRects().length>0;
    const ps=document.querySelector(${JSON.stringify(privateSurfaceSelector(prompt.role))});
    const av=document.querySelector("[data-view-panel].active");const pa=document.getElementById(${JSON.stringify(primary)});
    const shield=document.getElementById("signedOutPrivacyShield");const gate=document.getElementById("authenticatedRuntimeGate");const w=document.documentElement.clientWidth;
    const measurement={authentication,document:{workspaceName:document.querySelector('meta[name="ipo-one-workspace-name"]')?.content??"",activeView:av?.dataset?.viewPanel??null,connectionState:document.getElementById("connectionStatus")?.textContent?.trim()??"",privacyShieldState:visible(shield)?"visible":"hidden",runtimeGateState:visible(gate)?"visible":"hidden",privateSurfaceState:visible(ps)?"visible":"hidden",primaryAction:{code:${JSON.stringify(primary)},rendered:visible(pa),enabled:!!pa&&!pa.disabled},dialogOpen:!!document.querySelector("#accessLayer:not([hidden])"),technicalDetailsOpenCount:document.querySelectorAll("details[open]").length},viewport:{class:${JSON.stringify(viewportClass(prompt.check))},innerWidth:innerWidth,innerHeight:innerHeight,clientWidth:w,scrollWidth:document.documentElement.scrollWidth,innerHeightVisible:innerHeight>0,devicePixelRatio:devicePixelRatio,horizontalOverflow:document.documentElement.scrollWidth>w,mobileMenuRendered:visible(document.getElementById("mobileMenuBtn"))},navigation:nav,privateRead:pr,marker:{rendered:visible(m),challengeHash:${JSON.stringify(prompt.capture.challengeHash)}}};
    const out={schemaVersion:"m1_b_operational_browser_measurement_response.v1",promptId:${JSON.stringify(prompt.promptId)},challenge:${JSON.stringify(prompt.capture.challenge)},role:${JSON.stringify(prompt.role)},check:${JSON.stringify(prompt.check)},phase:${JSON.stringify(prompt.phase)},origin:location.origin+"/",measurement,browserControl:{driver:bc.driver,consoleErrorCount:bc.consoleErrorCount,failedNetworkRequestCount:bc.failedNetworkRequestCount}};
    console.log(JSON.stringify(out));return out;
  })()`;
}

export function createM1BOperationalBrowserExpression(serializedPrompt) {
  const base = validatePromptBase(promptBase(serializedPrompt));
  const expression = browserExpression(base);
  if (
    Object.hasOwn(serializedPrompt, "browserExpressionHash") &&
    serializedPrompt.browserExpressionHash !== manifestHash(expression)
  ) fail("operational_browser_prompt_invalid", "Browser expression hash is invalid.");
  return expression;
}

export function validateM1BOperationalBrowserMeasurementPrompt(value) {
  const base = validatePromptBase(promptBase(value));
  const expression = browserExpression(base);
  if (
    Object.hasOwn(value, "browserExpression") &&
    value.browserExpression !== expression
  ) fail("operational_browser_prompt_invalid", "Browser expression does not match its prompt.");
  if (
    Object.hasOwn(value, "browserExpressionHash") &&
    value.browserExpressionHash !== manifestHash(expression)
  ) fail("operational_browser_prompt_invalid", "Browser expression hash does not match its prompt.");
  return Object.freeze(value);
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
            ? `${outputRootRelativePath}/${candidateReleaseId}.browser-capture.${role}.${check}.${phase}.png`
            : null,
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
          capture
        };
        prompts.push(Object.freeze({
          ...base,
          browserExpression: createM1BOperationalBrowserExpression(base)
        }));
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
    projection.workspaceKind === M1_B_OPERATIONAL_BROWSER_PRIVATE_READ[role].workspaceKind &&
    projection.serverTruth === true &&
    ["resourceCount", "continuationCount", "controlledAgentCount"].every(
      (key) => Number.isSafeInteger(projection[key]) && projection[key] >= 0
    ) && typeof projection.hasMore === "boolean" &&
    typeof projection.humanOfferReviewPresent === "boolean";
}

function validateViewport(viewport, expectedClass) {
  if (!exactKeys(viewport, [
    "class", "innerWidth", "innerHeight", "clientWidth", "scrollWidth",
    "innerHeightVisible", "devicePixelRatio", "horizontalOverflow",
    "mobileMenuRendered"
  ])) return false;
  const numeric = ["innerWidth", "innerHeight", "clientWidth", "scrollWidth", "devicePixelRatio"];
  if (
    viewport.class !== expectedClass ||
    numeric.some((key) => !Number.isFinite(viewport[key]) || viewport[key] <= 0) ||
    viewport.innerHeightVisible !== true || viewport.horizontalOverflow !== false ||
    viewport.scrollWidth > viewport.clientWidth || viewport.devicePixelRatio > 4
  ) return false;
  return expectedClass === "mobile"
    ? viewport.innerWidth >= 360 && viewport.innerWidth <= 430 &&
      viewport.innerHeight >= 640 && viewport.innerHeight <= 1_200 &&
      viewport.mobileMenuRendered === true
    : viewport.innerWidth >= 1280 && viewport.innerWidth <= 3_840 &&
      viewport.innerHeight >= 720 && viewport.innerHeight <= 2_160 &&
      viewport.mobileMenuRendered === false;
}

function validateNavigation(navigation, check, role) {
  if (!exactKeys(navigation, [
    "kind", "startHash", "intermediateHash", "backHash", "forwardHash",
    "sameDocument"
  ])) return false;
  if (check === "reload") return navigation.kind === "reload";
  if (check === "back_forward") {
    const start = role === "capital_partner" ? "#capital-partners" : "#overview";
    const intermediate = role === "capital_partner" ? "#mainContent" : "#request-credit";
    return navigation.kind === "same_document_history" &&
    navigation.sameDocument === true && typeof navigation.startHash === "string" &&
    navigation.startHash === start && navigation.backHash === start &&
    navigation.intermediateHash === intermediate &&
    navigation.forwardHash === intermediate;
  }
  return new Set(["navigate", "reload", "back_forward"]).has(navigation.kind);
}

export function validateM1BOperationalBrowserMeasurementResponse(value, prompt) {
  validateM1BOperationalBrowserMeasurementPrompt(prompt);
  if (!exactKeys(value, [
    "schemaVersion", "promptId", "challenge", "role", "check", "phase",
    "origin", "measurement", "browserControl"
  ]) || value.schemaVersion !== "m1_b_operational_browser_measurement_response.v1" ||
    value.promptId !== prompt.promptId || value.challenge !== prompt.capture.challenge ||
    value.role !== prompt.role || value.check !== prompt.check ||
    value.phase !== prompt.phase || value.origin !== prompt.origin ||
    !exactKeys(value.measurement, [
      "authentication", "document", "viewport", "navigation", "privateRead", "marker"
    ]) || !exactKeys(value.measurement.authentication, ["active", "method"]) ||
    value.measurement.authentication.active !== prompt.expected.authentication.active ||
    value.measurement.authentication.method !== prompt.expected.authentication.method ||
    !exactKeys(value.measurement.document, [
      "workspaceName", "activeView", "connectionState", "privacyShieldState",
      "runtimeGateState", "privateSurfaceState", "primaryAction", "dialogOpen",
      "technicalDetailsOpenCount"
    ]) || !exactKeys(value.measurement.document.primaryAction, ["code", "rendered", "enabled"]) ||
    value.measurement.document.workspaceName !== prompt.expected.workspaceName ||
    value.measurement.document.activeView !== prompt.expected.activeView ||
    value.measurement.document.primaryAction.code !== prompt.expected.primaryActionCode ||
    typeof value.measurement.document.connectionState !== "string" ||
    value.measurement.document.connectionState.length < 1 ||
    !new Set(["visible", "hidden"]).has(value.measurement.document.privacyShieldState) ||
    !new Set(["visible", "hidden"]).has(value.measurement.document.runtimeGateState) ||
    !new Set(["hidden", "visible"]).has(
      value.measurement.document.privateSurfaceState
    ) || typeof value.measurement.document.dialogOpen !== "boolean" ||
    !Number.isSafeInteger(value.measurement.document.technicalDetailsOpenCount) ||
    !validateViewport(value.measurement.viewport, prompt.expected.viewportClass) ||
    !validateNavigation(value.measurement.navigation, prompt.check, prompt.role) ||
    !exactKeys(value.measurement.marker, ["rendered", "challengeHash"]) ||
    value.measurement.marker.rendered !== true ||
    value.measurement.marker.challengeHash !== prompt.capture.challengeHash ||
    !exactKeys(value.browserControl, [
      "driver", "consoleErrorCount", "failedNetworkRequestCount"
    ]) || value.browserControl.driver !== "chrome_control" ||
    value.browserControl.consoleErrorCount !== 0 ||
    value.browserControl.failedNetworkRequestCount !== 0
  ) fail("operational_browser_measurement_invalid", "Browser measurement response is invalid.");
  const authenticated = prompt.expected.authentication.active;
  if (authenticated) {
    const read = value.measurement.privateRead;
    if (!exactKeys(read, [
      "operationId", "requestId", "correlationId", "httpStatus",
      "responseRequestId", "projection", "projectionHash"
    ]) || read.operationId !== prompt.readRequest.operationId ||
      read.requestId !== prompt.readRequest.requestId ||
      read.correlationId !== prompt.readRequest.correlationId ||
      read.httpStatus !== 200 || read.responseRequestId !== read.requestId ||
      !validWorkspaceProjection(prompt.role, read.projection) ||
      read.projectionHash !== manifestHash(read.projection)
    ) fail("operational_browser_measurement_invalid", "Private browser read is not exact.");
    if (
      value.measurement.document.privacyShieldState !== "hidden" ||
      value.measurement.document.runtimeGateState !== "hidden" ||
      value.measurement.document.privateSurfaceState !== "visible" ||
      value.measurement.document.connectionState !== "Secure session active" ||
      value.measurement.document.primaryAction.rendered !== true ||
      value.measurement.document.primaryAction.enabled !== true ||
      value.measurement.document.dialogOpen !== false ||
      value.measurement.document.technicalDetailsOpenCount !== 0
    ) fail("operational_browser_measurement_invalid", "Authenticated workspace DOM is not ready.");
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
  ) fail("operational_browser_measurement_invalid", "Signed-out privacy boundary is invalid.");
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

export function validateM1BOperationalBrowserPng(bytes, viewport) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 || bytes.length > 64 * 1024 * 1024 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail("operational_browser_png_invalid", "Browser screenshot is not a bounded PNG.");
  }
  let offset = 8;
  let width;
  let height;
  let ihdrCount = 0;
  let idatCount = 0;
  let iendCount = 0;
  let colorType;
  const idat = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail("operational_browser_png_invalid", "PNG chunk is truncated.");
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) fail("operational_browser_png_invalid", "PNG chunk length is invalid.");
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== expectedCrc ||
      !new Set(["IHDR", "IDAT", "IEND"]).has(type)) {
      fail("operational_browser_png_invalid", "PNG contains an invalid or unapproved chunk.");
    }
    if (type === "IHDR") {
      ihdrCount += 1;
      if (ihdrCount !== 1 || offset !== 8 || length !== 13 ||
        data[8] !== 8 || !new Set([2, 6]).has(data[9]) ||
        data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        fail("operational_browser_png_invalid", "PNG IHDR is invalid.");
      }
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") {
      if (ihdrCount !== 1 || iendCount !== 0 || length < 1) {
        fail("operational_browser_png_invalid", "PNG IDAT order is invalid.");
      }
      idatCount += 1;
      idat.push(data);
    } else {
      if (length !== 0 || ihdrCount !== 1 || idatCount < 1 || iendCount !== 0) {
        fail("operational_browser_png_invalid", "PNG IEND is invalid.");
      }
      iendCount += 1;
      if (end !== bytes.length) fail("operational_browser_png_invalid", "PNG has trailing bytes.");
    }
    offset = end;
  }
  const expectedWidth = Math.round(viewport.innerWidth * viewport.devicePixelRatio);
  const expectedHeight = Math.round(viewport.innerHeight * viewport.devicePixelRatio);
  if (ihdrCount !== 1 || idatCount < 1 || iendCount !== 1 ||
    width !== expectedWidth || height !== expectedHeight || width < 1 || height < 1) {
    fail("operational_browser_png_invalid", "PNG dimensions do not bind the measured viewport.");
  }
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const scanlineLength = 1 + width * bytesPerPixel;
  const decodedLength = scanlineLength * height;
  if (
    !Number.isSafeInteger(decodedLength) || decodedLength > 128 * 1024 * 1024
  ) fail("operational_browser_png_invalid", "PNG decoded pixel data is oversized.");
  let decoded;
  try {
    decoded = inflateSync(Buffer.concat(idat), { maxOutputLength: decodedLength });
  } catch {
    fail("operational_browser_png_invalid", "PNG pixel data cannot be decoded.");
  }
  if (
    decoded.length !== decodedLength ||
    Array.from({ length: height }, (_, row) => decoded[row * scanlineLength])
      .some((filter) => filter < 0 || filter > 4)
  ) fail("operational_browser_png_invalid", "PNG scanlines are invalid.");
  return Object.freeze({ width, height, idatCount, sha256: createHash("sha256").update(bytes).digest("hex") });
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
  const capture = prompts.at(-1).capture;
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
      challengeHash: prompt.capture.challengeHash
    })))
  });
}

function responsePhaseMismatch(response, prompt) {
  return response?.promptId !== prompt.promptId || response?.phase !== prompt.phase ||
    response?.role !== prompt.role || response?.check !== prompt.check;
}
