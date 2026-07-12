import assert from "node:assert/strict";
import test from "node:test";
import {
  LedgerAccountType,
  LedgerEntryDirection,
  LedgerNormalSide
} from "../../../packages/domain/src/index.js";
import { EventStore } from "../../event-audit/src/index.js";
import { LedgerService } from "../src/index.js";

function createLedger() {
  const service = new LedgerService({ eventStore: new EventStore() });
  const asset = service.openAccount({
    ownerType: "lockbox",
    ownerId: "lockbox_1",
    assetId: "usdc",
    accountType: LedgerAccountType.LOCKBOX_ASSET,
    normalSide: LedgerNormalSide.DEBIT,
    subjectId: "subject_1"
  });
  const revenue = service.openAccount({
    ownerType: "system",
    ownerId: "external_revenue",
    assetId: "usdc",
    accountType: LedgerAccountType.EXTERNAL_REVENUE,
    normalSide: LedgerNormalSide.CREDIT
  });
  return { service, asset, revenue };
}

test("ledger posts balanced entries and derives account and trial balances", () => {
  const { service, asset, revenue } = createLedger();
  const result = service.postTransaction({
    idempotencyKey: "revenue_1",
    transactionType: "lockbox_revenue_capture",
    assetId: "usdc",
    referenceType: "lockbox",
    referenceId: "lockbox_1",
    subjectId: "subject_1",
    entries: [
      { ledgerAccountId: asset.ledgerAccountId, direction: LedgerEntryDirection.DEBIT, amountMinor: "100" },
      { ledgerAccountId: revenue.ledgerAccountId, direction: LedgerEntryDirection.CREDIT, amountMinor: "100" }
    ]
  });

  assert.equal(result.replayed, false);
  assert.equal(service.getAccountBalance(asset.ledgerAccountId), "100");
  assert.equal(service.getAccountBalance(revenue.ledgerAccountId), "100");
  assert.deepEqual(service.getTrialBalance("usdc"), {
    assetId: "usdc",
    debitTotalMinor: "100",
    creditTotalMinor: "100",
    balanced: true
  });
  assert.equal(service.verifyIntegrity().balanced, true);
});

test("ledger idempotency replays identical posting and rejects conflicting reuse", () => {
  const { service, asset, revenue } = createLedger();
  const posting = {
    idempotencyKey: "revenue_1",
    transactionType: "lockbox_revenue_capture",
    assetId: "usdc",
    referenceType: "lockbox",
    referenceId: "lockbox_1",
    entries: [
      { ledgerAccountId: asset.ledgerAccountId, direction: "debit", amountMinor: "100" },
      { ledgerAccountId: revenue.ledgerAccountId, direction: "credit", amountMinor: "100" }
    ]
  };

  const first = service.postTransaction(posting);
  const replay = service.postTransaction(posting);
  assert.equal(replay.replayed, true);
  assert.equal(replay.transaction.ledgerTransactionId, first.transaction.ledgerTransactionId);
  assert.equal(service.listTransactions().length, 1);
  assert.throws(
    () => service.postTransaction({ ...posting, entries: posting.entries.map((entry) => ({ ...entry, amountMinor: "101" })) }),
    /ledger_idempotency_conflict/
  );
});

test("ledger rejects unbalanced and cross-asset postings without mutation", () => {
  const { service, asset, revenue } = createLedger();
  const otherAsset = service.openAccount({
    ownerType: "system",
    ownerId: "other",
    assetId: "eurc",
    accountType: LedgerAccountType.EXTERNAL_REVENUE,
    normalSide: LedgerNormalSide.CREDIT
  });

  assert.throws(
    () =>
      service.postTransaction({
        idempotencyKey: "bad_1",
        transactionType: "bad",
        assetId: "usdc",
        referenceType: "test",
        referenceId: "bad_1",
        entries: [
          { ledgerAccountId: asset.ledgerAccountId, direction: "debit", amountMinor: "100" },
          { ledgerAccountId: revenue.ledgerAccountId, direction: "credit", amountMinor: "99" }
        ]
      }),
    /unbalanced_ledger_transaction/
  );
  assert.throws(
    () =>
      service.postTransaction({
        idempotencyKey: "bad_2",
        transactionType: "bad",
        assetId: "usdc",
        referenceType: "test",
        referenceId: "bad_2",
        entries: [
          { ledgerAccountId: asset.ledgerAccountId, direction: "debit", amountMinor: "100" },
          { ledgerAccountId: otherAsset.ledgerAccountId, direction: "credit", amountMinor: "100" }
        ]
      }),
    /ledger_asset_mismatch/
  );
  assert.equal(service.listTransactions().length, 0);
});
