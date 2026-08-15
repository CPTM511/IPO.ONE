import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileMinimalErc1271TestWallet } from "../../deploy/testnet/compile-erc1271-test-wallet.mjs";

test("minimal ERC-1271 test wallet compiles reproducibly without deployment authority", async () => {
  const first = await compileMinimalErc1271TestWallet();
  const second = await compileMinimalErc1271TestWallet();
  assert.equal(first.compilerVersion.startsWith("0.8.30+"), true);
  assert.equal(first.sourceSha256, second.sourceSha256);
  assert.equal(first.creationBytecodeKeccak256, second.creationBytecodeKeccak256);
  assert.equal(first.deployedBytecodeKeccak256, second.deployedBytecodeKeccak256);
  assert.equal(first.bytecode, second.bytecode);
  assert.equal(first.deployedBytecode, second.deployedBytecode);
  assert.equal(first.deploymentAuthorized, false);
  assert.equal(first.productionFundsMoved, false);

  const functions = first.abi
    .filter(({ type }) => type === "function")
    .map(({ name }) => name)
    .sort();
  assert.deepEqual(functions, [
    "ERC1271_MAGIC_VALUE",
    "INVALID_SIGNATURE",
    "MAX_LIFETIME_SECONDS",
    "expiresAt",
    "isValidSignature",
    "owner"
  ]);
  for (const forbidden of [
    "approve",
    "borrow",
    "delegate",
    "execute",
    "lend",
    "repay",
    "transfer",
    "transferFrom",
    "upgradeTo",
    "withdraw"
  ]) {
    assert.equal(first.abi.some(({ name }) => name === forbidden), false);
  }
});

test("contract source is low-s, expiring, non-upgradeable, and rejects value", async () => {
  const source = await readFile(
    new URL("../IpoOneMinimalErc1271TestWalletV1.sol", import.meta.url),
    "utf8"
  );
  assert.match(source, /MAX_LIFETIME_SECONDS = 7 days/);
  assert.match(source, /ERC1271_MAGIC_VALUE = 0x1626ba7e/);
  assert.match(source, /SECP256K1_HALF_ORDER/);
  assert.match(source, /signature\.length != 65/);
  assert.match(source, /ecrecover\(hash, v, r, s\) == owner/);
  assert.match(source, /receive\(\) external payable/);
  assert.match(source, /fallback\(\) external payable/);
  assert.doesNotMatch(
    source,
    /selfdestruct|delegatecall|function\s+(?:approve|execute|transfer|upgrade|withdraw)\b|\.call\{|\.send\(|\.transfer\(/
  );
});
