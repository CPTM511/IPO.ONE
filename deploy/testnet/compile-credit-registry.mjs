import { readFile } from "node:fs/promises";
import solc from "solc";

const SOURCE_NAME = "IpoOneCreditAuthorizationRegistryV1.sol";
const CONTRACT_NAME = "IpoOneCreditAuthorizationRegistryV1";

export async function compileCreditAuthorizationRegistry({
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
        "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] }
      }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(({ severity }) => severity === "error");
  if (errors.length > 0) {
    throw new Error(`credit_registry_compile_failed: ${errors.map(({ formattedMessage }) => formattedMessage).join("\n")}`);
  }
  const artifact = output.contracts?.[SOURCE_NAME]?.[CONTRACT_NAME];
  if (!artifact?.abi || !artifact?.evm?.bytecode?.object) {
    throw new Error("credit_registry_compile_failed: compiler returned no contract artifact");
  }
  return Object.freeze({
    contractName: CONTRACT_NAME,
    compilerVersion: solc.version(),
    abi: structuredClone(artifact.abi),
    bytecode: `0x${artifact.evm.bytecode.object}`,
    deployedBytecode: `0x${artifact.evm.deployedBytecode.object}`,
    schemaVersion: "credit_authorization_registry_artifact.v1"
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(await compileCreditAuthorizationRegistry(), null, 2)}\n`);
}
