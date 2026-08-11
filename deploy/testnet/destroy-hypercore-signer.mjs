import { destroyHypercoreIsolatedTestnetSigner } from "./hypercore-isolated-signer.mjs";

if (!process.argv[2]) {
  throw new Error("hypercore_isolated_signer_error: key path is required");
}
const result = await destroyHypercoreIsolatedTestnetSigner(process.argv[2]);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
