import { authorizeHypercore002dAgentRegistration } from "./start-hypercore-002d-handoff.mjs";

if (!process.argv[2]) {
  throw new Error("hypercore_002d_agent_approval_required: request hash is required");
}
const result = await authorizeHypercore002dAgentRegistration(process.argv[2]);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
