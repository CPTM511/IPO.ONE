import { provisionEphemeralTestnetKey } from "./ephemeral-key.mjs";

const result = await provisionEphemeralTestnetKey({ keyPath: process.argv[2] });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
