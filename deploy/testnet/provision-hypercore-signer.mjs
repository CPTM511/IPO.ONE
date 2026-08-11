import { provisionHypercoreIsolatedTestnetSigner } from "./hypercore-isolated-signer.mjs";

const descriptor = await provisionHypercoreIsolatedTestnetSigner({
  keyPath: process.argv[2]
});
process.stdout.write(`${JSON.stringify(descriptor, null, 2)}\n`);
