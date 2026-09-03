import { generateKeyPairSync } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { hashId } from "../packages/domain/src/index.js";
import { assertHostedSyntheticMeteredProviderMaterial } from "../apps/private-pilot/src/local-synthetic-metered-provider.js";

const path = process.argv[2];
if (typeof path !== "string" || !isAbsolute(path) || path.length > 2_048) {
  throw new TypeError("usage: node scripts/generate-hosted-metered-provider-key.mjs <absolute-output-path>");
}
const pair = generateKeyPairSync("ed25519");
const publicKeyDer = pair.publicKey.export({ format: "der", type: "spki" })
  .toString("base64url");
const material = assertHostedSyntheticMeteredProviderMaterial({
  schemaVersion: "ipo_one_hosted_synthetic_metered_provider_key.v1",
  providerKeyId: `hosted_metered_${hashId("hosted_metered_provider_key", publicKeyDer).slice(2, 34)}`,
  privateKeyDer: pair.privateKey.export({ format: "der", type: "pkcs8" })
    .toString("base64url"),
  publicKeyDer
});
await writeFile(path, `${JSON.stringify(material)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${material.providerKeyId}\n`);

