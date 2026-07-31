import { readFile } from "node:fs/promises";
import {
  runLocalAgentApplicationWorkflow,
  runLocalAgentRuntimeWorkflow
} from "./agent-reference-workflows.js";
import { createDurableLocalAgentSession } from "./local-agent-session.js";

const [action, manifestPath, offerReceiptPath] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;

function usage() {
  process.stderr.write(
    "Usage: node agent-workflow.js application <application-handoff.json>\n" +
    "   or: node agent-workflow.js runtime <runtime-handoff.json> <offer-receipt.json>\n"
  );
  process.exit(1);
}

if (
  !new Set(["application", "runtime"]).has(action) ||
  !manifestPath ||
  (action === "application" && offerReceiptPath !== undefined) ||
  (action === "runtime" && !offerReceiptPath)
) {
  usage();
}

let session;
try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  session = await createDurableLocalAgentSession({
    databaseUrl,
    manifest,
    networkSource: `local_reference_agent_${action}`
  });
  if (action === "application") {
    const receipt = await runLocalAgentApplicationWorkflow({
      manifest,
      session
    });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    const offerReceipt = JSON.parse(await readFile(offerReceiptPath, "utf8"));
    const result = await runLocalAgentRuntimeWorkflow({
      manifest,
      offerReceipt,
      session
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(
    `Agent ${action} workflow failed: ${error?.code ?? "workflow_failed"}\n`
  );
  process.exitCode = 1;
} finally {
  await session?.close();
}
