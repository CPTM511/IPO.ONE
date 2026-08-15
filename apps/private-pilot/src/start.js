import { createPrivatePilotRuntime } from "./private-pilot-runtime.js";

const databaseUrl = process.env.DATABASE_URL;
const basePort = process.env.IPO_ONE_PILOT_PORT === undefined
  ? 8787
  : Number(process.env.IPO_ONE_PILOT_PORT);

let runtime;
try {
  runtime = await createPrivatePilotRuntime({
    ownerConnectionString: databaseUrl,
    basePort
  });
  process.stdout.write("IPO.ONE private no-funds product is ready.\n");
  process.stdout.write(`tenant     ${runtime.profile.tenantId}\n`);
  process.stdout.write("boundary   synthetic-only · local-only · real funds disabled\n");
  for (const workspace of runtime.workspaces) {
    process.stdout.write(`${workspace.name.padEnd(10)} ${workspace.url}\n`);
  }
  process.stdout.write(`agent EVM  ${runtime.agentAccount.address}\n`);
  process.stdout.write("Agent MCP: download the exact application/runtime handoff, then run pnpm run pilot:agent -- <manifest.json>\n");
} catch (error) {
  process.stderr.write(`Private pilot failed: ${error?.code ?? "startup_failed"}: ${error?.message ?? "Unknown error"}\n`);
  process.exitCode = 1;
}

if (runtime) {
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
