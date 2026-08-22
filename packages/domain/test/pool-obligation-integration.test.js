import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialPoolObligationProjection,
  createPoolObligationBinding,
  createPoolObligationEffectPlan,
  hashId
} from "../src/index.js";

const CHAIN = "eip155:84532";
const CONTRACT = "0x1111111111111111111111111111111111111111";
const MARKET = hashId("m2a006_market", "one");
const ACCOUNT = "0x2222222222222222222222222222222222222222";
const NOW = new Date("2026-08-23T01:00:00.000Z");
const descriptor = {
  chainId: CHAIN,
  contractAddress: CONTRACT,
  marketId: MARKET,
  abiVersion: "IpoOneSecuredPoolV1.v1"
};

function parties(subjectType = "human") {
  const subjectId = `subject_${subjectType}`;
  const principalId = `principal_${subjectType}`;
  const accountIdRef = `${CHAIN}:${ACCOUNT}`;
  return {
    subject: {
      subjectId,
      subjectType,
      primaryPrincipalId: principalId,
      status: "active"
    },
    principal: { principalId, status: "active" },
    accountBinding: {
      accountBindingId: `account_binding_${subjectType}`,
      subjectId,
      accountHash: hashId("account", accountIdRef),
      accountIdRef,
      chainId: CHAIN,
      purpose: "execution",
      bindingKind: "execution",
      status: "active",
      schemaVersion: "account_binding.v3"
    },
    obligation: {
      obligationId: `obligation_${subjectType}`,
      obligationHash: hashId("obligation", subjectType),
      subjectId,
      principalId,
      authorityType: subjectType === "human" ? "consent" : "mandate",
      assetId: "eip155:84532/erc20:0x4444444444444444444444444444444444444444",
      originalPrincipalMinor: "2000",
      outstandingPrincipalMinor: "2000",
      accruedInterestMinor: "0",
      outstandingInterestMinor: "0",
      accruedFeesMinor: "0",
      outstandingFeesMinor: "0",
      totalRepaidMinor: "0",
      installments: [{
        installmentId: `obligation_installment_${subjectType}`,
        obligationId: `obligation_${subjectType}`,
        installmentNumber: 1,
        scheduledPrincipalMinor: "2000",
        scheduledInterestMinor: "0",
        scheduledFeeMinor: "0",
        paidPrincipalMinor: "0",
        paidInterestMinor: "0",
        paidFeeMinor: "0",
        status: "scheduled"
      }],
      writtenOffPrincipalMinor: "0",
      writtenOffInterestMinor: "0",
      writtenOffFeesMinor: "0",
      executionStatus: "pending",
      status: "created",
      servicingClassification: "current",
      servicingReasonCode: "obligation_created",
      servicingEffectiveAt: "2026-08-23T00:00:00.000Z",
      sandboxOnly: true,
      productionFundsMoved: false,
      schemaVersion: "obligation.v2"
    }
  };
}

function finalizedEffect(binding, eventName, args, accountState) {
  const eventKey = hashId("m2a006_event", { eventName, args });
  const observationHash = hashId("m2a006_observation", eventKey);
  const state = {
    chainId: CHAIN,
    contractAddress: CONTRACT,
    marketId: MARKET,
    configuration: {
      debtAsset: "0x4444444444444444444444444444444444444444"
    },
    accounts: [{ account: ACCOUNT, ...accountState }]
  };
  const stateHash = hashId("m2a006_state", state);
  const projection = {
    finalizedEventCount: {
      CollateralAdded: 3,
      AssetsBorrowed: 4,
      AssetsRepaid: 5
    }[eventName] ?? 6,
    snapshotHash: hashId("m2a006_snapshot", state),
    stateHash,
    state,
    schemaVersion: "pool_v1_projection_snapshot.v1"
  };
  const observation = {
    eventKey,
    observationHash,
    chainId: CHAIN,
    contractAddress: CONTRACT,
    transactionHash: hashId("m2a006_tx", eventKey),
    blockNumber: "100",
    marketId: MARKET,
    eventName,
    eventType: `pool_${eventName.replace(/[A-Z]/g, (match, offset) => `${offset ? "_" : ""}${match.toLowerCase()}`)}`,
    args,
    observationStatus: "finalized",
    observedAt: "2026-08-23T01:01:00.000Z",
    syntheticOnly: true,
    productionFundsMoved: false,
    schemaVersion: "pool_chain_observation.v1"
  };
  return {
    observation,
    effect: {
      eventKey,
      observationHash,
      projectionHash: projection.snapshotHash,
      stateHash,
      eventType: observation.eventType,
      effectHash: hashId("m2a006_effect", eventKey),
      projection,
      schemaVersion: "pool_finalized_effect.v1"
    }
  };
}

test("Human and Agent self-Principal entry modes converge on one binding contract", () => {
  for (const subjectType of ["human", "agent"]) {
    const input = parties(subjectType);
    const binding = createPoolObligationBinding({ ...input, descriptor, now: NOW });
    assert.equal(binding.entryMode, subjectType);
    assert.equal(binding.selfPrincipal, true);
    assert.equal(binding.positionAccountHash, hashId("pool_position_account", { chainId: CHAIN, account: ACCOUNT }));
    assert.equal(binding.syntheticOnly, true);
    assert.equal(binding.productionFundsMoved, false);
    assert.equal(binding.schemaVersion, "pool_obligation_binding.v1");
  }
});

test("binding rejects wrong Subject, Principal, chain and revoked AccountBinding", () => {
  const input = parties();
  assert.throws(
    () => createPoolObligationBinding({
      ...input,
      subject: { ...input.subject, primaryPrincipalId: "principal_wrong" },
      descriptor,
      now: NOW
    }),
    { code: "pool_self_principal_mismatch" }
  );
  assert.throws(
    () => createPoolObligationBinding({
      ...input,
      accountBinding: { ...input.accountBinding, status: "revoked" },
      descriptor,
      now: NOW
    }),
    { code: "pool_account_binding_unavailable" }
  );
  assert.throws(
    () => createPoolObligationBinding({
      ...input,
      accountBinding: { ...input.accountBinding, chainId: "eip155:1952" },
      descriptor,
      now: NOW
    }),
    { code: "pool_account_binding_unavailable" }
  );
});

test("one finalized borrow creates deterministic canonical projection, Evidence event and balanced Ledger posting", () => {
  const input = parties();
  const binding = createPoolObligationBinding({ ...input, descriptor, now: NOW });
  const previousProjection = createInitialPoolObligationProjection(binding, { now: NOW });
  const source = finalizedEffect(binding, "AssetsBorrowed", {
    marketId: MARKET,
    account: ACCOUNT,
    assets: "2000",
    debtShares: "2000",
    debtAfter: "2000",
    cashAfter: "8000"
  }, {
    supplyShares: "0",
    collateralAssets: "5000",
    debtShares: "2000",
    debtAssets: "2000",
    badDebtAssets: "0"
  });
  const first = createPoolObligationEffectPlan({
    binding,
    obligation: input.obligation,
    previousProjection,
    ...source,
    now: NOW
  });
  const replay = createPoolObligationEffectPlan({
    binding,
    obligation: input.obligation,
    previousProjection,
    ...source,
    now: NOW
  });
  assert.equal(first.projection.projectionVersion, 1);
  assert.equal(first.projection.debtAssets, "2000");
  assert.equal(first.obligation.status, "active");
  assert.equal(first.obligation.executionStatus, "executed");
  assert.equal(first.executionReceipt.effectHash, source.effect.effectHash);
  assert.equal(first.ledgerTransactions.length, 1);
  assert.equal(first.ledgerTransactions[0].debitTotalMinor, "2000");
  assert.equal(first.ledgerTransactions[0].creditTotalMinor, "2000");
  assert.equal(first.ledgerTransactions[0].transactionHash, replay.ledgerTransactions[0].transactionHash);
  assert.equal(first.receipt.receiptHash, replay.receipt.receiptHash);
  assert.equal(first.event.finalityStatus, "finalized");
  assert.equal(first.receipt.creditStateAuthorizing, false);
  assert.equal(first.receipt.automaticLimitChange, false);
});

test("pending, invalidated, wrong-account and non-position effects never enter canonical Evidence", () => {
  const input = parties();
  const binding = createPoolObligationBinding({ ...input, descriptor, now: NOW });
  const previousProjection = createInitialPoolObligationProjection(binding, { now: NOW });
  const source = finalizedEffect(binding, "CollateralAdded", {
    marketId: MARKET,
    account: ACCOUNT,
    assets: "100",
    collateralAfter: "100"
  }, {
    supplyShares: "0",
    collateralAssets: "100",
    debtShares: "0",
    debtAssets: "0",
    badDebtAssets: "0"
  });
  for (const status of ["included", "safe", "invalidated"]) {
    assert.throws(
      () => createPoolObligationEffectPlan({
        binding,
        obligation: input.obligation,
        previousProjection,
        effect: source.effect,
        observation: { ...source.observation, observationStatus: status },
        now: NOW
      }),
      { code: "pool_effect_not_finalized" }
    );
  }
  assert.throws(
    () => createPoolObligationEffectPlan({
      binding,
      obligation: input.obligation,
      previousProjection,
      effect: source.effect,
      observation: {
        ...source.observation,
        args: { ...source.observation.args, account: "0x9999999999999999999999999999999999999999" }
      },
      now: NOW
    }),
    { code: "pool_position_account_mismatch" }
  );
});

test("finalized repayment closes the same Obligation, installment and non-authorizing Credit State candidate", () => {
  const input = parties();
  const binding = createPoolObligationBinding({ ...input, descriptor, now: NOW });
  const initialProjection = createInitialPoolObligationProjection(binding, { now: NOW });
  const borrow = finalizedEffect(binding, "AssetsBorrowed", {
    marketId: MARKET,
    account: ACCOUNT,
    assets: "2000",
    debtShares: "2000",
    debtAfter: "2000",
    cashAfter: "8000"
  }, {
    supplyShares: "0",
    collateralAssets: "5000",
    debtShares: "2000",
    debtAssets: "2000",
    badDebtAssets: "0"
  });
  const borrowed = createPoolObligationEffectPlan({
    binding,
    obligation: input.obligation,
    previousProjection: initialProjection,
    ...borrow,
    now: NOW
  });
  const repayment = finalizedEffect(binding, "AssetsRepaid", {
    marketId: MARKET,
    account: ACCOUNT,
    payer: ACCOUNT,
    assetsTransferred: "2000",
    debtReducedAssets: "2000",
    debtSharesBurned: "2000",
    reserveDustAssets: "0",
    debtAfter: "0",
    cashAfter: "10000"
  }, {
    supplyShares: "0",
    collateralAssets: "5000",
    debtShares: "0",
    debtAssets: "0",
    badDebtAssets: "0"
  });
  const repaid = createPoolObligationEffectPlan({
    binding,
    obligation: borrowed.obligation,
    previousProjection: borrowed.projection,
    ...repayment,
    now: NOW
  });
  assert.equal(repaid.obligation.status, "fully_repaid");
  assert.equal(repaid.obligation.outstandingPrincipalMinor, "0");
  assert.equal(repaid.obligation.totalRepaidMinor, "2000");
  assert.equal(repaid.obligation.installments[0].paidPrincipalMinor, "2000");
  assert.equal(repaid.obligation.installments[0].status, "paid");
  assert.equal(repaid.ledgerTransactions.length, 1);
  assert.equal(repaid.receipt.creditStateCandidate, true);
  assert.equal(repaid.receipt.creditStateAuthorizing, false);
  assert.equal(repaid.receipt.automaticLimitChange, false);
});

test("older finalized effects and a different debt asset cannot rewind or cross-wire an Obligation", () => {
  const input = parties();
  const binding = createPoolObligationBinding({ ...input, descriptor, now: NOW });
  const initialProjection = createInitialPoolObligationProjection(binding, { now: NOW });
  const borrow = finalizedEffect(binding, "AssetsBorrowed", {
    marketId: MARKET,
    account: ACCOUNT,
    assets: "2000",
    debtShares: "2000",
    debtAfter: "2000",
    cashAfter: "8000"
  }, {
    supplyShares: "0",
    collateralAssets: "5000",
    debtShares: "2000",
    debtAssets: "2000",
    badDebtAssets: "0"
  });
  const borrowed = createPoolObligationEffectPlan({
    binding,
    obligation: input.obligation,
    previousProjection: initialProjection,
    ...borrow,
    now: NOW
  });
  const older = finalizedEffect(binding, "CollateralAdded", {
    marketId: MARKET,
    account: ACCOUNT,
    assets: "5000",
    collateralAfter: "5000"
  }, {
    supplyShares: "0",
    collateralAssets: "5000",
    debtShares: "0",
    debtAssets: "0",
    badDebtAssets: "0"
  });
  assert.throws(
    () => createPoolObligationEffectPlan({
      binding,
      obligation: borrowed.obligation,
      previousProjection: borrowed.projection,
      ...older,
      now: NOW
    }),
    { code: "pool_effect_out_of_order" }
  );
  const wrongAsset = structuredClone(borrow);
  wrongAsset.effect.projection.state.configuration.debtAsset =
    "0x9999999999999999999999999999999999999999";
  assert.throws(
    () => createPoolObligationEffectPlan({
      binding,
      obligation: input.obligation,
      previousProjection: initialProjection,
      ...wrongAsset,
      now: NOW
    }),
    { code: "pool_debt_asset_mismatch" }
  );
});
