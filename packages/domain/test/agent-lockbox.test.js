import assert from "node:assert/strict";
import test from "node:test";
import {
  AccountBindingStatus,
  CreditLineStatus,
  LockboxStatus,
  MandateCapability,
  MandateStatus,
  ObligationStatus,
  createAgentLockboxProjection,
  updateAgentLockboxAfterRepayment
} from "../src/index.js";

const now = new Date("2026-08-03T12:00:00.000Z");

function fixture() {
  const obligation = {
    obligationId: "obligation_agent_lockbox_test",
    subjectId: "subject_agent_lockbox_test",
    principalId: "principal_agent_lockbox_test",
    creditIntentId: "credit_intent_agent_lockbox_test",
    creditOfferId: "credit_offer_agent_lockbox_test",
    mandateId: "mandate_agent_lockbox_test",
    authorityRef: "mandate_agent_lockbox_test",
    assetId: "asset_usdc_sandbox",
    outstandingPrincipalMinor: "10000",
    status: ObligationStatus.ACTIVE,
    withdrawable: false,
    sandboxOnly: true,
    productionFundsMoved: false,
    schemaVersion: "obligation.v2"
  };
  return {
    obligation,
    creditIntent: {
      creditIntentId: obligation.creditIntentId,
      subjectId: obligation.subjectId,
      principalId: obligation.principalId,
      assetId: obligation.assetId,
      purposeCode: "compute",
      sandboxOnly: true,
      productionFundsRequested: false,
      schemaVersion: "credit_intent.v1"
    },
    mandate: {
      mandateId: obligation.mandateId,
      subjectId: obligation.subjectId,
      principalId: obligation.principalId,
      capabilities: [MandateCapability.EXECUTE_SANDBOX_CREDIT],
      allowedProviderIds: ["provider_gateway_compute"],
      assetIds: [obligation.assetId],
      status: MandateStatus.ACTIVE,
      sandboxOnly: true,
      productionAuthority: false,
      schemaVersion: "mandate.v3"
    },
    accountBinding: {
      accountBindingId: "account_binding_agent_lockbox_test",
      subjectId: obligation.subjectId,
      accountIdRef: "eip155:84532:0x1111111111111111111111111111111111111111",
      chainId: "eip155:84532",
      status: AccountBindingStatus.ACTIVE,
      schemaVersion: "account_binding.v2"
    },
    creditLine: {
      creditLineId: "credit_line_agent_lockbox_test",
      subjectId: obligation.subjectId,
      principalId: obligation.principalId,
      validatedMandateId: obligation.mandateId,
      assetId: obligation.assetId,
      creditIntentId: obligation.creditIntentId,
      creditOfferId: obligation.creditOfferId,
      obligationId: obligation.obligationId,
      purposeCode: "compute",
      sandboxOnly: true,
      productionAuthority: false,
      status: CreditLineStatus.APPROVED,
      schemaVersion: "credit_line.v2"
    },
    accounts: {
      principal_receivable: {
        ledgerAccountId: "ledger_account_principal_receivable_test"
      },
      repayment_clearing: {
        ledgerAccountId: "ledger_account_repayment_clearing_test"
      }
    }
  };
}

test("Agent Lockbox is exact-authority-bound, Provider-restricted, and non-withdrawable", () => {
  const input = fixture();
  const lockbox = createAgentLockboxProjection({ ...input, now });
  assert.equal(lockbox.schemaVersion, "lockbox.v2");
  assert.equal(lockbox.status, LockboxStatus.ACTIVE);
  assert.equal(lockbox.obligationId, input.obligation.obligationId);
  assert.equal(lockbox.mandateId, input.mandate.mandateId);
  assert.equal(lockbox.accountBindingId, input.accountBinding.accountBindingId);
  assert.equal(lockbox.purposeCode, "compute");
  assert.deepEqual(lockbox.allowedProviderIds, ["provider_gateway_compute"]);
  assert.equal(lockbox.balanceMinor, "10000");
  assert.equal(lockbox.sandboxOnly, true);
  assert.equal(lockbox.productionFundsMoved, false);
  assert.equal(lockbox.withdrawable, false);
  assert.equal(lockbox.custodyAuthority, false);
  assert.equal(lockbox.unrestrictedTransfersAllowed, false);
});

test("Agent Lockbox fails closed on stale Mandate authority", () => {
  const input = fixture();
  input.mandate.status = MandateStatus.REVOKED;
  assert.throws(
    () => createAgentLockboxProjection({ ...input, now }),
    (error) => error.code === "agent_lockbox_invalid"
  );
});

test("Agent Lockbox closes from canonical fully-repaid Obligation state", () => {
  const input = fixture();
  const lockbox = createAgentLockboxProjection({ ...input, now });
  const repaidObligation = {
    ...input.obligation,
    outstandingPrincipalMinor: "0",
    status: ObligationStatus.FULLY_REPAID
  };
  const updated = updateAgentLockboxAfterRepayment(lockbox, repaidObligation, {
    now: new Date("2026-08-03T12:05:00.000Z")
  });
  assert.equal(updated.status, LockboxStatus.CLOSED);
  assert.equal(updated.balanceMinor, "0");
  assert.equal(updated.lockboxHash, lockbox.lockboxHash);
});
