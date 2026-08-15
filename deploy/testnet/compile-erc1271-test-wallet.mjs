import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import solc from "solc";
import {
  getAddress,
  keccak256,
  padHex,
  toHex
} from "viem";

const SOURCE_NAME = "IpoOneMinimalErc1271TestWalletV1.sol";
const CONTRACT_NAME = "IpoOneMinimalErc1271TestWalletV1";
const IMMUTABLE_NAMES = Object.freeze(["expiresAt", "owner"]);

function fail(message) {
  throw new Error(`erc1271_test_wallet_compile_failed: ${message}`);
}

function walkAst(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) walkAst(item, visit);
    } else {
      walkAst(value, visit);
    }
  }
}

function immutableReferencesByName(output, artifact) {
  const namesById = new Map();
  walkAst(output.sources?.[SOURCE_NAME]?.ast, (node) => {
    if (
      node.nodeType === "VariableDeclaration" &&
      node.mutability === "immutable" &&
      IMMUTABLE_NAMES.includes(node.name)
    ) {
      namesById.set(String(node.id), node.name);
    }
  });
  const references = artifact.evm.deployedBytecode.immutableReferences;
  const byName = Object.fromEntries(
    Object.entries(references ?? {}).map(([astId, ranges]) => [
      namesById.get(astId),
      ranges.map(({ start, length }) => Object.freeze({ start, length }))
    ])
  );
  if (
    Object.keys(byName).length !== IMMUTABLE_NAMES.length ||
    IMMUTABLE_NAMES.some((name) => (
      !Array.isArray(byName[name]) ||
      byName[name].length < 1 ||
      byName[name].some(({ start, length }) => (
        !Number.isSafeInteger(start) ||
        start < 0 ||
        length !== 32
      ))
    ))
  ) {
    fail("compiler returned unexpected immutable references");
  }
  return Object.freeze(Object.fromEntries(
    IMMUTABLE_NAMES.map((name) => [
      name,
      Object.freeze(byName[name])
    ])
  ));
}

export async function compileMinimalErc1271TestWallet({
  sourceUrl = new URL(`../../contracts/${SOURCE_NAME}`, import.meta.url)
} = {}) {
  const source = await readFile(sourceUrl, "utf8");
  const input = {
    language: "Solidity",
    sources: { [SOURCE_NAME]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      metadata: { bytecodeHash: "none", appendCBOR: false },
      outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.bytecode.object",
            "evm.deployedBytecode.object",
            "evm.deployedBytecode.immutableReferences"
          ],
          "": ["ast"]
        }
      }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(({ severity }) => severity === "error");
  if (errors.length > 0) {
    fail(errors.map(({ formattedMessage }) => formattedMessage).join("\n"));
  }
  const artifact = output.contracts?.[SOURCE_NAME]?.[CONTRACT_NAME];
  if (
    !artifact?.abi ||
    !artifact?.evm?.bytecode?.object ||
    !artifact?.evm?.deployedBytecode?.object
  ) {
    fail("compiler returned no complete contract artifact");
  }
  const bytecode = `0x${artifact.evm.bytecode.object}`;
  const deployedBytecode = `0x${artifact.evm.deployedBytecode.object}`;
  const immutableReferences = immutableReferencesByName(output, artifact);
  return Object.freeze({
    schemaVersion: "minimal_erc1271_test_wallet_artifact.v1",
    contractName: CONTRACT_NAME,
    compilerVersion: solc.version(),
    optimizer: Object.freeze({ enabled: true, runs: 200 }),
    metadataBytecodeHash: "none",
    sourceSha256: `sha256:${createHash("sha256").update(source).digest("hex")}`,
    creationBytecodeKeccak256: keccak256(bytecode),
    deployedBytecodeKeccak256: keccak256(deployedBytecode),
    abi: structuredClone(artifact.abi),
    bytecode,
    deployedBytecode,
    immutableReferences,
    deploymentAuthorized: false,
    productionFundsMoved: false
  });
}

export function materializeMinimalErc1271TestWalletRuntime({
  artifact,
  ownerAddress,
  expiresAt
}) {
  if (
    artifact?.schemaVersion !== "minimal_erc1271_test_wallet_artifact.v1" ||
    typeof artifact.deployedBytecode !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(artifact.deployedBytecode) ||
    !artifact.immutableReferences
  ) {
    fail("compiled artifact is invalid");
  }
  let owner;
  try {
    owner = getAddress(ownerAddress);
  } catch {
    fail("owner address is invalid");
  }
  const expiresAtMs = new Date(expiresAt).getTime();
  if (
    typeof expiresAt !== "string" ||
    !Number.isFinite(expiresAtMs) ||
    new Date(expiresAtMs).toISOString() !== expiresAt ||
    expiresAtMs % 1_000 !== 0
  ) {
    fail("contract expiry must be an exact whole-second UTC timestamp");
  }
  const expiresAtSeconds = BigInt(expiresAtMs / 1_000);
  if (expiresAtSeconds < 1n || expiresAtSeconds > 0xffffffffffffffffn) {
    fail("contract expiry exceeds uint64");
  }
  const values = Object.freeze({
    owner: padHex(owner, { size: 32 }),
    expiresAt: padHex(toHex(expiresAtSeconds), { size: 32 })
  });
  const bytes = Buffer.from(artifact.deployedBytecode.slice(2), "hex");
  for (const name of IMMUTABLE_NAMES) {
    const encoded = Buffer.from(values[name].slice(2), "hex");
    for (const { start, length } of artifact.immutableReferences[name] ?? []) {
      if (length !== encoded.length || start + length > bytes.length) {
        fail("immutable reference is outside deployed bytecode");
      }
      encoded.copy(bytes, start);
    }
  }
  const deployedBytecode = `0x${bytes.toString("hex")}`;
  return Object.freeze({
    schemaVersion: "minimal_erc1271_test_wallet_instance_runtime.v1",
    deployedBytecode,
    deployedBytecodeKeccak256: keccak256(deployedBytecode),
    ownerAddress: owner,
    expiresAt,
    productionFundsMoved: false
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const artifact = await compileMinimalErc1271TestWallet();
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
}
