import { destroyEphemeralTestnetKey } from "./ephemeral-key.mjs";

if (!process.argv[2]) throw new Error("ephemeral_testnet_key_error: key path is required");
const result = await destroyEphemeralTestnetKey(process.argv[2]);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
