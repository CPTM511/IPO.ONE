import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_COPY } from "../src/product-copy.js";
import { PRODUCT_LANGUAGES, LANGUAGE_STORAGE_KEY, resolveLanguage, supportedLanguage,
  translateCopy, validateProductCopy, formatMinorAmount, formatProductDate } from "../src/product-i18n.js";
import { AUTHENTICATION_ERROR_COPY, authenticationErrorCopy, PRODUCT_ERROR_COPY, productErrorCopy, workspaceKindLabel, workspaceSessionPresentation } from "../src/product-error-presentation.js";
import { walletSignInErrorMessage } from "../src/wallet-sign-in-attempt.js";
import { ownedCopyCandidate } from "../src/product-localization.js";
import { walletProviderDiscoveryCopy, walletSignInSummaryCopy, walletSelectedCopy } from "../src/authentication-availability-presentation.js";
import { mobileWalletAvailability } from "../src/mobile-wallet-access.js";

test("durable resume without a historical Offer preserves resource counts and obligation schedule versions in all languages", () => {
  for (const { code } of PRODUCT_LANGUAGES) {
    const payment = translateCopy("$60.00\nDue Aug 15", code);
    assert.equal(payment.translated, true);
    assert.ok(payment.text.includes("$60.00"));
    assert.ok(payment.text.includes("Aug 15"));
    for (const count of [0, 1, 4, 513]) {
      const source = `${count} Actor-bound resource reference${count === 1 ? "" : "s"} restored after session verification.`;
      const result = translateCopy(source, code);
      assert.equal(result.translated, true, `${code}: ${source}`);
      assert.ok(result.text.includes(String(count)));
    }
    for (const state of ["Created", "Active", "Fully Repaid", "Defaulted", "Written Off"]) {
      const result = translateCopy(`${state} · schedule v12`, code);
      assert.equal(result.translated, true, `${code}: ${state}`);
      assert.ok(result.text.includes("v12"));
    }
  }
  assert.equal(translateCopy("A future unknown state · schedule v12", "zh").translated, false);
});

test("live login configuration, provider counts and session loss have all six translations without enabling phone pairing", () => {
  const copy = ["Secure session ended. Private browser state was cleared."];
  for (const label of ["Human Borrower", "Principal Controller", "Workspace"]) copy.push(walletSignInSummaryCopy(label));
  for (const name of ["Binance Wallet", "OKX Wallet", "Untrusted wallet name"]) {
    const source = walletSelectedCopy(name); copy.push(source);
    for (const { code } of PRODUCT_LANGUAGES) assert.ok(translateCopy(source, code).text.includes(name));
  }
  for (const providerState of ["discovering", "ready"]) for (const providerCount of [0, 1, 2, 3, 16]) for (const selectedProvider of [false, true])
    copy.push(walletProviderDiscoveryCopy({ providerState, providerCount, selectedProvider }));
  for (const origin of ["http://127.0.0.1:4332", "https://ipo.one"]) for (const projectId of ["", "1".repeat(32)]) {
    const p = mobileWalletAvailability({ origin, projectId, now: new Date("2026-11-08T00:00:00Z") });
    assert.equal(p.available, false);
    copy.push(p.reason);
  }
  for (const source of copy) for (const { code } of PRODUCT_LANGUAGES) assert.equal(translateCopy(source, code).translated, true, `${code}: ${source}`);
});

test("role mismatch recovery localizes both roles without confusing accountable Principal with money", () => {
  assert.equal(workspaceKindLabel("principal_controller"), "Principal Controller");
  assert.equal(workspaceKindLabel("untrusted_role"), "another role");
  assert.equal(translateCopy("Principal", "zh").text, "本金");
  for (const expected of ["human_borrower", "principal_controller", undefined])
    for (const received of ["human_borrower", "principal_controller", undefined])
      for (const message of Object.values(workspaceSessionPresentation(expected, received))) {
        for (const { code } of PRODUCT_LANGUAGES) assert.equal(translateCopy(message, code).translated, true, `${code}: ${message}`);
        assert.equal(translateCopy(message, "zh").text.includes("本金"), false);
      }
});

test("six complete dictionaries reject missing keys, duplicate copy and changed bound values", () => {
  assert.deepEqual(PRODUCT_LANGUAGES.map(item => item.code), ["en", "zh", "es", "fr", "ru", "vi"]);
  assert.equal(validateProductCopy().entries, PRODUCT_COPY.length);
  const sample = ["Offer {hash}", "报价 {hash}", "Oferta {hash}", "Offre {hash}", "Предложение {hash}", "Đề nghị {hash}"];
  assert.throws(() => validateProductCopy([[...sample.slice(0, 5), "Đề nghị"]]), /placeholders/);
  assert.throws(() => validateProductCopy([sample, sample]), /duplicate/);
  assert.throws(() => validateProductCopy([[...sample.slice(0, 5), ""]]), /Missing/);
});

test("locale preference is optional, allowlisted and independent of authorization", () => {
  const values = new Map([[LANGUAGE_STORAGE_KEY, "ru"]]);
  assert.equal(resolveLanguage({ getItem: key => values.get(key) }, ["zh-CN"]), "ru");
  assert.equal(resolveLanguage({ getItem() { throw new Error("denied"); } }, ["pt-BR", "vi-VN"]), "vi");
  assert.equal(resolveLanguage({ getItem: () => "javascript:alert(1)" }, ["pt"]), "en");
  assert.equal(supportedLanguage("ZH-cn"), "zh");
  assert.equal(supportedLanguage({ role: "admin" }), null);
});

test("presentation templates preserve exact IDs, dates and currency amounts; unknown records remain unchanged", () => {
  const source = "$120.00 repaid · $9,007,199,254,740,993.21 outstanding";
  for (const { code } of PRODUCT_LANGUAGES) {
    const result = translateCopy(source, code);
    assert.equal(result.translated, true);
    assert.ok(result.text.includes("$120.00"));
    assert.ok(result.text.includes("$9,007,199,254,740,993.21"));
    assert.equal(translateCopy("obligation_private_0x1234", code).text, "obligation_private_0x1234");
    assert.equal(translateCopy("<script>untrusted</script>", code).translated, false);
    assert.ok(translateCopy("Active · obligation_private_exact", code).text.endsWith("obligation_private_exact"));
    assert.ok(translateCopy("Active · Current", code).text.endsWith("Current"));
  }
  assert.throws(() => translateCopy("Sign in", "xx"), /Unsupported/);
  assert.equal(translateCopy("fully repaid", "en").text, "fully repaid");
  assert.equal(translateCopy("Fully repaid", "zh").text, "全部还清");
  assert.equal(translateCopy("Open record 1 · New unknown state · Jul 16", "zh").translated, false);
  assert.equal(translateCopy("#1 · Scheduled · Aug 15, 2026", "zh").translated, true);
  assert.equal(translateCopy("$0.00 repaid · $120.00 outstanding", "zh").translated, true);
  assert.equal(translateCopy("Server returned an unexpected error", "zh").translated, false);
  assert.equal(translateCopy("Current · DPD 0 · —", "zh").translated, true);
  assert.equal(translateCopy("#1 · Scheduled · 14 sept 2026", "es").translated, true);
  assert.equal(translateCopy("#1 · Scheduled · 14 sept. 2026", "fr").translated, true);
  assert.equal(ownedCopyCandidate("02:00 15 thg 7"), false);
  assert.equal(ownedCopyCandidate("12:01 16 thg 7, 2026"), false);
  assert.equal(ownedCopyCandidate("An unknown blocking message"), true);
  const snapshot = "Snapshot as of 16 авг. 2026 г., 12:00:00 UTC. On Time Repaid is the latest terminal Credit Outcome in this snapshot. Last successful worker attempt: 16 авг. 2026 г., 11:45:00 UTC. The hosted materializer runs every 15 minutes; backlogs or failures can delay updates. Reload the verified record to check for newer outcomes; this view does not update automatically. It does not authorize funds or an automatic limit change.";
  const localizedSnapshot = translateCopy(snapshot, "ru");
  assert.equal(localizedSnapshot.translated, true);
  assert.ok(localizedSnapshot.text.includes("16 авг. 2026 г., 12:00:00 UTC"));
  assert.ok(localizedSnapshot.text.includes("16 авг. 2026 г., 11:45:00 UTC"));
});

test("minor-unit formatting never rounds through floating point", () => {
  for (const { code } of PRODUCT_LANGUAGES) {
    assert.equal(formatMinorAmount("9007199254740993123", "USD", code).replace(/\D/g, ""), "9007199254740993123");
    assert.equal(formatMinorAmount("1", "USD", code).replace(/\D/g, ""), "001");
    assert.ok(formatMinorAmount("-1", "USD", code).includes("-"));
    assert.equal(formatMinorAmount("12000", "USD", code).replace(/\D/g, ""), "12000");
  }
  assert.throws(() => formatMinorAmount("1.23", "USD"));
  assert.throws(() => formatMinorAmount("1", "<img>"));
});

test("due dates use explicit UTC across locales without changing the source timestamp", () => {
  const date = new Date("2026-11-07T23:59:00.000Z");
  for (const { code, locale } of PRODUCT_LANGUAGES) {
    assert.equal(formatProductDate(date, code, { dateStyle: "short", timeZone: "Asia/Shanghai" }),
      new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: "UTC" }).format(date));
  }
  assert.equal(date.toISOString(), "2026-11-07T23:59:00.000Z");
});

test("server error summaries remain non-authorizing and every recovery summary has all six translations", () => {
  assert.equal(productErrorCopy({ code: "authentication_session_expired" }), PRODUCT_ERROR_COPY.session);
  assert.equal(productErrorCopy({ code: "authorization_denied", detail: "SECRET_OTHER_TENANT" }), PRODUCT_ERROR_COPY.access);
  assert.equal(productErrorCopy({ status: 409 }), PRODUCT_ERROR_COPY.stale);
  assert.equal(productErrorCopy({ code: "region_restricted", status: 403 }), PRODUCT_ERROR_COPY.restriction);
  assert.equal(productErrorCopy({ code: "new_unknown_provider_code", status: 502 }), PRODUCT_ERROR_COPY.unknown);
  for (const source of Object.values(PRODUCT_ERROR_COPY)) {
    for (const { code } of PRODUCT_LANGUAGES) assert.equal(translateCopy(source, code).translated, true);
  }
});

test("authentication keeps an explicit original service stop and localizes its recovery summary", () => {
  const error = { status: 403, userMessage: authenticationErrorCopy({ status: 403 }), serviceDiagnostic: "Local review stops before signing" };
  const source = walletSignInErrorMessage(error);
  assert.ok(source.includes(error.serviceDiagnostic));
  for (const { code } of PRODUCT_LANGUAGES) {
    const result = translateCopy(source, code);
    assert.equal(result.translated, true);
    assert.ok(result.text.includes(error.serviceDiagnostic));
  }
  assert.equal(authenticationErrorCopy({ code: "authentication_unavailable", status: 503 }), AUTHENTICATION_ERROR_COPY.unavailable);
  assert.match(walletSignInErrorMessage({ ...error, phase: "verify", status: 503 }), /could not be confirmed/);
});
