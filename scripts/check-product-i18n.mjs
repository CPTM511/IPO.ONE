import { readFile } from "node:fs/promises";
import { AUTHENTICATION_ERROR_COPY, PRODUCT_ERROR_COPY } from "../apps/web/src/product-error-presentation.js";
import { walletSignInErrorMessage } from "../apps/web/src/wallet-sign-in-attempt.js";
import { creditSnapshotPresentation } from "../apps/web/src/credit-snapshot-browser.js";
import { createAuthenticationAvailabilityPresentation, createManagementAccessPresentation, createSandboxProfileActivationPresentation } from "../apps/web/src/authentication-availability-presentation.js";
import { ownedCopyCandidate } from "../apps/web/src/product-localization.js";
import { PRODUCT_LANGUAGES, normalizeCopy, translateCopy, validateProductCopy } from "../apps/web/src/product-i18n.js";

// Source-copy inventory over our authored HTML, not an HTML sanitizer. Only
// owned labels/copy enter the catalog; input values and protocol/code are raw.
const html = await readFile(new URL("../apps/web/src/index.html", import.meta.url), "utf8");
const views = new Set(["overview", "obligations", "repay-settle", "activity-proofs", "credit-track-record"]);
const ids = new Set(["sidebar", "accessLayer", "economicActionLayer", "humanActivationDialog", "appStartup"]);
const classes = new Set(["topbar", "safety-banner", "request-credit-human", "web009-nav", "web009-hero"]);
const voidTags = new Set(["input", "meta", "link", "img", "br", "hr", "source", "wbr", "area", "base", "embed", "param", "track", "col"]);
const excluded = new Set(["script", "style", "code", "pre", "textarea"]);
const decode = value => value.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[\da-f]+|\d+);/gi, entity => {
  const named = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " };
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
  return String.fromCodePoint(entity[2].toLowerCase() === "x" ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1)));
});
const copy = new Set(Object.values(PRODUCT_ERROR_COPY));
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
