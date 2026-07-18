import { parseStrictJson } from "../../../modules/authentication/src/strict-json.js";
import { createAgentHandoffCallPlan } from "./agent-handoff-plan.js";

const MAX_INPUT_BYTES = 32 * 1024;

async function readInput() {
  process.stdin.setEncoding("utf8");
  let source = "";
  for await (const chunk of process.stdin) {
    source += chunk;
    if (Buffer.byteLength(source) > MAX_INPUT_BYTES) {
      throw new Error("bounded_input_required");
    }
  }
  if (source.trim().length === 0) throw new Error("bounded_input_required");
  return source;
}

try {
  const source = await readInput();
  const manifest = parseStrictJson(source, {
    maximumBytes: MAX_INPUT_BYTES,
    maximumDepth: 8,
    maximumKeys: 96
  });
  const plan = createAgentHandoffCallPlan(manifest);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} catch {
  process.stderr.write(
    `${JSON.stringify({
      code: "invalid_agent_handoff_input",
      message: "A closed ready agent_handoff_manifest.v1 document is required."
    })}\n`
  );
  process.exitCode = 1;
}
