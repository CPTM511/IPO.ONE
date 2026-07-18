import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileSandboxEvidenceEmitter } from "../../deploy/testnet/compile-emitter.mjs";

test("minimal sandbox Evidence emitter compiles reproducibly with a closed non-financial ABI", async () => {
  const first = await compileSandboxEvidenceEmitter();
  const second = await compileSandboxEvidenceEmitter();
  assert.equal(first.compilerVersion.startsWith("0.8.30+"), true);
  assert.equal(first.bytecode, second.bytecode);
  assert.equal(first.deployedBytecode, second.deployedBytecode);
  assert.equal(first.abi.some(({ name }) => name === "emitEvidence"), true);
  for (const forbidden of ["upgradeTo", "transferOwnership", "withdraw", "borrow", "repay", "approve", "transfer"]) {
    assert.equal(first.abi.some(({ name }) => name === forbidden), false);
  }
});

test("contract source hard-caps lifetime and events and has no unpause or external call path", async () => {
  const source = await readFile(new URL("../IpoOneSandboxEvidenceEmitterV1.sol", import.meta.url), "utf8");
  assert.match(source, /MAX_EMISSIONS_LIMIT = 4/);
  assert.match(source, /MAX_LIFETIME_SECONDS = 1 days/);
  assert.match(source, /function retire\(\)/);
  assert.match(source, /receive\(\) external payable/);
  assert.doesNotMatch(source, /function unpause|selfdestruct|delegatecall|\.call\{|\.transfer\(|\.send\(/);
});
