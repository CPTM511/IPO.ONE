import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileCreditAuthorizationRegistry } from "../../deploy/testnet/compile-credit-registry.mjs";

test("credit authorization registry compiles reproducibly with one closed testnet ABI", async () => {
  const first = await compileCreditAuthorizationRegistry();
  const second = await compileCreditAuthorizationRegistry();
  assert.equal(first.compilerVersion.startsWith("0.8.30+"), true);
  assert.equal(first.bytecode, second.bytecode);
  assert.equal(first.deployedBytecode, second.deployedBytecode);
  const functions = first.abi.filter(({ type }) => type === "function").map(({ name }) => name).sort();
  assert.deepEqual(functions, [
    "chainProfileHash", "chainProfileVersion", "closeAuthorization", "getAuthorization",
    "isActive", "operator", "paused", "publishAuthorization", "publisher",
    "revokeAuthorization", "rotatePublisher", "setPaused", "suspendAuthorization", "updateProof"
  ]);
  for (const forbidden of ["approve", "borrow", "lend", "repay", "transfer", "upgradeTo", "withdraw"]) {
    assert.equal(functions.includes(forbidden), false);
  }
});

test("registry source has immutable authority, version checks, privacy hashes, and no external call path", async () => {
  const source = await readFile(new URL("../IpoOneCreditAuthorizationRegistryV1.sol", import.meta.url), "utf8");
  assert.match(source, /address public immutable operator/);
  assert.match(source, /bytes32 public immutable chainProfileHash/);
  assert.match(source, /acceptedOfferHash/);
  assert.match(source, /StaleAuthorizationVersion/);
  assert.match(source, /function rotatePublisher/);
  assert.match(source, /function setPaused/);
  assert.match(source, /receive\(\) external payable/);
  assert.doesNotMatch(source, /selfdestruct|delegatecall|\.call\{|\.transfer\(|\.send\(/);
  for (const forbidden of ["kyc", "income", "prompt", "privateProviderData", "secret"]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
});
