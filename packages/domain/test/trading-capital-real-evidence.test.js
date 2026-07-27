import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import {
  PrincipalStatus,
  SubjectStatus,
  SubjectType,
  compareRealTradingShadowRiskWithFixture,
  createRealTradingAccountBindingChallenge,
  finalizeRealTradingEvidenceSnapshot,
  importRealTradingHistory,
  realTradingCreditProfileView
} from "../src/index.js";

const requireFromApiContract = createRequire(
  new URL("../../api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const schema = JSON.parse(
  await readFile(
    new URL(
      "../../../schemas/v2/trading-real-credit-profile.schema.json",
      import.meta.url
    ),
    "utf8"
  )
);
const validate = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false
})
  .addFormat("date-time", {
    type: "string",
    validate(value) {
      return (
        typeof value === "string" &&
        /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
        Number.isFinite(new Date(value).getTime())
      );
    }
  })
  .compile(schema);

const HASH = (character) => `0x${character.repeat(64)}`;
const MASTER_HASH = HASH("1");
const SUBACCOUNT_HASH = HASH("2");

function containsExactValue(value, target) {
  if (value === target) return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((nested) =>
    containsExactValue(nested, target)
  );
}

function challengeDescriptor({
  challengeId = "challenge_real_001",
  challengeHash = HASH("3"),
  nonceHash = HASH("4"),
  typedDataHash = HASH("5"),
  issuedAt = "2026-07-25T00:00:00.000Z",
  expiresAt = "2026-07-25T00:05:00.000Z"
} = {}) {
  return {
    challengeId,
    challengeHash,
    nonceHash,
    typedDataHash,
    masterAddressHash: MASTER_HASH,
    subaccountAddressHash: SUBACCOUNT_HASH,
    chainId: "eip155:998",
    environment: "hyperliquid_testnet",
    infoProfileId: "hyperliquid_testnet_info.v1",
    issuedAt,
    expiresAt
  };
}

function createChallenge({ existingProfile, now = "2026-07-25T00:00:00.000Z" } = {}) {
  return createRealTradingAccountBindingChallenge({
    tenantId: "tenant_real_evidence",
    subject: {
      subjectId: "subject_real_evidence",
      subjectType: SubjectType.AGENT,
      primaryPrincipalId: "principal_real_evidence",
      status: SubjectStatus.ACTIVE
    },
    principal: {
      principalId: "principal_real_evidence",
      status: PrincipalStatus.ACTIVE
    },
    requestedByActorId: "actor_real_evidence",
    bindingDescriptor: challengeDescriptor({
      ...(existingProfile
        ? {
            challengeId: "challenge_real_002",
            challengeHash: HASH("a"),
            nonceHash: HASH("b"),
            typedDataHash: HASH("c"),
            issuedAt: "2026-07-25T00:04:00.000Z",
            expiresAt: "2026-07-25T00:09:00.000Z"
          }
        : {})
    }),
    ...(existingProfile ? { existingProfile } : {}),
    now: new Date(now)
  });
}

function importedProfile(
  challenge,
  { historyOverrides = {}, snapshotOverrides = {} } = {}
) {
  return importRealTradingHistory({
    profile: challenge,
    requestedByActorId: "actor_real_evidence",
    bindingProof: {
      masterAddressHash: MASTER_HASH,
      typedDataHash: challenge.bindingChallenge.typedDataHash,
      proofHash: HASH("6"),
      verificationMethod: "eip712_eoa_master_v1",
      rawSignaturePersisted: false,
      reusableSignature: false,
      chainId: "eip155:998",
      environment: "hyperliquid_testnet",
      schemaVersion: "hyperliquid_binding_proof_result.v1"
    },
    relationship: {
      profileId: "hyperliquid_testnet_info.v1",
      environment: "testnet",
      masterAddressHash: MASTER_HASH,
      subaccountAddressHash: SUBACCOUNT_HASH,
      sourceResponseHashes: {
        masterUserRole: HASH("7"),
        subaccountUserRole: HASH("8"),
        subAccounts: HASH("9")
      },
      observedAt: "2026-07-25T00:01:00.000Z",
      relationshipHash: HASH("a"),
      masterRole: "user",
      subaccountRole: "subAccount",
      relationshipVerified: true,
      actualAccountAddressesQueried: true,
      apiWalletAddressAccepted: false,
      readOnly: true,
      testnetOnly: true,
      externalOrderSubmitted: false,
      signerAvailable: false,
      credentialsUsed: false,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion: "hyperliquid_account_relationship.v1"
    },
    history: {
      profileId: "hyperliquid_testnet_info.v1",
      environment: "testnet",
      accountAddressHash: SUBACCOUNT_HASH,
      windowStartsAt: "2026-07-24T00:01:00.000Z",
      windowEndsAt: "2026-07-25T00:01:00.000Z",
      sourceRoleHash: HASH("b"),
      pageHashes: [HASH("c")],
      eventHashes: [HASH("d")],
      paginationComplete: true,
      paginationStalled: false,
      pageLimitReached: false,
      sourceRetentionLimitReached: false,
      historyManifestHash: HASH("e"),
      events: [
        {
          coin: "ETH",
          side: "buy",
          price: "2500.25",
          size: "2",
          startPosition: "0",
          closedPnl: "25.5",
          fee: "1.25",
          feeToken: "USDC",
          orderId: "100",
          tradeId: "200",
          transactionHash: `0x${"f".repeat(64)}`,
          direction: "Open Long",
          crossed: true,
          timestamp: "2026-07-24T12:00:00.000Z",
          eventHash: HASH("d")
        }
      ],
      counts: {
        pageCount: 1,
        totalReturnedCount: 1,
        uniqueEventCount: 1,
        duplicateCount: 0
      },
      sourceLimits: {
        maximumPages: 5,
        maximumFillsPerPage: 2000,
        venueMostRecentFillLimit: 10000,
        maximumWindowMs: 2592000000
      },
      dataGapCodes: ["venue_exposes_only_10000_most_recent_fills"],
      observedAt: "2026-07-25T00:01:01.000Z",
      readOnly: true,
      testnetOnly: true,
      externalOrderSubmitted: false,
      signerAvailable: false,
      credentialsUsed: false,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion: "hyperliquid_fill_history.v1",
      ...historyOverrides
    },
    currentSnapshot: {
      profileId: "hyperliquid_testnet_info.v1",
      environment: "testnet",
      accountRole: "subaccount",
      accountAddressHash: SUBACCOUNT_HASH,
      verifiedMasterAddressHash: MASTER_HASH,
      accountRoleVerified: true,
      equity: {
        accountValue: "1000.5",
        withdrawable: "750.25"
      },
      counts: {
        positions: 1,
        openOrders: 2
      },
      sourceBundleHash: HASH("1"),
      snapshotHash: HASH("2"),
      observedAt: "2026-07-25T00:01:30.000Z",
      venueTime: "2026-07-25T00:01:29.000Z",
      freshness: "fresh",
      readOnly: true,
      testnetOnly: true,
      externalOrderSubmitted: false,
      signerAvailable: false,
      credentialsUsed: false,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion: "hyperliquid_info_account_snapshot.v1",
      ...snapshotOverrides
    },
    challengeEventId: "event_challenge_real",
    challengeEvidenceHash: HASH("3"),
    now: new Date("2026-07-25T00:02:00.000Z")
  });
}

test("TC-202 real Testnet Evidence is hash-only, partial, and non-authorizing", () => {
  const challenge = createChallenge();
  const imported = importedProfile(challenge);
  const finalized = finalizeRealTradingEvidenceSnapshot({
    profile: imported,
    sourceProjectionHash: HASH("4"),
    historyImportEventId: "event_import_real",
    historyImportEvidenceHash: HASH("5"),
    sourceFinality: "finalized",
    now: new Date("2026-07-25T00:03:00.000Z")
  });

  for (const profile of [challenge, imported, finalized]) {
    assert.equal(validate(profile), true, JSON.stringify(validate.errors));
    assert.equal(
      containsExactValue(
        profile,
        "0x1111111111111111111111111111111111111111"
      ),
      false
    );
  }
  assert.equal(imported.historyImport.dataQuality.completeness, "partial");
  assert.equal(imported.historyImport.rawEventsPersisted, false);
  assert.equal(imported.historyImport.rawSignaturePersisted, false);
  assert.equal(finalized.evidenceSnapshot.authorizing, false);
  assert.equal(finalized.factorScorecard.creditDecision.performed, false);
  assert.equal(finalized.factorScorecard.recommendedLimit.available, false);
});

test("TC-202 rebinding invalidates prior Evidence authority before a new read", () => {
  const imported = importedProfile(createChallenge());
  const finalized = finalizeRealTradingEvidenceSnapshot({
    profile: imported,
    sourceProjectionHash: HASH("4"),
    historyImportEventId: "event_import_real",
    historyImportEvidenceHash: HASH("5"),
    sourceFinality: "finalized",
    now: new Date("2026-07-25T00:03:00.000Z")
  });
  const rebound = createChallenge({
    existingProfile: finalized,
    now: "2026-07-25T00:04:00.000Z"
  });

  assert.equal(rebound.bindingEpoch, 2);
  assert.equal(rebound.evidenceAuthority.active, false);
  assert.equal(rebound.priorEvidenceInvalidation.active, false);
  assert.equal(
    rebound.priorEvidenceInvalidation.evidenceSnapshotHash,
    finalized.evidenceSnapshot.snapshotHash
  );
  assert.equal(validate(rebound), true, JSON.stringify(validate.errors));
});

test("TC-202 rejects reused and expired binding challenges", () => {
  const imported = importedProfile(createChallenge());
  assert.throws(
    () => importedProfile(imported),
    /profile stage is invalid/
  );
  const expired = createChallenge();
  assert.throws(
    () =>
      importRealTradingHistory({
        profile: expired,
        requestedByActorId: "actor_real_evidence",
        bindingProof: {},
        relationship: {},
        history: {},
        currentSnapshot: {},
        challengeEventId: "event_challenge_real",
        challengeEvidenceHash: HASH("3"),
        now: new Date("2026-07-25T00:06:00.000Z")
      }),
    /binding challenge is not current/
  );
});

function finalizeImported(
  imported,
  now = "2026-07-25T00:03:00.000Z"
) {
  return finalizeRealTradingEvidenceSnapshot({
    profile: imported,
    sourceProjectionHash: HASH("4"),
    historyImportEventId: "event_import_real",
    historyImportEvidenceHash: HASH("5"),
    sourceFinality: "finalized",
    now: new Date(now)
  });
}

function featureMap(finalized) {
  return new Map(
    finalized.factorScorecard.shadowRisk.features.map((item) => [
      item.featureId,
      item
    ])
  );
}

test("TC-203 golden feature vector is descriptive, versioned, and non-authorizing", () => {
  const finalized = finalizeImported(importedProfile(createChallenge()));
  const shadow = finalized.factorScorecard.shadowRisk;
  const features = featureMap(finalized);

  assert.equal(validate(finalized), true, JSON.stringify(validate.errors));
  assert.equal(
    finalized.factorScorecard.schemaVersion,
    "trading_real_factor_scorecard.v2"
  );
  assert.equal(
    shadow.schemaVersion,
    "trading_real_shadow_risk_profile.v1"
  );
  assert.equal(features.size, 16);
  assert.deepEqual(features.get("net_realized_pnl"), {
    featureId: "net_realized_pnl",
    state: "observed",
    value: "24.25",
    unit: "venue_quote_asset",
    reasonCodes: ["verified_bounded_fill_history"],
    authorizing: false,
    definitionVersion: "trading_shadow_feature.net_realized_pnl.v1"
  });
  assert.equal(
    features.get("net_return_on_traded_notional").value,
    "0.00484951504849515"
  );
  assert.equal(
    features.get("fee_to_traded_notional").value,
    "0.00024997500249975"
  );
  assert.equal(features.get("positive_realized_fill_rate").value, "1");
  assert.equal(
    features.get("current_withdrawable_ratio").value,
    "0.749875062468765617"
  );
  assert.equal(shadow.authorizing, false);
  assert.equal(shadow.economicStateMutation, false);
  assert.equal(shadow.newRiskAuthority, false);
  assert.equal(shadow.fundsAuthority, false);
  assert.equal(finalized.factorScorecard.creditDecision.performed, false);
  assert.equal(finalized.factorScorecard.recommendedLimit.available, false);
  assert.equal(finalized.factorScorecard.pricing.available, false);
});

test("TC-203 stress, out-of-time, drift, and missing history are explicit", () => {
  const imported = importedProfile(createChallenge(), {
    historyOverrides: {
      events: [],
      eventHashes: [],
      counts: {
        pageCount: 1,
        totalReturnedCount: 0,
        uniqueEventCount: 0,
        duplicateCount: 0
      }
    },
    snapshotOverrides: {
      equity: {
        accountValue: "0",
        withdrawable: "0"
      },
      freshness: "stale"
    }
  });
  const finalized = finalizeImported(imported);
  const shadow = finalized.factorScorecard.shadowRisk;
  const features = featureMap(finalized);

  assert.equal(validate(finalized), true, JSON.stringify(validate.errors));
  assert.equal(
    features.get("net_return_on_traded_notional").state,
    "insufficient"
  );
  assert.equal(
    features.get("current_withdrawable_ratio").state,
    "insufficient"
  );
  assert.equal(features.get("current_position_count").state, "stale");
  assert.equal(features.get("risk_adjusted_return").state, "insufficient");
  assert.equal(features.get("maximum_drawdown").state, "insufficient");
  assert.equal(features.get("tail_loss").state, "insufficient");
  assert.equal(features.get("current_leverage").state, "insufficient");
  assert.equal(features.get("liquidation_discipline").state, "unknown");
  assert.equal(features.get("strategy_capacity").state, "insufficient");
  assert.equal(features.get("regime_stability").state, "insufficient");
  assert.deepEqual(
    shadow.stressWindows.map(({ windowId, state }) => [windowId, state]),
    [
      ["observed_history", "observed"],
      ["out_of_time", "insufficient"],
      ["tail_stress", "insufficient"]
    ]
  );
  assert.equal(shadow.driftMonitor.state, "insufficient");
  assert.equal(shadow.driftMonitor.approvedBaselineAvailable, false);
  assert.equal(shadow.pointInTime.temporalState, "stale");
  assert.equal(shadow.pointInTime.maxAgePolicyApproved, false);
});

test("TC-203 anti-leakage rejects generation before imported Evidence", () => {
  const imported = importedProfile(createChallenge());
  assert.throws(
    () => finalizeImported(imported, "2026-07-25T00:01:59.999Z"),
    /cannot precede its Evidence/
  );
});

test("TC-203 out-of-time regeneration stays pinned to the same Evidence vector", () => {
  const imported = importedProfile(createChallenge());
  const first = finalizeImported(imported, "2026-07-25T00:03:00.000Z");
  const later = finalizeImported(imported, "2026-08-25T00:03:00.000Z");

  assert.equal(
    first.factorScorecard.shadowRisk.shadowRiskProfileHash,
    later.factorScorecard.shadowRisk.shadowRiskProfileHash
  );
  assert.deepEqual(
    first.factorScorecard.shadowRisk.features,
    later.factorScorecard.shadowRisk.features
  );
  assert.notEqual(
    first.factorScorecard.shadowRisk.pointInTime.generatedAt,
    later.factorScorecard.shadowRisk.pointInTime.generatedAt
  );
  assert.equal(
    later.factorScorecard.shadowRisk.pointInTime.temporalState,
    "unknown"
  );
  assert.equal(later.factorScorecard.shadowRisk.authorizing, false);
});

test("TC-203 synthetic fixture comparison is descriptive and threshold-free", () => {
  const finalized = finalizeImported(importedProfile(createChallenge()));
  const observed = finalized.factorScorecard.shadowRisk;
  const fixture = structuredClone(observed);
  fixture.shadowRiskProfileId = "trading_shadow_risk_profile_fixture";
  fixture.shadowRiskProfileHash = HASH("f");
  fixture.features.find(
    ({ featureId }) => featureId === "net_realized_pnl"
  ).value = "20";

  const comparison = compareRealTradingShadowRiskWithFixture({
    observedProfile: observed,
    syntheticFixtureProfile: fixture
  });
  assert.equal(
    comparison.schemaVersion,
    "trading_shadow_risk_fixture_comparison.v1"
  );
  assert.equal(comparison.comparableFeatureCount, 9);
  assert.equal(comparison.decisionPerformed, false);
  assert.equal(comparison.thresholdApplied, false);
  assert.equal(comparison.authorizing, false);
  assert.deepEqual(comparison.comparisons[0], {
    featureId: "net_realized_pnl",
    observedState: "observed",
    fixtureState: "observed",
    comparable: true,
    descriptiveDelta: "4.25",
    unit: "venue_quote_asset",
    authorizing: false
  });
});

test("TC-203 read boundary rejects an authorizing or relinked Shadow Risk profile", () => {
  const finalized = finalizeImported(importedProfile(createChallenge()));
  const authorizing = structuredClone(finalized);
  authorizing.factorScorecard.shadowRisk.authorizing = true;
  assert.throws(
    () => realTradingCreditProfileView(authorizing),
    /Shadow Risk safety boundary is invalid/
  );

  const relinked = structuredClone(finalized);
  relinked.factorScorecard.shadowRisk.evidenceSnapshotHash = HASH("f");
  assert.throws(
    () => realTradingCreditProfileView(relinked),
    /Shadow Risk safety boundary is invalid/
  );
});
