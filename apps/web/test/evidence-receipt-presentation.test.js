import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceReceiptPresentation } from "../src/evidence-receipt-presentation.js";

const HASH_A = `0x${"1".repeat(64)}`;
const HASH_B = `0x${"2".repeat(64)}`;
const TRANSACTION_HASH = `0x${"3".repeat(64)}`;

function evidence(evidenceHash) {
  return { evidenceHash };
}

function anchor(evidenceHash, overrides = {}) {
  return {
    evidenceHash,
    status: "finalized",
    transactionHash: TRANSACTION_HASH,
    transactionUrl: `https://sepolia.basescan.org/tx/${TRANSACTION_HASH}`,
    ...overrides
  };
}

test("receipt keeps server, digest, transaction, finality, indexer and reconciliation distinct", () => {
  const receipt = createEvidenceReceiptPresentation({
    evidenceItems: [evidence(HASH_A), evidence(HASH_B)],
    anchorItems: [anchor(HASH_A), anchor(HASH_B)],
    evidenceQueried: true,
    anchorAvailable: true
  });

  assert.equal(receipt.serverRecordLabel, "2 durable events");
  assert.equal(receipt.evidenceDigestLabel, "2 offchain digests");
  assert.equal(receipt.transactionHash, TRANSACTION_HASH);
  assert.equal(receipt.finalityLabel, "Finalized");
  assert.equal(receipt.indexerLabel, "Canonical events observed");
  assert.equal(receipt.reconciliationLabel, "Reconciled");
  assert.equal(receipt.reconciled, true);
});

test("receipt preserves pending and reorg correction without claiming reconciliation", () => {
  const pending = createEvidenceReceiptPresentation({
    evidenceItems: [evidence(HASH_A), evidence(HASH_B)],
    anchorItems: [
      anchor(HASH_A, { status: "finalized" }),
      anchor(HASH_B, {
        status: "reorged",
        transactionHash: undefined,
        transactionUrl: undefined
      })
    ],
    evidenceQueried: true,
    anchorAvailable: true
  });

  assert.equal(pending.finalityLabel, "Reorg detected");
  assert.equal(pending.indexerLabel, "Correction required");
  assert.equal(pending.reconciliationLabel, "Coverage complete · finality pending");
  assert.equal(pending.reconciled, false);
});

test("receipt rejects fake explorer links, unknown anchors and duplicate coverage", () => {
  assert.throws(
    () => createEvidenceReceiptPresentation({
      evidenceItems: [evidence(HASH_A)],
      anchorItems: [anchor(HASH_A, { transactionUrl: "https://example.test/fake" })],
      evidenceQueried: true,
      anchorAvailable: true
    }),
    /exact Base Sepolia receipt/
  );
  assert.throws(
    () => createEvidenceReceiptPresentation({
      evidenceItems: [evidence(HASH_A)],
      anchorItems: [anchor(HASH_B)],
      evidenceQueried: true,
      anchorAvailable: true
    }),
    /does not belong/
  );
  assert.throws(
    () => createEvidenceReceiptPresentation({
      evidenceItems: [evidence(HASH_A)],
      anchorItems: [anchor(HASH_A), anchor(HASH_A)],
      evidenceQueried: true,
      anchorAvailable: true
    }),
    /duplicated/
  );
});
