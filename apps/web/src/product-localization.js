import {
  LANGUAGE_STORAGE_KEY, PRODUCT_LANGUAGES, normalizeCopy, resolveLanguage,
  supportedLanguage, translateCopy
} from "./product-i18n.js";

// Presentation boundary for the existing imperative UI. Only exact owned copy
// and explicit templates can match. No innerHTML, input values, attributes that
// carry protocol values, private API calls or remote translation services.
const CORE = [".topbar", "#sidebar", ".skip-link", ".safety-banner", "#accessLayer", "#web009PublicReview .web009-nav", "#web009PublicReview .web009-hero",
  "#economicActionLayer", "#humanActivationDialog", "#authenticatedRuntimeGate", "#toast", "#operationStatus", "#appStartup", "#syntheticFeeSettlementPanel",
  ...["request-credit", "obligations", "repay-settle", "activity-proofs", "credit-track-record", "overview"]
    .map(view => `.view[data-view-panel="${view}"]`)].join(",");
const EXCLUDED = "script,style,code,pre,textarea,input,[translate=no],[data-i18n-raw],.b-hero-stage,#publicProductPage,#auditorEvidenceConsole,#agentAuthority";
const EXCLUDED_ATTRIBUTES = "script,style,code,pre,[translate=no],[data-i18n-raw],.b-hero-stage,#publicProductPage,#auditorEvidenceConsole,#agentAuthority";
const ATTRIBUTES = ["aria-label", "title", "placeholder", "aria-valuetext"];
const TECHNICAL = /^(?:[\d\s\W]+|[a-z]+[a-z0-9]*_[a-z0-9_.:-]+|[a-z]+[A-Z][A-Za-z]+|0x[\da-f.]+|(?:USD|USDC|WETH|ETH|BNB|BSC|API|MCP|SIWE|KYC|CAIP-\d+|DPD|UTC|ONE|NL|Northstar Labs|IPO\.ONE|OKX Wallet|Binance Wallet|MetaMask|WalletConnect|Ethereum|Base Sepolia|X Layer Testnet|BSC Testnet|BNB Smart Chain|Beta|v\d+))$/;
const datesOrAmounts = /^(?:[-+]?[$€₽]?\d[\d,.\s]*%?(?:\s*(?:USD|USDC|WETH))?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}(?:, \d{4})?(?:, .+)?|\d{4}-\d{2}-\d{2}(?:T.+)?)$/;
const localizedAmount = /^[-+−]?(?:(?:US\$|\$US|USD|[$€₽])\s*)?\d[\d\s.,]*\s*(?:US\$|\$US|USD|[$€₽]|%)?$/u;
const localizedDate = /^\d{1,2}(?:\s+de)?\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic|janv|févr|mars|avr|mai|juin|juil|août|déc|thg)\.?\s*[\d,\s.:\w+−-]*(?:de\s+\d{4})?$/iu;
const vietnameseDateTime = /^\d{1,2}:\d{2}(?::\d{2})?\s+\d{1,2}\s+thg\s+\d{1,2}(?:,\s+\d{4})?$/u;
let installedLocalization;
export function productLocalizationAudit() {
  return installedLocalization?.audit() ?? { language: null, missing: [], installed: false };
}
export function ownedCopyCandidate(value) {
  const s = normalizeCopy(value);
  return /[A-Za-z]{2}/.test(s) && !TECHNICAL.test(s) && !datesOrAmounts.test(s) &&
    !/^0x[\da-fA-F.…]+$/.test(s) && !/^eip155:\d+(?::0x[\da-fA-F]+)?$/.test(s) && !/^urn:[\w:./%+-]+$/.test(s) &&
    !/^[a-z][a-z0-9_:.…-]*_[a-z0-9_:.…-]+$/.test(s) && !localizedAmount.test(s) && !localizedDate.test(s) && !vietnameseDateTime.test(s) && !/^[a-z][a-z0-9.-]*\.v\d+$/.test(s) && !/^https?:\/\//.test(s);
}

export function installProductLocalization(document, window) {
  if (installedLocalization) return installedLocalization;
  let storage;
  try { storage = window.localStorage; } catch { /* A denied preference store cannot block sign-in. */ }
  let language = resolveLanguage(storage, window.navigator.languages);
  const originals = new WeakMap();
  const attributes = new WeakMap();
  let queued = false;
  let latestMissing = [];
  // Editorial walkthroughs and unmodified operator workspaces remain original
  // English source; B1 covers entry and the real Human core, not those demos.
  for (const element of document.querySelectorAll("#web009PublicReview .web009-section,#web009PublicReview .web009-footer,.b-hero-stage")) element.lang = "en";
  for (const element of document.querySelectorAll(".view[data-view-panel]")) {
    if (!element.matches(CORE)) element.lang = "en";
  }
  document.querySelector("#agentAuthority").lang = "en";
  const timeNotice = document.createElement("small");
  timeNotice.className = "product-time-notice";
  timeNotice.textContent = "Dates and times use UTC.";
  document.querySelector(".safety-banner").append(timeNotice);
  const host = document.createElement("label");
  host.className = "product-language-control";
  host.setAttribute("translate", "no");
  const caption = document.createElement("span");
  const select = document.createElement("select");
  select.id = "productLanguage";
  for (const item of PRODUCT_LANGUAGES) {
    const option = document.createElement("option");
    option.value = item.code; option.textContent = item.name; option.lang = item.code;
    select.append(option);
  }
  host.append(caption, select);
  const settings = document.querySelector(".workspace-options");
  const settingsPanel = document.createElement("div");
  settingsPanel.className = "product-display-panel";
  const modes = settings.querySelector(".mode-switch");
  settings.append(settingsPanel);
  settingsPanel.append(modes, host);
  settings.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !settings.open) return;
    event.preventDefault();
    settings.open = false;
    settings.querySelector("summary").focus();
  });
  const publicHost = host.cloneNode(true);
  const publicSelect = publicHost.querySelector("select");
  publicSelect.id = "publicProductLanguage";
  document.querySelector(".web009-nav-actions")?.prepend(publicHost);
  const warning = document.createElement("p");
  warning.id = "productTranslationWarning";
  warning.className = "product-translation-warning";
  warning.setAttribute("role", "status");
  warning.setAttribute("translate", "no");
  warning.hidden = true;
  document.querySelector("#mainContent").prepend(warning);

  function isVisible(element) {
    if (element.tagName === "OPTION") return isVisible(element.closest("select"));
    return element.checkVisibility() && !element.closest("[hidden],details:not([open]) > :not(summary)");
  }
  function localize() {
    queued = false;
    observer.disconnect();
    const panel = document.querySelector(".view.active");
    timeNotice.hidden = !panel || !["overview", "request-credit", "obligations", "repay-settle", "activity-proofs", "credit-track-record"].includes(panel.dataset.viewPanel);
    const missing = new Set();
    for (const root of document.querySelectorAll(CORE)) {
      if (root.closest(EXCLUDED)) continue;
      root.lang = language;
      // An option without value derives its submitted value from its label.
      // Freeze that original value before translating any visible option text.
      for (const option of root.querySelectorAll("option:not([value])")) option.value = option.value;
      const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const element = node.parentElement;
        if (!element || element.closest(EXCLUDED)) continue;
        const previous = originals.get(node);
        const source = previous && node.textContent === previous.rendered ? previous.source : node.textContent;
        const result = translateCopy(source, language);
        originals.set(node, { source, rendered: result.text });
        if (result.translated && node.textContent !== result.text) node.textContent = result.text;
        if (!result.translated && ownedCopyCandidate(source) && isVisible(element)) missing.add(normalizeCopy(source));
      }
      for (const element of [root, ...root.querySelectorAll(ATTRIBUTES.map(a => `[${a}]`).join(","))]) {
        if (element.closest(EXCLUDED_ATTRIBUTES)) continue;
        const previous = attributes.get(element) ?? {};
        for (const attribute of ATTRIBUTES) {
          const current = element.getAttribute(attribute);
          if (!current) continue;
          const prior = previous[attribute];
          const source = prior && current === prior.rendered ? prior.source : current;
          const result = translateCopy(source, language);
          previous[attribute] = { source, rendered: result.text };
          if (result.translated && current !== result.text) element.setAttribute(attribute, result.text);
          if (!result.translated && ownedCopyCandidate(source) && isVisible(element)) missing.add(normalizeCopy(source));
        }
        attributes.set(element, previous);
      }
    }
    document.documentElement.lang = language;
    for (const control of [host, publicHost]) {
      const title = translateCopy("Language", language).text;
      control.querySelector("span").textContent = title;
      control.querySelector("select").setAttribute("aria-label", title);
      control.querySelector("select").value = language;
    }
    latestMissing = [...missing].sort();
    warning.textContent = translateCopy("Translation incomplete; some interface text is shown in English. This version is not ready for six-language release.", language).text;
    warning.hidden = language === "en" || latestMissing.length === 0;
    // Read-only, copy-only audit surface. Contains no record IDs or user data
    // outside already rendered text; callers must keep local acceptance private.
    document.documentElement.dataset.productLanguage = language;
    document.documentElement.dataset.productTranslationMissing = String(latestMissing.length);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: [...ATTRIBUTES, "hidden", "open", "class"] });
  }
  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(localize);
  }
  const observer = new window.MutationObserver(schedule);
  function change(event) {
    const next = supportedLanguage(event.target.value);
    if (!next || next === language) return;
    language = next;
    try { storage?.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Optional preference. */ }
    for (const field of document.querySelectorAll(numericFields)) {
      if (field.validity.customError) field.setCustomValidity(translateCopy("Check this field. Use the displayed format and allowed range.", language).text);
    }
    localize();
    document.dispatchEvent(new window.CustomEvent("ipo-product-language-change", { detail: { language } }));
  }
  select.addEventListener("change", change);
  publicSelect.addEventListener("change", change);
  const numericFields = "#humanCreditAmount,#humanCreditTerm,#humanInstallments,#humanRepaymentAmount,#servicingRepaymentAmount";
  document.addEventListener("invalid", event => {
    if (event.target.matches(numericFields)) event.target.setCustomValidity(translateCopy("Check this field. Use the displayed format and allowed range.", language).text);
  }, true);
  document.addEventListener("input", event => {
    if (event.target.matches(numericFields)) event.target.setCustomValidity("");
  });
  window.addEventListener("storage", event => {
    if (event.key !== LANGUAGE_STORAGE_KEY) return;
    const next = supportedLanguage(event.newValue);
    if (next && next !== language) {
      language = next;
      localize();
      document.dispatchEvent(new window.CustomEvent("ipo-product-language-change", { detail: { language } }));
    }
  });
  localize();
  installedLocalization = Object.freeze({ get language() { return language; }, audit: () => ({ language, missing: [...latestMissing] }), refresh: localize });
  return installedLocalization;
}
