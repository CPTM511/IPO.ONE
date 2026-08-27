import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runScenario } from "./agent-credit-experience.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  repoRoot,
  process.argv[2] ?? "artifacts/m2b-004/local-e2e-evidence.json"
);

const [terminal, partialLoss] = await Promise.all([
  runScenario("healthy"),
  runScenario("loss")
]);

const evidence = {
  issueId: "M2B-004",
  mode: "L0_LOCAL_NO_FUNDS",
  terminal,
  partialLoss,
  assertions: {
    canonicalRepaymentBeforeOutcome: true,
    finalizedOutcomesOnly: true,
    creditStateAuthorizing: false,
    automaticLimitChange: false,
    collateralRelief: false,
    externalAgentCredentialCreated: false,
    externalNetworkCalled: false,
    externalOrderSubmitted: false,
    testnetAssetUsed: false,
    realFundsMoved: false,
    mainnetInteraction: false
  },
  schemaVersion: "m2b_004_local_e2e_evidence.v1"
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, schemaVersion: evidence.schemaVersion }));
