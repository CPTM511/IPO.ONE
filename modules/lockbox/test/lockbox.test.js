import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../../event-audit/src/index.js";
import { LedgerService } from "../../ledger/src/index.js";
import { LockboxService } from "../src/index.js";

test("lockbox captures revenue only while active", () => {
  const store = new EventStore();
  const ledgerService = new LedgerService({ eventStore: store });
  const service = new LockboxService({ eventStore: store, ledgerService });
  const lockbox = service.createLockbox({
    subjectId: "subject_1",
    assetId: "urn:ipo-one:sandbox-asset:usd-cent",
    accountId: "eip155:8453:0x2222222222222222222222222222222222222222"
  });

  assert.throws(() => service.captureRevenue({ lockboxId: lockbox.lockboxId, amountMinor: "10" }), /lockbox_not_active/);
  service.activateLockbox(lockbox.lockboxId);
  const updated = service.captureRevenue({
    lockboxId: lockbox.lockboxId,
    amountMinor: "10",
    idempotencyKey: "revenue_1"
  });
  const replayed = service.captureRevenue({
    lockboxId: lockbox.lockboxId,
    amountMinor: "10",
    idempotencyKey: "revenue_1"
  });

  assert.equal(updated.balanceMinor, "10");
  assert.equal(replayed.balanceMinor, "10");
  assert.equal(ledgerService.listTransactions().length, 1);
  assert.equal(store.listCreditEvents({ subjectId: "subject_1" }).some((event) => event.eventType === "revenue_captured"), true);
});
