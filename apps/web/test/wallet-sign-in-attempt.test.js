import assert from "node:assert/strict";
import test from "node:test";
import { createWalletSignInAttempt, walletSignInErrorMessage } from "../src/wallet-sign-in-attempt.js";

function deferred() {
  let resolve;
  const promise = new Promise(value => { resolve = value; });
  return { promise, resolve };
}

test("wallet request starts synchronously in the click activation and clears its deadline", async () => {
  let started = false;
  let cleared = 0;
  const attempt = createWalletSignInAttempt({ setTimer: () => 7, clearTimer: id => {
    assert.equal(id, 7); cleared++;
  } });
  const result = attempt.run(() => { started = true; return 42; }, { phase: "connect", timeoutMs: 60_000 });
  assert.equal(started, true);
  assert.equal(await result, 42);
  assert.equal(cleared, 1);
  attempt.cancel();
});

test("timeout aborts the operation and a late wallet response cannot advance it", async () => {
  const pending = deferred();
  let deadline;
  let advanced = false;
  const attempt = createWalletSignInAttempt({ setTimer: callback => { deadline = callback; return 1; }, clearTimer() {} });
  const result = attempt.run(() => pending.promise, { phase: "connect", timeoutMs: 60_000 }).then(() => { advanced = true; });
  deadline();
  await assert.rejects(result, error => error.code === "wallet_sign_in_timeout" && error.phase === "connect");
  assert.equal(attempt.signal.aborted, true);
  pending.resolve("late");
  await Promise.resolve();
  assert.equal(advanced, false);
  assert.throws(() => attempt.run(() => {}, { phase: "signature", timeoutMs: 1 }), { code: "wallet_sign_in_interrupted" });
});

test("interrupting a pending service or wallet request discards late results", async () => {
  for (const phase of ["connect", "challenge", "signature", "verify"]) {
    const pending = deferred();
    const attempt = createWalletSignInAttempt();
    const result = attempt.run(() => pending.promise, { phase, timeoutMs: 60_000 });
    attempt.cancel();
    await assert.rejects(result, { code: "wallet_sign_in_interrupted" });
    pending.resolve("late");
    assert.equal(attempt.isActive(), false);
  }
});

test("recovery distinguishes rejection, existing popup, network failure and explicit restrictions", () => {
  assert.match(walletSignInErrorMessage({ code: "4001" }), /rejected.*try again/);
  assert.match(walletSignInErrorMessage({ code: -32002 }), /already open.*dismiss/);
  assert.match(walletSignInErrorMessage({ code: 4900 }), /disconnected/);
  assert.match(walletSignInErrorMessage({ code: 4100 }), /not authorized/);
  assert.match(walletSignInErrorMessage({ code: 4200 }), /same BNB network/);
  assert.match(walletSignInErrorMessage({ code: "wallet_sign_in_timeout", phase: "challenge" }), /sign-in service/);
  assert.match(walletSignInErrorMessage({ message: "Service is restricted in your jurisdiction", status: 403 }), /restricted in your jurisdiction/);
  assert.doesNotMatch(walletSignInErrorMessage({ message: "Forbidden", status: 403 }), /jurisdiction|country|geograph|VPN/);
  assert.match(walletSignInErrorMessage({ code: "wallet_sign_in_timeout", phase: "verify" }), /could not be confirmed.*Reload/);
  assert.doesNotMatch(walletSignInErrorMessage(new Error("Network error"), { phase: "verify" }), /not completed/);
});
