import { readFile } from "node:fs/promises";
import { AUTHENTICATION_ERROR_COPY, PRODUCT_ERROR_COPY, workspaceSessionPresentation } from "../apps/web/src/product-error-presentation.js";
import { walletSignInErrorMessage } from "../apps/web/src/wallet-sign-in-attempt.js";
import { creditSnapshotPresentation } from "../apps/web/src/credit-snapshot-browser.js";
import { createAuthenticationAvailabilityPresentation, createManagementAccessPresentation, createSandboxProfileActivationPresentation, walletProviderDiscoveryCopy, walletSignInSummaryCopy, walletSelectedCopy } from "../apps/web/src/authentication-availability-presentation.js";
import { mobileWalletAvailability } from "../apps/web/src/mobile-wallet-access.js";
import { ownedCopyCandidate } from "../apps/web/src/product-localization.js";
import { PRODUCT_LANGUAGES, normalizeCopy, translateCopy, validateProductCopy } from "../apps/web/src/product-i18n.js";
import { WORKSPACE_NAVIGATION_MANIFEST } from "../apps/web/src/workspace-surface-access.js";

// Source-copy inventory over our authored HTML, not an HTML sanitizer. Only
// owned labels/copy enter the catalog; input values and protocol/code are raw.
const html = await readFile(new URL("../apps/web/src/index.html", import.meta.url), "utf8");
const views = new Set(["overview", "obligations", "repay-settle", "activity-proofs", "credit-track-record"]);
const ids = new Set(["sidebar", "accessLayer", "economicActionLayer", "humanActivationDialog", "authenticatedRuntimeGate", "appStartup"]);
const classes = new Set(["topbar", "safety-banner", "request-credit-human", "web009-nav", "web009-hero"]);
const voidTags = new Set(["input", "meta", "link", "img", "br", "hr", "source", "wbr", "area", "base", "embed", "param", "track", "col"]);
const excluded = new Set(["script", "style", "code", "pre", "textarea"]);
const decode = value => value.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[\da-f]+|\d+);/gi, entity => {
  const named = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " };
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
  return String.fromCodePoint(entity[2].toLowerCase() === "x" ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1)));
});
const copy = new Set(Object.values(PRODUCT_ERROR_COPY));
const durableRuntimeCopy = JSON.parse(await readFile(new URL("../apps/web/test/fixtures/durable-human-runtime-copy.v1.json", import.meta.url), "utf8"));
for (const source of durableRuntimeCopy.examples) copy.add(source);
copy.add("Secure session ended. Private browser state was cleared.");
for (const label of ["Human Borrower", "Principal Controller", "Workspace"]) copy.add(walletSignInSummaryCopy(label));
for (const name of ["Binance Wallet", "OKX Wallet", "Untrusted wallet name"]) copy.add(walletSelectedCopy(name));
for (const providerState of ["discovering", "ready"]) for (const providerCount of [0, 1, 2, 3, 16]) for (const selectedProvider of [false, true])
  copy.add(walletProviderDiscoveryCopy({ providerState, providerCount, selectedProvider }));
for (const origin of ["http://127.0.0.1:4332", "https://ipo.one"]) for (const projectId of ["", "1".repeat(32)]) for (const time of ["2026-11-08T00:00:00Z", "2026-12-09T00:00:00Z"])
  copy.add(mobileWalletAvailability({ origin, projectId, now: new Date(time) }).reason);
// Inventory the existing gateway status labels, including ternary branches.
// Only quoted assignment results enter the copy gate; protocol comparisons do not.
const appSource = await readFile(new URL("../apps/web/src/app.js", import.meta.url), "utf8");
// Restored SIWE sessions keep server authority but must reconnect the wallet
// before Offer acceptance. Inventory both visible branches, including text
// that is absent from the initial HTML and connected-wallet happy path.
for (const match of appSource.matchAll(/el\("(?:acceptHumanOfferBtn|humanOfferBoundary)"\)\.textContent\s*=\s*([^;]+);/g)) {
  for (const literal of match[1].matchAll(/"(?:[^"\\]|\\.)*"/g)) {
    const source = JSON.parse(literal[0]);
    if (ownedCopyCandidate(source)) copy.add(source);
  }
}
// Include every authored history-controller state, not only its settled pages.
const historySource = await readFile(new URL("../apps/web/src/obligation-history-browser.js", import.meta.url), "utf8");
const mobileSource = await readFile(new URL("../apps/web/src/mobile-wallet-access.js", import.meta.url), "utf8");
for (const match of `${historySource}\n${mobileSource}`.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
  const value = JSON.parse(match[0]);
  if (/\s/.test(value) && ownedCopyCandidate(value)) copy.add(value);
}
// Durable resume can return an Obligation without its historical Intent/Offer.
// Inventory the actual overview/recovery branches as well as authored HTML.
for (const view of ["overview", "request-credit", ...views]) {
  for (const value of Object.values(WORKSPACE_NAVIGATION_MANIFEST.views[view]))
    if (typeof value === "string") copy.add(value);
}
for (const [start, end] of [
  ["function renderV9ShellStates()", "  if (tenantPilot.decision)"],
  ["function renderPrivateProductSurfaces()", "  const obligationPortfolio = renderObligationPortfolio();"]
]) {
  const offset = appSource.indexOf(start);
  const limit = appSource.indexOf(end, offset);
  if (offset < 0 || limit < offset) throw new Error("Durable overview copy inventory boundary changed");
  const source = appSource.slice(offset, limit);
  for (const match of source.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
    const value = JSON.parse(match[0]);
    if (/\s/.test(value) && ownedCopyCandidate(value)) copy.add(value);
  }
}
for (const count of [0, 1, 4, 513]) {
  copy.add(`${count} Actor-bound resource reference${count === 1 ? "" : "s"} restored after session verification.`);
  copy.add(`${count} latest verified`);
  copy.add(`${count} partial`);
  copy.add(`Repayment complete · ${count} partial Evidence events`);
  copy.add(`${count} partial Evidence events loaded`);
}
for (const state of ["Approved", "Offered", "Accepted"]) {
  copy.add(`${state} · US$120.00`);
}
for (const state of ["Created", "Active", "Fully Repaid", "Defaulted", "Written Off"])
  for (const version of [1, 12]) copy.add(`${state} · schedule v${version}`);
copy.add("Anchor service unavailable");
copy.add("No chain contract is composed for this runtime. Server Evidence digests must not be presented as blockchain transactions.");
copy.add("$60.00\nDue Aug 15");
for (const match of appSource.matchAll(/connectionLabel\s*:\s*("(?:[^"\\]|\\.)*")/g)) copy.add(JSON.parse(match[1]));
for (const match of appSource.matchAll(/(?:connectionLabel|accessState\.helper)\s*=\s*([^;]+);/g)) {
  const expression = match[1];
  const direct = expression.match(/^("(?:[^"\\]|\\.)*")/);
  if (direct) copy.add(JSON.parse(direct[1]));
  for (const branch of expression.matchAll(/[?:]\s*("(?:[^"\\]|\\.)*")/g)) copy.add(JSON.parse(branch[1]));
}
for (const match of appSource.matchAll(/reason:\s*("(?:[^"\\]|\\.)*")/g)) {
  const source = JSON.parse(match[1]);
  if (/[A-Za-z]+\s+[A-Za-z]+/.test(source)) copy.add(source);
}
for (const expected of ["human_borrower", "principal_controller", undefined])
  for (const received of ["human_borrower", "principal_controller", undefined])
    for (const message of Object.values(workspaceSessionPresentation(expected, received))) copy.add(message);
for (const value of Object.values(AUTHENTICATION_ERROR_COPY)) copy.add(value);
copy.add(walletSignInErrorMessage({ userMessage: AUTHENTICATION_ERROR_COPY.other, serviceDiagnostic: "Original provider notice" }));
for (const code of [4001, -32002, 4900, 4901, 4100, 4200]) copy.add(walletSignInErrorMessage({ code }));
for (const phase of ["connect", "signature", "verify"]) copy.add(walletSignInErrorMessage({ code: "wallet_sign_in_timeout", phase }));
copy.add(walletSignInErrorMessage({}));
copy.add(walletSignInErrorMessage({ status: 403, message: "Original provider notice" }));
for (const state of [{}, { busy: true }, ...["credit_state_projection_incomplete", "credit_state_resource_limit", "credit_state_no_finalized_outcomes", "tenant_resource_unavailable", "authorization_denied", "read_failed"].map(errorCode => ({ error: true, errorCode }))]) {
  const p = creditSnapshotPresentation(state);
  copy.add(p.label); copy.add(p.title); copy.add(p.copy);
}
for (const profileStatus of ["pending", "active"]) for (const catalogAvailable of [true, false]) {
  const p = createSandboxProfileActivationPresentation({ profileStatus, catalogAvailable, authenticationProfile: "local_no_funds" });
  copy.add(p.label); copy.add(p.detail);
}
// Exercise existing availability branches without inventing sign-in authority.
for (const optionsState of ["checking", "ready", "failed"]) {
  const management = createManagementAccessPresentation({ optionsState });
  for (const key of ["publicScopeDetail", "passkeyLabel", "passkeyDetail"]) copy.add(management[key]);
  for (const walletProviderState of ["discovering", "ready", "disposed"])
    for (const walletAuthorityState of ["available", "invalidated", "pending", "unavailable"])
      for (const walletProviderCount of [0, 1]) for (const selectedWalletProvider of [false, true])
        for (const walletAuthenticationEnabled of [false, true]) for (const walletAuthorityCanRetry of [false, true]) for (const oidcAuthenticationEnabled of [false, true]) {
          const p = createAuthenticationAvailabilityPresentation({ optionsState, walletProviderState, walletAuthorityState,
            walletProviderCount, selectedWalletProvider, walletAuthenticationEnabled, walletAuthorityCanRetry,
            oidcAuthenticationEnabled, oidcProviderIds: ["google", "email", "approved-provider"] });
          copy.add(p.status);
          for (const provider of p.oidcProviders) { copy.add(provider.label); copy.add(provider.detail); }
        }
}
const stack = [];
for (const token of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z](?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g)) {
  const text = token[0];
  if (text.startsWith("<!")) continue;
  const closing = text.match(/^<\/([\w-]+)/);
  if (closing) {
    const index = stack.findLastIndex(item => item.tag === closing[1]);
    if (index >= 0) stack.splice(index);
    continue;
  }
  const opening = text.match(/^<([\w-]+)/);
  if (!opening) {
    const parent = stack.at(-1);
    if (parent?.active && !parent.raw) copy.add(normalizeCopy(decode(text)));
    continue;
  }
  const tag = opening[1];
  const attributes = Object.fromEntries([...text.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1], decode(match[2] ?? match[3])]));
  const active = stack.at(-1)?.active || ids.has(attributes.id) || views.has(attributes["data-view-panel"]) || attributes.class?.split(/\s+/).some(name => classes.has(name));
  const raw = stack.at(-1)?.raw || excluded.has(tag) || attributes.translate === "no" || ["auditorEvidenceConsole", "agentAuthority"].includes(attributes.id);
  if (active && !raw) for (const key of ["aria-label", "title", "placeholder"]) if (attributes[key]) copy.add(normalizeCopy(attributes[key]));
  if (!voidTags.has(tag) && !text.endsWith("/>")) stack.push({ tag, active, raw });
}
const missing = [...copy].filter(ownedCopyCandidate).filter(source => PRODUCT_LANGUAGES.some(({ code }) => !translateCopy(source, code).translated)).sort();
if (missing.length) {
  console.error(JSON.stringify({ missingCoreCopy: missing }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Core localization verified: ${validateProductCopy().entries} entries, 6 languages, ${copy.size} owned source labels, no missing core copy.`);
}
