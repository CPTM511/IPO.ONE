import { DomainError } from "../../../packages/domain/src/index.js";
import {
  ChainIngestionDisposition,
  SandboxChainAdapter,
  SandboxChainIndexer
} from "../../chain-adapter/src/index.js";

export class LiveChainIndexer {
  constructor({ profile, store }) {
    if (!store || typeof store.append !== "function" || typeof store.listReplayInputs !== "function") {
      throw new DomainError("invalid_live_chain_store", "live chain indexer requires a durable store boundary");
    }
    this.adapter = new SandboxChainAdapter({ profile });
    this.indexer = new SandboxChainIndexer({ adapter: this.adapter });
    this.store = store;
  }

  async restore() {
    const observations = await this.store.listReplayInputs(this.adapter.getDescriptor().chainId);
    this.indexer = new SandboxChainIndexer({ adapter: this.adapter });
    for (const observation of observations) this.indexer.ingest(observation, { replay: true });
    return this.indexer.snapshot();
  }

  async ingest(liveObservation) {
    if (
      !liveObservation ||
      liveObservation.schemaVersion !== "live_testnet_evidence_observation.v1" ||
      liveObservation.rawProviderPayloadPersisted !== false
    ) throw new DomainError("invalid_live_testnet_observation", "only normalized live testnet observations are accepted");
    const result = this.indexer.ingest(liveObservation.observation);
    if (result.disposition === ChainIngestionDisposition.DUPLICATE) {
      return Object.freeze({ ...result, snapshot: this.indexer.snapshot(), persisted: { replayed: true } });
    }
    const record = {
      observation: liveObservation.observation,
      proof: result.proof,
      evidence: result.evidence,
      snapshot: this.indexer.snapshot()
    };
    const persisted = await this.store.append(record);
    return Object.freeze({ ...result, snapshot: record.snapshot, persisted });
  }
}
