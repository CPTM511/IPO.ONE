import { readFile } from "node:fs/promises";
import solc from "solc";

const SOURCE_NAME = "IpoOneSandboxEvidenceEmitterV1.sol";
const CONTRACT_NAME = "IpoOneSandboxEvidenceEmitterV1";

function fail(message) {
  throw new Error(`sandbox_emitter_compile_failed: ${message}`);
}

export async function compileSandboxEvidenceEmitter({
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
  if (errors.length > 0) fail(errors.map(({ formattedMessage }) => formattedMessage).join("\n"));
  const artifact = output.contracts?.[SOURCE_NAME]?.[CONTRACT_NAME];
  if (!artifact?.abi || !artifact?.evm?.bytecode?.object) fail("compiler returned no contract artifact");
  return Object.freeze({
    contractName: CONTRACT_NAME,
    compilerVersion: solc.version(),
    abi: structuredClone(artifact.abi),
    bytecode: `0x${artifact.evm.bytecode.object}`,
    deployedBytecode: `0x${artifact.evm.deployedBytecode.object}`,
    schemaVersion: "sandbox_evidence_emitter_artifact.v1"
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const artifact = await compileSandboxEvidenceEmitter();
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
}
