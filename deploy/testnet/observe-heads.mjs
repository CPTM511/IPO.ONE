import { mkdir, writeFile } from "node:fs/promises";
import { createLiveTestnetObserver, listLiveTestnetConfigs } from "../../modules/event-indexer/src/index.js";

const results = [];
for (const config of listLiveTestnetConfigs()) {
  const observer = createLiveTestnetObserver({ chainId: config.chainId, providerSlot: "primary" });
  results.push(await observer.readHead());
}
const receipt = {
  observedAt: new Date().toISOString(),
  observations: results,
  allReadOnly: results.every(({ readOnly }) => readOnly),
  productionFundsMoved: false,
  schemaVersion: "live_testnet_head_observation_set.v1"
};
const directory = new URL("../../artifacts/testnet/", import.meta.url);
await mkdir(directory, { recursive: true });
const fileName = `live-heads-${receipt.observedAt.replace(/[:.]/g, "-")}.json`;
const outputUrl = new URL(fileName, directory);
await writeFile(outputUrl, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ ...receipt, artifactPath: outputUrl.pathname }, null, 2)}\n`);
