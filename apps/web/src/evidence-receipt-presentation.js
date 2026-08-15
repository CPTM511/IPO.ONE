const EVM_HASH = /^0x[0-9a-f]{64}$/;
const ANCHOR_STATUSES = new Set([
  "pending",
  "failed",
  "prepared",
  "broadcast",
  "unknown",
  "included",
  "safe",
  "finalized",
  "reorged"
]);

function fail(message) {
  throw new TypeError(`Unsafe Evidence receipt: ${message}`);
}

function evidenceHash(item) {
  if (!EVM_HASH.test(item?.evidenceHash ?? "")) {
    fail("one offchain Evidence digest is invalid");
  }
  return item.evidenceHash;
}

function transactionUrl(item) {
  if (item?.transactionHash === undefined && item?.transactionUrl === undefined) {
    return undefined;
  }
  if (!EVM_HASH.test(item?.transactionHash ?? "")) {
    fail("one chain transaction hash is invalid");
  }
  const expected = `https://sepolia.basescan.org/tx/${item.transactionHash}`;
  if (item.transactionUrl !== expected) {
    fail("one chain transaction link is not the exact Base Sepolia receipt");
  }
  return expected;
}

function assertInputs({
  evidenceItems,
  anchorItems,
  evidenceQueried,
  anchorAvailable
}) {
  if (
    !Array.isArray(evidenceItems) ||
    !Array.isArray(anchorItems) ||
    typeof evidenceQueried !== "boolean" ||
    typeof anchorAvailable !== "boolean"
  ) {
    fail("input shape is invalid");
  }
  const evidenceHashes = evidenceItems.map(evidenceHash);
  if (new Set(evidenceHashes).size !== evidenceHashes.length) {
    fail("offchain Evidence digests are duplicated");
  }
  const knownEvidence = new Set(evidenceHashes);
  const anchorHashes = anchorItems.map((item) => {
    const hash = evidenceHash(item);
    if (!ANCHOR_STATUSES.has(item.status)) {
      fail("one chain anchor state is invalid");
    }
    if (!knownEvidence.has(hash)) {
      fail("one chain anchor does not belong to the loaded Evidence receipt");
    }
    transactionUrl(item);
    return hash;
  });
  if (new Set(anchorHashes).size !== anchorHashes.length) {
    fail("chain anchor coverage is duplicated");
  }
}

export function createEvidenceReceiptPresentation(input) {
  assertInputs(input);
  const {
    evidenceItems,
    anchorItems,
    evidenceQueried,
    anchorAvailable
  } = input;
  const finalized = anchorItems.filter(({ status }) => status === "finalized");
  const observing = anchorItems.filter(({ status }) =>
    new Set(["broadcast", "unknown", "included", "safe"]).has(status)
  );
  const reorged = anchorItems.some(({ status }) => status === "reorged");
  const completeCoverage =
    evidenceItems.length > 0 &&
    anchorItems.length === evidenceItems.length;
  const reconciled =
    completeCoverage &&
    finalized.length === evidenceItems.length;
  const latestTransaction = [...anchorItems]
    .reverse()
    .find((item) => item.transactionHash !== undefined);

  return Object.freeze({
    serverRecordLabel: evidenceQueried
      ? `${evidenceItems.length} durable event${evidenceItems.length === 1 ? "" : "s"}`
      : "Not loaded",
    evidenceDigestLabel: evidenceQueried
      ? `${evidenceItems.length} offchain digest${evidenceItems.length === 1 ? "" : "s"}`
      : "Not loaded",
    transactionLabel: !anchorAvailable
      ? "Unavailable"
      : latestTransaction
        ? `${latestTransaction.transactionHash.slice(0, 10)}…${latestTransaction.transactionHash.slice(-6)}`
        : anchorItems.length > 0
          ? "Not submitted"
          : "Waiting for Evidence",
    transactionHash: latestTransaction?.transactionHash,
    transactionUrl: latestTransaction ? transactionUrl(latestTransaction) : undefined,
    finalityLabel: !anchorAvailable
      ? "Not verifiable"
      : anchorItems.length === 0
        ? "Incomplete"
        : finalized.length === anchorItems.length
          ? "Finalized"
          : reorged
            ? "Reorg detected"
            : observing.length > 0
              ? "Confirming"
              : "Incomplete",
    indexerLabel: !anchorAvailable
      ? "Unavailable"
      : reorged
        ? "Correction required"
        : anchorItems.length === 0
          ? "Not observed"
          : finalized.length === anchorItems.length
            ? "Canonical events observed"
            : observing.length > 0
              ? "Observing chain"
              : "Awaiting transaction",
    reconciliationLabel: !anchorAvailable
      ? "Unavailable"
      : reconciled
        ? "Reconciled"
        : completeCoverage
          ? "Coverage complete · finality pending"
          : "Coverage pending",
    reconciled,
    finalizedCount: finalized.length,
    observingCount: observing.length,
    reorged
  });
}
