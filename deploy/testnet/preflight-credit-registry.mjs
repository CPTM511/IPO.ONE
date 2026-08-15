import {
  preflightCreditRegistryRun,
  readCreditRegistryRuntimeInput
} from "./run-credit-registry-once.mjs";

const input = readCreditRegistryRuntimeInput();
const result = await preflightCreditRegistryRun(input);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
