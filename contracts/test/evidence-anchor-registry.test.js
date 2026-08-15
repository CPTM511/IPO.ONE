import assert from "node:assert/strict";
import test from "node:test";
import { compileEvidenceAnchorRegistry } from "../../deploy/testnet/compile-evidence-anchor-registry.mjs";

test("Evidence Anchor Registry compiles reproducibly with one closed zero-value ABI", async () => {
  const first = await compileEvidenceAnchorRegistry();
  const second = await compileEvidenceAnchorRegistry();
  assert.equal(first.contractName, "IpoOneEvidenceAnchorRegistryV1");
  assert.equal(first.schemaVersion, "evidence_anchor_registry_artifact.v1");
  assert.equal(first.bytecode, second.bytecode);
  assert.equal(first.deployedBytecode, second.deployedBytecode);
  assert.match(first.compilerVersion, /^0\.8\.30\+/);
  assert.deepEqual(
    first.abi
      .filter(({ type }) => type === "function")
      .map(({ name, stateMutability }) => `${name}:${stateMutability}`)
      .sort(),
    [
      "BASE_SEPOLIA_CHAIN_ID:view",
      "MAX_BATCH_SIZE:view",
      "MAX_CONFIRMATION_LIFETIME_SECONDS:view",
      "anchorEvidence:nonpayable",
      "getAnchor:view",
      "nextNonce:view"
    ]
  );
  assert.equal(
    first.abi.some(({ type, stateMutability }) =>
      type === "function" && stateMutability === "payable"
    ),
    false
  );
});

test("contract covers every Evidence hash without privileged or value-moving paths", async () => {
  const artifact = await compileEvidenceAnchorRegistry();
  const source = artifact.source;
  assert.match(source, /block\.chainid != BASE_SEPOLIA_CHAIN_ID/);
  assert.match(source, /MAX_BATCH_SIZE = 16/);
  assert.match(source, /mapping\(bytes32 evidenceHash => EvidenceAnchor anchor\)/);
  assert.match(source, /EvidenceAlreadyAnchored/);
  assert.match(source, /nextNonce\[msg\.sender\] = nonce \+ 1/);
  assert.match(source, /expiresAt > block\.timestamp \+ MAX_CONFIRMATION_LIFETIME_SECONDS/);
  assert.match(source, /event EvidenceAnchored/);
  assert.match(source, /receive\(\) external payable/);
  assert.match(source, /fallback\(\) external payable/);
  for (const forbidden of [
    "delegatecall",
    "selfdestruct",
    "transferFrom",
    "approve(",
    "upgradeTo",
    "owner",
    "unpause",
    ".call{"
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
