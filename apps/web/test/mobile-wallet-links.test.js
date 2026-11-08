import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { phoneWalletLinks } from "../src/mobile-wallet-links.js";
import { MOBILE_WALLET_APPROVAL, mobileWalletApprovalIsCurrent } from "../src/wallet-connection-policy.js";

test("renewal policy matches the exact recorded Founder grant and rejects invalid or expired clocks", async () => {
  const grant = JSON.parse(await readFile(new URL("../../../docs/governance/approvals/B2_MOBILE_NO_FUNDS_20261108.json", import.meta.url), "utf8"));
  assert.equal(MOBILE_WALLET_APPROVAL.expiresAt, grant.expiresAt);
  assert.equal(MOBILE_WALLET_APPROVAL.origin, grant.origin);
  assert.match(grant.status, /^APPROVED_BOUNDED_B2/);
  const boundary = new Date(grant.expiresAt);
  assert.equal(mobileWalletApprovalIsCurrent(boundary), true);
  assert.equal(mobileWalletApprovalIsCurrent(new Date(boundary.getTime() + 1)), false);
  for (const clock of [new Date(NaN), null, "2026-11-09"]) assert.equal(mobileWalletApprovalIsCurrent(clock), false);
});

test("wallet launch targets are fixed, encode pairing once, and review links contain no pairing secret", () => {
  const uri = `wc:${"a".repeat(64)}@2?relay-protocol=irn&symKey=${"b".repeat(64)}`;
  const links = phoneWalletLinks(uri);
  assert.equal(links.length, 4, "three brands; OKX exchange and standalone apps are distinct");
  assert.deepEqual(links.map(x => x.href.split("wc?")[0]), ["bnc://app.binance.com/cedefi/", "okex://main/", "okxwallet://main/", "metamask://"]);
  for (const link of links) {
    assert.equal(decodeURIComponent(link.href.split("?uri=")[1]), uri);
    assert.equal(link.href.includes("&symKey="), false);
  }
  for (const link of phoneWalletLinks()) assert.equal(link.href.includes("uri="), false);
  for (const value of ["javascript:alert(1)", "https://attacker.invalid/wc", "wc:bad\" onclick=alert(1)", "wc:" + "x".repeat(2046), {}, null])
    assert.throws(() => phoneWalletLinks(value), /invalid/);
});
