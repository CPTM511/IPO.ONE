import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  RailFinalityModel,
  RailKind,
  SettlementFinality,
  SettlementOutcome,
  TransferDirection,
  createRailDescriptor,
  createSettlementReceipt,
  createTransferIntent,
  createTransferQuote,
  hashId
} from "../src/index.js";

const NOW = new Date("2026-07-11T00:00:00.000Z");

function crossAssetIntent() {
  return createTransferIntent({
    subjectId: "subject_1",
    mandateId: "mandate_1",
    policyDecisionRef: "policy_1",
    providerId: "provider_1",
    purposeCode: "sandbox_on_ramp",
    railId: "rail_sandbox_on_ramp",
    direction: TransferDirection.ON_RAMP,
    sourceMoney: { assetId: "iso4217:USD", scale: 2, amountMinor: "100" },
    destinationAsset: { assetId: "sandbox:USDC", scale: 6 },
    sourceAccountRefHash: hashId("account", "source"),
    destinationAccountRefHash: hashId("account", "destination"),
    idempotencyKey: "intent_1",
    now: NOW
  });
}

test("cross-asset rail quote uses exact rational minor-unit arithmetic", () => {
  const intent = crossAssetIntent();
  const quote = createTransferQuote({
    transferIntent: intent,
    feeMoney: { assetId: "iso4217:USD", scale: 2, amountMinor: "1" },
    destinationMoney: { assetId: "sandbox:USDC", scale: 6, amountMinor: "990000" },
    rate: { sourceUnits: "1", destinationUnits: "10000" },
    idempotencyKey: "quote_1",
    expiresAt: "2026-07-11T00:05:00.000Z",
    now: NOW
  });

  assert.equal(quote.destinationMoney.amountMinor, "990000");
  assert.throws(
    () =>
      createTransferQuote({
        transferIntent: intent,
        feeMoney: { assetId: "iso4217:USD", scale: 2, amountMinor: "1" },
        destinationMoney: { assetId: "sandbox:USDC", scale: 6, amountMinor: "989999" },
        rate: { sourceUnits: "1", destinationUnits: "10000" },
        idempotencyKey: "quote_bad",
        expiresAt: "2026-07-11T00:05:00.000Z",
        now: NOW
      }),
    /quote_amount_mismatch/
  );
});

test("settlement receipt rejects hidden amount changes and non-final reversals", () => {
  const intent = crossAssetIntent();
  const quote = createTransferQuote({
    transferIntent: intent,
    feeMoney: { assetId: "iso4217:USD", scale: 2, amountMinor: "1" },
    destinationMoney: { assetId: "sandbox:USDC", scale: 6, amountMinor: "990000" },
    rate: { sourceUnits: "1", destinationUnits: "10000" },
    idempotencyKey: "quote_1",
    expiresAt: "2026-07-11T00:05:00.000Z",
    now: NOW
  });
  const base = {
    transferIntent: { ...intent, quote },
    quote,
    railReferenceHash: hashId("rail_reference", "1"),
    providerEventIdHash: hashId("provider_event", "1"),
    sourceMoney: quote.sourceMoney,
    feeMoney: quote.feeMoney,
    destinationMoney: quote.destinationMoney,
    idempotencyKey: "receipt_1",
    now: NOW
  };

  assert.throws(
    () =>
      createSettlementReceipt({
        ...base,
        outcome: SettlementOutcome.SUCCEEDED,
        finality: SettlementFinality.FINALIZED,
        destinationMoney: { ...quote.destinationMoney, amountMinor: "989999" }
      }),
    /settlement_amount_mismatch/
  );
  assert.throws(
    () =>
      createSettlementReceipt({
        ...base,
        outcome: SettlementOutcome.REVERSED,
        finality: SettlementFinality.CONFIRMED
      }),
    /invalid_reversal_finality/
  );
});

test("runtime Rail objects stay aligned with their closed schema surfaces", async () => {
  const descriptor = createRailDescriptor({
    railId: "rail_sandbox_on_ramp",
    displayName: "Schema Test Rail",
    railKind: RailKind.HYBRID,
    directions: [TransferDirection.ON_RAMP],
    sourceAssets: [{ assetId: "iso4217:USD", scale: 2 }],
    destinationAssets: [{ assetId: "sandbox:USDC", scale: 6 }],
    finalityModel: RailFinalityModel.ASYNC,
    sandboxOnly: true,
    adapterVersion: "0.2.0"
  });
  const intent = crossAssetIntent();
  const quote = createTransferQuote({
    transferIntent: intent,
    feeMoney: { assetId: "iso4217:USD", scale: 2, amountMinor: "1" },
    destinationMoney: { assetId: "sandbox:USDC", scale: 6, amountMinor: "990000" },
    rate: { sourceUnits: "1", destinationUnits: "10000" },
    idempotencyKey: "quote_schema",
    expiresAt: "2026-07-11T00:05:00.000Z",
    now: NOW
  });
  const receipt = createSettlementReceipt({
    transferIntent: { ...intent, quote },
    quote,
    railReferenceHash: hashId("rail_reference", "schema"),
    providerEventIdHash: hashId("provider_event", "schema"),
    outcome: SettlementOutcome.SUCCEEDED,
    finality: SettlementFinality.FINALIZED,
    sourceMoney: quote.sourceMoney,
    feeMoney: quote.feeMoney,
    destinationMoney: quote.destinationMoney,
    idempotencyKey: "receipt_schema",
    now: NOW
  });
  const cases = [
    ["rail-descriptor.schema.json", descriptor],
    ["transfer-intent.schema.json", intent],
    ["transfer-quote.schema.json", quote],
    ["settlement-receipt.schema.json", receipt]
  ];

  for (const [file, value] of cases) {
    const schema = JSON.parse(await readFile(new URL(`../../../schemas/v2/${file}`, import.meta.url), "utf8"));
    const serialized = JSON.parse(JSON.stringify(value));
    const unknownKeys = Object.keys(serialized).filter((key) => !Object.hasOwn(schema.properties, key));
    const missingKeys = schema.required.filter((key) => !Object.hasOwn(serialized, key));
    assert.deepEqual(unknownKeys, [], `${file} does not declare all runtime fields`);
    assert.deepEqual(missingKeys, [], `${file} requires fields missing from runtime output`);
    assert.equal(serialized.schemaVersion, schema.properties.schemaVersion.const);
  }
});
