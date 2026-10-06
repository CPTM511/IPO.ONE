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

  assert.equal(bundle.length, 2_011_612);
  assert.equal(
    createHash("sha256").update(bundle).digest("hex"),
    "63582c6d0c59f7bce5a9ed1260c2949e4348ebd2d90edda1eeadda0f4a7fe4cb"
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
