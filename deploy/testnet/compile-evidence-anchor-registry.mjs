import { readFile } from "node:fs/promises";
import solc from "solc";

const sourceUrl = new URL(
  "../../contracts/IpoOneEvidenceAnchorRegistryV1.sol",
  import.meta.url
);

export async function compileEvidenceAnchorRegistry() {
  const source = await readFile(sourceUrl, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      "IpoOneEvidenceAnchorRegistryV1.sol": { content: source }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"]
        }
      }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(({ severity }) => severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `evidence_anchor_registry_compile_failed: ${errors
        .map(({ formattedMessage }) => formattedMessage)
        .join("\n")}`
    );
  }
  const compiled =
    output.contracts?.["IpoOneEvidenceAnchorRegistryV1.sol"]
      ?.IpoOneEvidenceAnchorRegistryV1;
  if (!compiled?.evm?.bytecode?.object || !compiled?.evm?.deployedBytecode?.object) {
    throw new Error(
      "evidence_anchor_registry_compile_failed: compiler returned no contract artifact"
    );
  }
  return Object.freeze({
    contractName: "IpoOneEvidenceAnchorRegistryV1",
    compilerVersion: solc.version(),
    abi: Object.freeze(structuredClone(compiled.abi)),
    bytecode: `0x${compiled.evm.bytecode.object}`,
    deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
    source,
    schemaVersion: "evidence_anchor_registry_artifact.v1"
  });
}
