import { loadPrivatePilotProfile, privatePilotProfileSummary } from "./private-pilot-profile.js";

const argumentsList = process.argv.slice(2);
const path = argumentsList[0] === "--" ? argumentsList[1] : argumentsList[0];

if (!path || argumentsList.length > (argumentsList[0] === "--" ? 2 : 1)) {
  process.stderr.write("Usage: pnpm run pilot:profile:check -- <tenant-profile.json>\n");
  process.exit(1);
}

try {
  const profile = await loadPrivatePilotProfile(path);
  process.stdout.write(`${JSON.stringify(privatePilotProfileSummary(profile), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Private pilot profile rejected: ${error?.code ?? "invalid_private_pilot_profile"}\n`);
  process.exitCode = 1;
}
