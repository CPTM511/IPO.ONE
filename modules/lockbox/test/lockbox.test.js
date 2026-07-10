import assert from "node:assert/strict";
import test from "node:test";
import { EventStore } from "../../event-audit/src/index.js";
import { LockboxService } from "../src/index.js";

test("lockbox captures revenue only while active", () => {
  const store = new EventStore();
  const service = new LockboxService({ eventStore: store });
  const lockbox = service.createLockbox({
    subjectId: "subject_1",
    assetId: "eip155:8453/erc20:usdc",
    accountId: "eip155:8453:0x2222222222222222222222222222222222222222"
  });

  assert.throws(() => service.captureRevenue({ lockboxId: lockbox.lockboxId, amountMinor: "10" }), /lockbox_not_active/);
  service.activateLockbox(lockbox.lockboxId);
  const updated = service.captureRevenue({ lockboxId: lockbox.lockboxId, amountMinor: "10" });

  assert.equal(updated.balanceMinor, "10");
  assert.equal(store.listCreditEvents({ subjectId: "subject_1" }).some((event) => event.eventType === "revenue_captured"), true);
});
