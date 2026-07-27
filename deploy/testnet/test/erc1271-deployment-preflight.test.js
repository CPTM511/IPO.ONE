import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import {
  prepareMinimalErc1271DeploymentDecision,
  readMinimalErc1271DeploymentDecision
} from "../prepare-erc1271-deployment.mjs";
import {
  compileMinimalErc1271TestWallet,
  materializeMinimalErc1271TestWalletRuntime
} from "../compile-erc1271-test-wallet.mjs";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const decisionSchema = JSON.parse(await readFile(
  new URL(
    "../../../schemas/v2/wallet-003-erc1271-deployment-decision.schema.json",
    import.meta.url
  ),
  "utf8"
));
const validateDecision = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: false
}).compile(decisionSchema);

const NOW = new Date("2026-07-24T03:00:00.000Z");
const SOURCE_SHA256 =
  "sha256:d622a3c841ec5d022ae3aa1dec312459da3492b5897e4bc05532a4e214190787";
const CREATION_BYTECODE_KECCAK256 =
  "0xfc8b0043879c1f3868149fb616a1f11f939b4c96f423d18265f5be46a24217d2";
const DEPLOYED_BYTECODE_KECCAK256 =
  "0x24fbe2a0332e8b875babde91f1995ceab8e0fb500b66de8047658adca0459de1";

function decision(overrides = {}) {
  const base = {
    schemaVersion: "wallet_003_erc1271_deployment_decision.v1",
    decisionId: "WALLET-003-ERC1271-DEPLOY-001",
    decision: "APPROVE",
    approverRole: "IPO.ONE Founder",
    approvedAt: "2026-07-23T11:00:00.000Z",
    approvalExpiresAt: "2026-09-22T23:59:59.999Z",
    decisionPackSha256:
      "4d015b8f0d3a91ba1fc8397496449698d25fa80dbaba340cc9262c09c7d915ae",
    amendedAt: "2026-07-24T02:32:21.327Z",
    decisionAmendmentSha256:
      "179768eae10af3004b3c980677bc20554625226cd1c24800dc8274511edf7d9e",
    chainId: "eip155:84532",
    ownerAddress: "0x1111111111111111111111111111111111111111",
    deployerAddress: "0x2222222222222222222222222222222222222222",
    contractExpiresAt: "2026-07-30T11:59:59.000Z",
    caps: {
      deploymentCount: 1,
      transactionValueWei: "0",
      gasLimit: 500000,
      maxFeePerGasWei: "5000000000",
      maximumFaucetBalanceWei: "1000000000000000000"
    },
    e2e: {
      humanEip191: true,
      agentEip712: true
    },
    roles: {
      humanWalletOperator: "IPO.ONE Founder",
      deployerOperator: "IPO.ONE Founder",
      evidenceCustodian: "IPO.ONE Founder",
      credentialDestructionOwner: "IPO.ONE Founder"
    },
    artifact: {
      sourceSha256: SOURCE_SHA256,
      creationBytecodeKeccak256: CREATION_BYTECODE_KECCAK256,
      deployedBytecodeKeccak256: DEPLOYED_BYTECODE_KECCAK256
    },
    deploymentAuthorized: true,
    productionFundsMoved: false
  };
  return {
    ...base,
    ...overrides,
    caps: { ...base.caps, ...(overrides.caps ?? {}) },
    e2e: { ...base.e2e, ...(overrides.e2e ?? {}) },
    roles: { ...base.roles, ...(overrides.roles ?? {}) },
    artifact: { ...base.artifact, ...(overrides.artifact ?? {}) }
  };
}

test("approved decision validates and produces only a non-transactional redacted handoff", async () => {
  const input = decision();
  assert.equal(validateDecision(input), true, JSON.stringify(validateDecision.errors));

  const result = await prepareMinimalErc1271DeploymentDecision(input, {
    clock: () => NOW
  });

  assert.equal(result.status, "ready_for_human_signer_handoff");
  assert.equal(result.chainId, "eip155:84532");
  assert.match(result.ownerAddressHash, /^0x[0-9a-f]{64}$/);
  assert.match(result.deployerAddressHash, /^0x[0-9a-f]{64}$/);
  assert.equal(result.ownerAddressHash.includes(input.ownerAddress.slice(2)), false);
  assert.equal(result.deployerAddressHash.includes(input.deployerAddress.slice(2)), false);
  assert.equal(result.keyMaterialAccepted, false);
  assert.equal(result.transactionBuilt, false);
  assert.equal(result.transactionSigned, false);
  assert.equal(result.transactionBroadcast, false);
  assert.equal(result.productionFundsMoved, false);
  assert.match(
    result.expectedInstanceDeployedBytecodeKeccak256,
    /^0x[0-9a-f]{64}$/
  );
  assert.notEqual(
    result.expectedInstanceDeployedBytecodeKeccak256,
    result.deployedBytecodeKeccak256
  );
  assert.equal("ownerAddress" in result, false);
  assert.equal("deployerAddress" in result, false);
});

test("instance runtime materializes both approved immutable values without changing the template", async () => {
  const artifact = await compileMinimalErc1271TestWallet();
  const before = artifact.deployedBytecode;
  const runtime = materializeMinimalErc1271TestWalletRuntime({
    artifact,
    ownerAddress: "0x1111111111111111111111111111111111111111",
    expiresAt: "2026-07-30T11:59:59.000Z"
  });

  assert.equal(artifact.deployedBytecode, before);
  assert.equal(runtime.deployedBytecode.length, artifact.deployedBytecode.length);
  assert.notEqual(
    runtime.deployedBytecodeKeccak256,
    artifact.deployedBytecodeKeccak256
  );
  assert.deepEqual(Object.keys(artifact.immutableReferences).sort(), [
    "expiresAt",
    "owner"
  ]);
  for (const references of Object.values(artifact.immutableReferences)) {
    assert.ok(references.length >= 1);
    assert.ok(references.every(({ length }) => length === 32));
  }
});

test("preflight rejects drift, expanded authority, expiry, and unsafe caps", async () => {
  const cases = [
    decision({ chainId: "eip155:1" }),
    decision({ unknown: true }),
    decision({
      artifact: { sourceSha256: `sha256:${"00".repeat(32)}` }
    }),
    decision({ caps: { gasLimit: 500001 } }),
    decision({ caps: { maxFeePerGasWei: "0" } }),
    decision({ caps: { maxFeePerGasWei: "5000000001" } }),
    decision({ caps: { maximumFaucetBalanceWei: "1000000000000000001" } }),
    decision({ e2e: { humanEip191: false, agentEip712: false } }),
    decision({ approvalExpiresAt: "2026-07-23T12:00:00.000Z" }),
    decision({ contractExpiresAt: "2026-07-30T12:00:00.001Z" }),
    decision({ productionFundsMoved: true })
  ];

  for (const input of cases) {
    await assert.rejects(
      prepareMinimalErc1271DeploymentDecision(input, { clock: () => NOW })
    );
  }
});

test("decision reader accepts only strict mode-0600 regular JSON below /private/tmp", async (t) => {
  const directory = await mkdtemp("/private/tmp/ipo-one-erc1271-preflight-");
  t.after(() => rm(directory, { force: true, recursive: true }));
  const validPath = `${directory}/decision.json`;
  await writeFile(validPath, JSON.stringify(decision()), { mode: 0o600 });

  assert.deepEqual(
    await readMinimalErc1271DeploymentDecision(validPath),
    decision()
  );

  await chmod(validPath, 0o644);
  await assert.rejects(
    readMinimalErc1271DeploymentDecision(validPath),
    /invalid_erc1271_deployment_decision_file/
  );

  await chmod(validPath, 0o600);
  const symlinkPath = `${directory}/decision-link.json`;
  await symlink(validPath, symlinkPath);
  await assert.rejects(
    readMinimalErc1271DeploymentDecision(symlinkPath),
    /invalid_erc1271_deployment_decision_file/
  );
  await assert.rejects(
    readMinimalErc1271DeploymentDecision("./decision.json"),
    /invalid_erc1271_deployment_decision_file/
  );
});

test("decision reader rejects duplicate-key JSON without exposing parser internals", async (t) => {
  const directory = await mkdtemp("/private/tmp/ipo-one-erc1271-preflight-");
  t.after(() => rm(directory, { force: true, recursive: true }));
  const path = `${directory}/decision.json`;
  await writeFile(path, '{"decision":"APPROVE","decision":"REJECT"}', {
    mode: 0o600
  });

  await assert.rejects(
    readMinimalErc1271DeploymentDecision(path),
    (error) =>
      error.code === "invalid_erc1271_deployment_decision_file" &&
      !error.message.includes("JWT")
  );
});

test("preflight source has no signing, broadcast, RPC write, or secret-input primitive", async () => {
  const source = await readFile(
    new URL("../prepare-erc1271-deployment.mjs", import.meta.url),
    "utf8"
  );
  for (const forbidden of [
    "private" + "Key",
    "seed" + "Phrase",
    "sign" + "Transaction",
    "send" + "Transaction",
    "broadcast" + "Transaction",
    "create" + "WalletClient",
    "eth_send" + "RawTransaction"
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});
