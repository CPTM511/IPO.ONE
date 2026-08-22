import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import test from "node:test";
import solc from "solc";
import { keccak256 } from "viem";

const root = new URL("../../../", import.meta.url);
const entryKey = "contracts/src/m2/IpoOneSecuredPoolV1.sol";
const contractName = "IpoOneSecuredPoolV1";
const fixtureUrl = new URL("../../abi/m2/IpoOneSecuredPoolV1.v1.json", import.meta.url);
const adapterEntryKey = "contracts/src/m2/IpoOnePriceOracleAdapterV1.sol";
const adapterContractName = "IpoOnePriceOracleAdapterV1";
const adapterFixtureUrl = new URL("../../abi/m2/IpoOnePriceOracleAdapterV1.v1.json", import.meta.url);

function pathForSourceKey(key) {
  if (key.startsWith("@openzeppelin/contracts/")) {
    return new URL(`node_modules/${key}`, root);
  }
  return new URL(key, root);
}

function resolveImport(fromKey, imported) {
  if (imported.startsWith("@")) return imported;
  return normalize(join(dirname(fromKey), imported)).replaceAll("\\", "/");
}

function collectSources(key, sources = {}) {
  if (sources[key]) return sources;
  const content = readFileSync(pathForSourceKey(key), "utf8");
  sources[key] = { content };
  const importPattern = /import\s+(?:[^"']+\s+from\s+)?["']([^"']+)["'];/g;
  for (const match of content.matchAll(importPattern)) {
    collectSources(resolveImport(key, match[1]), sources);
  }
  return sources;
}

function compileWithPinnedSolc(requestedEntryKey, requestedContractName) {
  const input = {
    language: "Solidity",
    sources: collectSources(requestedEntryKey),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      metadata: { bytecodeHash: "none", appendCBOR: false },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const failures = (output.errors ?? []).filter((entry) => entry.severity === "error");
  assert.deepEqual(failures, [], failures.map((entry) => entry.formattedMessage).join("\n"));
  return output.contracts[requestedEntryKey][requestedContractName];
}

function tupleType(parameter) {
  if (!parameter.type.startsWith("tuple")) return parameter.type;
  const suffix = parameter.type.slice("tuple".length);
  return `(${parameter.components.map(tupleType).join(",")})${suffix}`;
}

function signatures(abi, type) {
  return abi
    .filter((entry) => entry.type === type)
    .map((entry) => `${entry.name}(${(entry.inputs ?? []).map(tupleType).join(",")})`)
    .sort();
}

function canonicalAbi(abi) {
  return structuredClone(abi).sort((left, right) => {
    const leftKey = `${left.type}:${left.name ?? ""}:${(left.inputs ?? []).map(tupleType).join(",")}`;
    const rightKey = `${right.type}:${right.name ?? ""}:${(right.inputs ?? []).map(tupleType).join(",")}`;
    return leftKey.localeCompare(rightKey);
  });
}

function evidenceFor(contract, requestedContractName, requestedEntryKey) {
  const creationBytecode = `0x${contract.evm.bytecode.object}`;
  const runtimeBytecode = `0x${contract.evm.deployedBytecode.object}`;
  return {
    schemaVersion: "ipo_one_m2_contract_abi_evidence.v1",
    contract: requestedContractName,
    source: requestedEntryKey,
    compiler: solc.version(),
    settings: {
      optimizer: true,
      optimizerRuns: 200,
      evmVersion: "cancun",
      bytecodeHash: "none",
      cborMetadata: false
    },
    functionSignatures: signatures(contract.abi, "function"),
    eventSignatures: signatures(contract.abi, "event"),
    errorSignatures: signatures(contract.abi, "error"),
    creationBytecodeKeccak256: keccak256(creationBytecode),
    runtimeBytecodeKeccak256: keccak256(runtimeBytecode)
  };
}

test("pinned solc and Foundry produce the same closed pool ABI and bytecode", () => {
  assert.match(solc.version(), /^0\.8\.30\+commit\.73712a01/);
  const compiled = compileWithPinnedSolc(entryKey, contractName);
  const foundry = JSON.parse(
    readFileSync(new URL("out/foundry/IpoOneSecuredPoolV1.sol/IpoOneSecuredPoolV1.json", root), "utf8")
  );
  assert.deepEqual(canonicalAbi(compiled.abi), canonicalAbi(foundry.abi));
  assert.equal(`0x${compiled.evm.bytecode.object}`, foundry.bytecode.object);
  assert.equal(`0x${compiled.evm.deployedBytecode.object}`, foundry.deployedBytecode.object);

  const evidence = evidenceFor(compiled, contractName, entryKey);
  if (process.env.UPDATE_M2_POOL_ABI_FIXTURE === "1") {
    writeFileSync(fixtureUrl, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8"));
  assert.deepEqual(evidence, fixture);

  const mutatingFunctions = compiled.abi
    .filter((entry) => entry.type === "function" && entry.stateMutability === "nonpayable")
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(mutatingFunctions, [
    "accrueInterest",
    "addCollateral",
    "borrow",
    "liquidate",
    "pauseNewRisk",
    "recoverOracleDeviation",
    "redeemAll",
    "releaseCollateral",
    "repay",
    "resumeNewRisk",
    "supply",
    "syncOracle",
    "withdraw"
  ]);
  for (const forbidden of ["approve", "delegatecall", "grantRole", "transfer", "upgradeTo", "withdrawAdmin"]) {
    assert.ok(!evidence.functionSignatures.some((signature) => signature.startsWith(`${forbidden}(`)));
  }
});

test("pinned solc and Foundry produce the same immutable oracle-adapter ABI and bytecode", () => {
  const compiled = compileWithPinnedSolc(adapterEntryKey, adapterContractName);
  const foundry = JSON.parse(
    readFileSync(new URL("out/foundry/IpoOnePriceOracleAdapterV1.sol/IpoOnePriceOracleAdapterV1.json", root), "utf8")
  );
  assert.deepEqual(canonicalAbi(compiled.abi), canonicalAbi(foundry.abi));
  assert.equal(`0x${compiled.evm.bytecode.object}`, foundry.bytecode.object);
  assert.equal(`0x${compiled.evm.deployedBytecode.object}`, foundry.deployedBytecode.object);

  const evidence = evidenceFor(compiled, adapterContractName, adapterEntryKey);
  if (process.env.UPDATE_M2_POOL_ABI_FIXTURE === "1") {
    writeFileSync(adapterFixtureUrl, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  const fixture = JSON.parse(readFileSync(adapterFixtureUrl, "utf8"));
  assert.deepEqual(evidence, fixture);
  const mutatingFunctions = compiled.abi
    .filter((entry) => entry.type === "function" && entry.stateMutability === "nonpayable")
    .map((entry) => entry.name);
  assert.deepEqual(mutatingFunctions, []);
});
