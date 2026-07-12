import {
  DomainError,
  RailFinalityModel,
  RailKind,
  SettlementFinality,
  SettlementOutcome,
  TransferDirection,
  createRailDescriptor,
  createSettlementReceipt,
  createTransferIntent,
  createTransferQuote,
  hashId,
  assertPositiveMinorUnits
} from "../../../packages/domain/src/index.js";

function clone(value) {
  return structuredClone(value);
}

function assetKey(asset) {
  return `${asset.assetId}\0${asset.scale}`;
}

export class SandboxRailAdapter {
  constructor({
    railId = "rail_ipo_one_sandbox",
    displayName = "IPO.ONE Deterministic Sandbox Rail",
    railKind = RailKind.HYBRID,
    directions = [TransferDirection.NATIVE],
    sourceAssets,
    destinationAssets = sourceAssets,
    rates = [],
    feeBps = 0,
    quoteTtlMs = 300_000,
    finalityModel = RailFinalityModel.ASYNC,
    adapterVersion = "0.2.0"
  }) {
    if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps >= 10_000) {
      throw new DomainError("invalid_sandbox_fee", "feeBps must be an integer from 0 through 9999");
    }
    if (!Number.isSafeInteger(quoteTtlMs) || quoteTtlMs < 1) {
      throw new DomainError("invalid_quote_ttl", "quoteTtlMs must be a positive safe integer");
    }
    this.descriptor = createRailDescriptor({
      railId,
      displayName,
      railKind,
      directions,
      sourceAssets,
      destinationAssets,
      finalityModel,
      sandboxOnly: true,
      adapterVersion
    });
    this.feeBps = feeBps;
    this.quoteTtlMs = quoteTtlMs;
    this.rates = new Map();
    for (const rate of rates) {
      const key = `${assetKey(rate.sourceAsset)}\0${assetKey(rate.destinationAsset)}`;
      if (this.rates.has(key)) throw new DomainError("duplicate_rail_rate", "sandbox rail rate pairs must be unique");
      if (!this.descriptor.sourceAssets.some((asset) => assetKey(asset) === assetKey(rate.sourceAsset))) {
        throw new DomainError("rail_rate_source_not_supported", "configured rate source asset is not declared by the rail");
      }
      if (!this.descriptor.destinationAssets.some((asset) => assetKey(asset) === assetKey(rate.destinationAsset))) {
        throw new DomainError(
          "rail_rate_destination_not_supported",
          "configured rate destination asset is not declared by the rail"
        );
      }
      this.rates.set(key, {
        sourceUnits: assertPositiveMinorUnits(String(rate.sourceUnits), "rate.sourceUnits").toString(),
        destinationUnits: assertPositiveMinorUnits(String(rate.destinationUnits), "rate.destinationUnits").toString()
      });
    }
  }

  getDescriptor() {
    return clone(this.descriptor);
  }

  createQuote({ transferIntent, idempotencyKey, now = new Date() }) {
    this.#assertIntentSupported(transferIntent);
    const sourceAmount = BigInt(transferIntent.sourceMoney.amountMinor);
    const feeMinor = (sourceAmount * BigInt(this.feeBps)) / 10_000n;
    const rate = this.#rateFor(transferIntent.sourceMoney, transferIntent.destinationAsset);
    const convertedNumerator = (sourceAmount - feeMinor) * BigInt(rate.destinationUnits);
    if (convertedNumerator % BigInt(rate.sourceUnits) !== 0n) {
      throw new DomainError(
        "sandbox_rate_requires_rounding",
        "configured sandbox rate cannot represent this transfer exactly in destination minor units"
      );
    }
    return createTransferQuote({
      transferIntent,
      feeMoney: {
        assetId: transferIntent.sourceMoney.assetId,
        scale: transferIntent.sourceMoney.scale,
        amountMinor: feeMinor.toString()
      },
      destinationMoney: {
        ...transferIntent.destinationAsset,
        amountMinor: (convertedNumerator / BigInt(rate.sourceUnits)).toString()
      },
      rate,
      idempotencyKey,
      expiresAt: new Date(now.getTime() + this.quoteTtlMs).toISOString(),
      now
    });
  }

  submit({ transferIntent, idempotencyKey, now = new Date() }) {
    this.#assertIntentSupported(transferIntent);
    return {
      railReferenceHash: hashId("sandbox_rail_reference", {
        railId: this.descriptor.railId,
        transferIntentId: transferIntent.transferIntentId,
        idempotencyKey
      }),
      submittedAt: now.toISOString(),
      sandboxOnly: true,
      productionFundsMoved: false
    };
  }

  createReceipt({
    transferIntent,
    railReferenceHash,
    providerEventId,
    outcome = SettlementOutcome.SUCCEEDED,
    finality = SettlementFinality.FINALIZED,
    idempotencyKey,
    now = new Date()
  }) {
    this.#assertIntentSupported(transferIntent);
    const zeroSource = { ...transferIntent.quote.sourceMoney, amountMinor: "0" };
    const zeroFee = { ...transferIntent.quote.feeMoney, amountMinor: "0" };
    const zeroDestination = { ...transferIntent.quote.destinationMoney, amountMinor: "0" };
    const failed = outcome === SettlementOutcome.FAILED;
    return createSettlementReceipt({
      transferIntent,
      quote: transferIntent.quote,
      railReferenceHash,
      providerEventIdHash: hashId("sandbox_provider_event", {
        railId: this.descriptor.railId,
        providerEventId
      }),
      outcome,
      finality,
      sourceMoney: failed ? zeroSource : transferIntent.quote.sourceMoney,
      feeMoney: failed ? zeroFee : transferIntent.quote.feeMoney,
      destinationMoney: failed ? zeroDestination : transferIntent.quote.destinationMoney,
      idempotencyKey,
      now
    });
  }

  #rateFor(sourceAsset, destinationAsset) {
    const configured = this.rates.get(`${assetKey(sourceAsset)}\0${assetKey(destinationAsset)}`);
    if (configured) return configured;
    if (assetKey(sourceAsset) === assetKey(destinationAsset)) {
      return { sourceUnits: "1", destinationUnits: "1" };
    }
    throw new DomainError("rail_rate_not_supported", "sandbox rail has no exact rate for this asset pair");
  }

  #assertIntentSupported(intent) {
    if (intent.railId !== this.descriptor.railId) {
      throw new DomainError("rail_adapter_mismatch", "transfer intent is assigned to a different rail");
    }
    if (!this.descriptor.directions.includes(intent.direction)) {
      throw new DomainError("rail_direction_not_supported", "rail does not support the requested direction");
    }
    if (!this.descriptor.sourceAssets.some((asset) => assetKey(asset) === assetKey(intent.sourceMoney))) {
      throw new DomainError("rail_source_asset_not_supported", "rail does not support the source asset");
    }
    if (!this.descriptor.destinationAssets.some((asset) => assetKey(asset) === assetKey(intent.destinationAsset))) {
      throw new DomainError("rail_destination_asset_not_supported", "rail does not support the destination asset");
    }
  }
}

export function inspectSandboxRailAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new DomainError("invalid_rail_adapter", "rail adapter must be an object");
  }
  for (const method of ["getDescriptor", "createQuote", "submit", "createReceipt"]) {
    if (typeof adapter[method] !== "function") {
      throw new DomainError("invalid_rail_adapter", `rail adapter must implement ${method}()`);
    }
  }
  const descriptor = createRailDescriptor(adapter.getDescriptor());
  if (!descriptor.sandboxOnly) {
    throw new DomainError("production_rail_not_approved", "the local Rail Service accepts sandbox-only adapters");
  }
  return {
    railId: descriptor.railId,
    descriptorHash: descriptor.descriptorHash,
    sandboxOnly: true,
    executablePluginLoaded: false,
    checks: ["closed_descriptor", "sandbox_only", "required_methods", "no_dynamic_plugin_loading"],
    conformant: true
  };
}

export function runSandboxRailAdapterConformance(adapter) {
  const inspected = inspectSandboxRailAdapter(adapter);
  const descriptor = adapter.getDescriptor();
  const now = new Date("2026-01-01T00:00:00.000Z");
  const transferIntent = createTransferIntent({
    subjectId: "conformance_subject",
    mandateId: "conformance_mandate",
    policyDecisionRef: "conformance_policy_decision",
    providerId: "conformance_provider",
    purposeCode: "adapter_conformance",
    railId: descriptor.railId,
    direction: descriptor.directions[0],
    sourceMoney: { ...descriptor.sourceAssets[0], amountMinor: "10000" },
    destinationAsset: descriptor.destinationAssets[0],
    sourceAccountRefHash: hashId("conformance_account", "source"),
    destinationAccountRefHash: hashId("conformance_account", "destination"),
    idempotencyKey: "rail-conformance-intent",
    now
  });
  const quoteInput = { transferIntent, idempotencyKey: "rail-conformance-quote", now };
  const quote = adapter.createQuote(quoteInput);
  const quoteReplay = adapter.createQuote(quoteInput);
  if (quote.transferQuoteHash !== quoteReplay.transferQuoteHash) {
    throw new DomainError("rail_quote_not_deterministic", "sandbox adapter returned conflicting quote hashes for one command");
  }
  const quotedIntent = { ...transferIntent, quote };
  const submissionInput = {
    transferIntent: quotedIntent,
    idempotencyKey: "rail-conformance-submit",
    now
  };
  const submission = adapter.submit(submissionInput);
  const submissionReplay = adapter.submit(submissionInput);
  if (
    submission.railReferenceHash !== submissionReplay.railReferenceHash ||
    submission.sandboxOnly !== true ||
    submission.productionFundsMoved !== false
  ) {
    throw new DomainError("unsafe_sandbox_submission", "sandbox adapter submission failed deterministic safety checks");
  }
  const receipt = adapter.createReceipt({
    transferIntent: { ...quotedIntent, submission },
    railReferenceHash: submission.railReferenceHash,
    providerEventId: "rail-conformance-provider-event",
    outcome: SettlementOutcome.SUCCEEDED,
    finality: SettlementFinality.FINALIZED,
    idempotencyKey: "rail-conformance-receipt",
    now
  });
  if (receipt.sandboxOnly !== true || receipt.productionFundsMoved !== false) {
    throw new DomainError("unsafe_sandbox_receipt", "sandbox adapter receipt made an unsafe production claim");
  }
  return {
    ...inspected,
    deterministicQuote: true,
    deterministicSubmission: true,
    exactAmountContract: true,
    finalizedReceiptContract: true,
    productionFundsMoved: false,
    checks: [
      ...inspected.checks,
      "deterministic_quote",
      "exact_minor_unit_quote",
      "deterministic_submission",
      "finalized_receipt",
      "no_production_funds_claim"
    ]
  };
}
