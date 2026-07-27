import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BUNDLE = new URL(
  "../src/vendor/walletconnect-ethereum-provider-2.23.10.iife.js",
  import.meta.url
);
const LICENSE = new URL(
  "../src/vendor/walletconnect-community-license.txt",
  import.meta.url
);

test("fixed WalletConnect browser bundle is deterministic, same-origin, and carries its license", async () => {
  const [bundle, license] = await Promise.all([
    readFile(BUNDLE),
    readFile(LICENSE)
  ]);

  assert.equal(bundle.length, 1_998_764);
  assert.equal(
    createHash("sha256").update(bundle).digest("hex"),
    "b1b3761ef4ceb33f080bea9b91dec8eca47f1a39e4a88f1736f95f0340c5be1b"
  );
  assert.match(bundle.toString("utf8", 0, 500), /IpoOneWalletConnectBundle/);
  assert.equal(bundle.includes(Buffer.from("sourceMappingURL=")), false);
  assert.equal(
    createHash("sha256").update(license).digest("hex"),
    "1cb6f8cfe21f54ab1105105717eaa2ba08343037a2a9c41dfd5ab09e3ce270fc"
  );
  assert.match(
    license.toString("utf8"),
    /WALLETCONNECT COMMUNITY LICENSE AGREEMENT/
  );
});
