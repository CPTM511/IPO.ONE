import test from "node:test";
import assert from "node:assert/strict";
import {
  createTradingAccountBindingChallengeHandler,
  finalizeTradingEvidenceSnapshotHandler,
  importTradingHistoryHandler,
  readTradingCreditProfileHandler
} from "../src/index.js";
import {
  HyperliquidBindingProofVerifier,
  normalizeHyperliquidAddress
} from "../../hyperliquid-info/src/index.js";
import {
  CoreProjectionType,
  createCoreProjectionHash
} from "../../persistence/src/index.js";

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const NOW = new Date("2026-07-25T00:00:00.000Z");
const MASTER_ADDRESS = "0x1111111111111111111111111111111111111111";
const SUBACCOUNT_ADDRESS = "0x2222222222222222222222222222222222222222";
const MASTER_HASH = normalizeHyperliquidAddress(MASTER_ADDRESS).addressHash;
const SUBACCOUNT_HASH =
  normalizeHyperliquidAddress(SUBACCOUNT_ADDRESS).addressHash;
const subject = {
  subjectId: "subject_trading_1",
  subjectHash: HASH_A,
  subjectType: "human",
  status: "active",
  primaryPrincipalId: "principal_trading_1",
  prototypeOnly: false,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  schemaVersion: "subject.v1"
};
const principal = {
  principalId: "principal_trading_1",
  principalHash: HASH_B,
  principalType: "organization",
  responsibilityScope: "tenant",
  status: "active",
  createdAt: NOW.toISOString(),
  schemaVersion: "principal.v1"
};
const binding = {
  actorId: "actor_human_1",
  actorType: "human",
  relationship: "owner"
};

function base() {
  return {
    client: {
      async query(statement) {
        assert.match(statement, /trading_credit_profiles/);
        return { rowCount: 0, rows: [] };
      }
    },
    directory: {
      async listActiveResourceBindings() {
        return [binding];
      }
    },
    authenticationContext: {
      tenantId: "tenant_1",
      actorId: binding.actorId,
      actorType: binding.actorType
    },
    authorizationDecision: {
      resourceType: "subject",
      resourceId: subject.subjectId,
      resourceVersion: 1
    },
    payload: {
      environment: "hyperliquid_testnet",
      masterAccountAddress: MASTER_ADDRESS,
      subaccountAddress: SUBACCOUNT_ADDRESS
    },
    now: NOW,
    requestId: "request_trading_1",
    correlationId: "correlation_trading_1"
  };
}

function dependencies() {
  const typedData = new HyperliquidBindingProofVerifier();
  const calls = [];
  return {
    calls,
    hyperliquidBindingProofVerifier: {
      createTypedData(input) {
        return typedData.createTypedData(input);
      },
      async verify({ challenge, signature }) {
        calls.push({ type: "proof", signature });
        return {
          masterAddressHash: challenge.masterAddressHash,
          typedDataHash: challenge.typedDataHash,
          proofHash: `0x${"1".repeat(64)}`,
          verificationMethod: "eip712_eoa_master_v1",
          rawSignaturePersisted: false,
          reusableSignature: false,
          chainId: "eip155:998",
          environment: "hyperliquid_testnet",
          schemaVersion: "hyperliquid_binding_proof_result.v1"
        };
      }
    },
    hyperliquidInfoAdapter: {
      async verifyMasterSubaccountBinding(input) {
        calls.push({ type: "relationship", input });
        return {
          profileId: "hyperliquid_testnet_info.v1",
          environment: "testnet",
          masterAddressHash: MASTER_HASH,
          subaccountAddressHash: SUBACCOUNT_HASH,
          sourceResponseHashes: {
            masterUserRole: `0x${"2".repeat(64)}`,
            subaccountUserRole: `0x${"3".repeat(64)}`,
            subAccounts: `0x${"4".repeat(64)}`
          },
          observedAt: "2026-07-25T00:01:00.000Z",
          relationshipHash: `0x${"5".repeat(64)}`,
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
        };
      },
      async readFillHistory(input) {
        calls.push({ type: "history", input });
        return {
          profileId: "hyperliquid_testnet_info.v1",
          environment: "testnet",
          accountAddressHash: SUBACCOUNT_HASH,
          windowStartsAt: new Date(input.fillWindowStartMs).toISOString(),
          windowEndsAt: new Date(input.fillWindowEndMs).toISOString(),
          sourceRoleHash: `0x${"6".repeat(64)}`,
          pageHashes: [`0x${"7".repeat(64)}`],
          eventHashes: [`0x${"8".repeat(64)}`],
          paginationComplete: true,
          paginationStalled: false,
          pageLimitReached: false,
          sourceRetentionLimitReached: false,
          historyManifestHash: `0x${"9".repeat(64)}`,
          events: [{
            coin: "ETH",
            side: "buy",
            price: "2000",
            size: "1.5",
            startPosition: "0",
            closedPnl: "15",
            fee: "0.5",
            feeToken: "USDC",
            orderId: "1",
            tradeId: "2",
            transactionHash: `0x${"a".repeat(64)}`,
            direction: "Open Long",
            crossed: true,
            timestamp: "2026-07-24T12:00:00.000Z",
            eventHash: `0x${"8".repeat(64)}`
          }],
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
          observedAt: "2026-07-25T00:01:00.000Z",
          readOnly: true,
          testnetOnly: true,
          externalOrderSubmitted: false,
          signerAvailable: false,
          credentialsUsed: false,
          productionAuthority: false,
          fundsAuthority: false,
          schemaVersion: "hyperliquid_fill_history.v1"
        };
      },
      async readAccountSnapshot(input) {
        calls.push({ type: "snapshot", input });
        return {
          snapshot: {
            profileId: "hyperliquid_testnet_info.v1",
            environment: "testnet",
            accountRole: "subaccount",
            accountAddressHash: SUBACCOUNT_HASH,
            verifiedMasterAddressHash: MASTER_HASH,
            accountRoleVerified: true,
            equity: {
              accountValue: "1000",
              withdrawable: "800"
            },
            counts: {
              positions: 1,
              openOrders: 0
            },
            sourceBundleHash: `0x${"b".repeat(64)}`,
            snapshotHash: `0x${"c".repeat(64)}`,
            observedAt: "2026-07-25T00:01:00.000Z",
            venueTime: "2026-07-25T00:00:59.000Z",
            freshness: "fresh",
            readOnly: true,
            testnetOnly: true,
            externalOrderSubmitted: false,
            signerAvailable: false,
            credentialsUsed: false,
            productionAuthority: false,
            fundsAuthority: false,
            schemaVersion: "hyperliquid_info_account_snapshot.v1"
          }
        };
      }
    }
  };
}

test("TC-202 handlers plan one atomic read-only Testnet Evidence lifecycle", async () => {
  const deps = dependencies();
  const createInput = base();
  createInput.coreRepository = {
    async getProjectionStateInTransaction(_client, type) {
      if (type === CoreProjectionType.SUBJECT) return { value: subject };
      if (type === CoreProjectionType.PRINCIPAL) return { value: principal };
      return undefined;
    }
  };
  const created =
    await createTradingAccountBindingChallengeHandler(deps).plan(createInput);
  assert.equal(created.events.length, 1);
  assert.equal(created.writes.length, 1);
  assert.equal(
    created.writes[0].type,
    CoreProjectionType.TRADING_CREDIT_PROFILE
  );
  assert.equal(created.response.profile.stage, "challenge_pending");
  assert.equal(created.response.profile.syntheticOnly, false);
  assert.equal(created.response.profile.externalSystemQueried, false);
  assert.equal(created.response.profile.fundsAuthority, false);
  assert.equal(created.response.bindingRequest.chainId, "eip155:998");
  assert.equal(created.response.bindingRequest.reusableSignature, false);
  assert.equal(
    created.authorizationResource.actorBindings[0].relationship,
    "owner"
  );

  const createdProfile = created.response.profile;
  const importState = {
    value: createdProfile,
    entityHash: createCoreProjectionHash(
      CoreProjectionType.TRADING_CREDIT_PROFILE,
      createdProfile
    ),
    aggregateVersion: 1,
    sourceEventId: created.events[0].event.eventId,
    sourceEvidenceHash: HASH_A,
    sourceFinality: "finalized"
  };
  const importInput = {
    ...base(),
    payload: {
      masterAccountAddress: MASTER_ADDRESS,
      subaccountAddress: SUBACCOUNT_ADDRESS,
      signature:
        `0x${"1".repeat(64)}${"2".repeat(64)}1b`
    },
    now: new Date("2026-07-25T00:01:00.000Z"),
    authorizationDecision: {
      resourceType: "trading_credit_profile",
      resourceId: createdProfile.tradingCreditProfileId,
      resourceVersion: 1
    },
    coreRepository: {
      async getProjectionStateInTransaction() {
        return importState;
      }
    }
  };
  const imported = await importTradingHistoryHandler(deps).plan(importInput);
  assert.equal(imported.response.profile.stage, "history_imported");
  assert.equal(
    imported.response.profile.historyImport.sourceType,
    "hyperliquid_testnet_info"
  );
  assert.equal(
    imported.response.profile.historyImport.dataQuality.completeness,
    "partial"
  );
  assert.equal(
    imported.response.profile.historyImport.rawEventsPersisted,
    false
  );
  assert.equal(imported.response.profile.externalSystemQueried, true);
  assert.deepEqual(
    deps.calls.map(({ type }) => type),
    ["proof", "relationship", "history", "snapshot"]
  );

  const importedProfile = imported.response.profile;
  const finalizeInput = {
    ...importInput,
    payload: {},
    now: new Date("2026-07-25T00:02:00.000Z"),
    authorizationDecision: {
      ...importInput.authorizationDecision,
      resourceVersion: 2
    },
    coreRepository: {
      async getProjectionStateInTransaction() {
        return {
          value: importedProfile,
          entityHash: createCoreProjectionHash(
            CoreProjectionType.TRADING_CREDIT_PROFILE,
            importedProfile
          ),
          aggregateVersion: 2,
          sourceEventId: imported.events[0].event.eventId,
          sourceEvidenceHash: HASH_B,
          sourceFinality: "finalized"
        };
      }
    }
  };
  const finalized =
    await finalizeTradingEvidenceSnapshotHandler(deps).plan(finalizeInput);
  assert.equal(finalized.response.profile.stage, "finalized");
  assert.equal(finalized.events.length, 1);
  assert.equal(finalized.writes.length, 1);
  assert.equal(
    finalized.events[0].aggregateType,
    "trading_credit_profile"
  );
  assert.equal(
    finalized.writes[0].type,
    CoreProjectionType.TRADING_CREDIT_PROFILE
  );
  assert.equal(finalized.response.profile.factorScorecard.factors.length, 5);
  assert.equal(
    finalized.response.profile.factorScorecard.schemaVersion,
    "trading_real_factor_scorecard.v2"
  );
  assert.equal(
    finalized.response.profile.factorScorecard.shadowRisk.schemaVersion,
    "trading_real_shadow_risk_profile.v1"
  );
  assert.equal(
    finalized.response.profile.factorScorecard.shadowRisk.features.length,
    16
  );
  assert.equal(
    finalized.response.profile.factorScorecard.shadowRisk.economicStateMutation,
    false
  );
  assert.equal(
    finalized.response.profile.factorScorecard.shadowRisk.authorizing,
    false
  );
  assert.equal(
    finalized.response.profile.factorScorecard.creditDecision.performed,
    false
  );
  assert.equal(
    finalized.response.profile.factorScorecard.newRiskAuthority,
    false
  );
  assert.equal(
    finalized.events[0].event.payload.externalSystemQueried,
    true
  );

  const read = await readTradingCreditProfileHandler(deps).execute({
    ...finalizeInput,
    resource: finalizeInput.authorizationDecision,
    coreRepository: {
      async getProjectionStateInTransaction() {
        return {
          value: finalized.response.profile,
          aggregateVersion: 3,
          sourceFinality: "finalized"
        };
      }
    }
  });
  assert.deepEqual(read.profile, finalized.response.profile);

  const rebound = await createTradingAccountBindingChallengeHandler(deps).plan({
    ...base(),
    now: new Date("2026-07-25T00:04:00.000Z"),
    client: {
      async query() {
        return {
          rowCount: 1,
          rows: [{
            id: finalized.response.profile.tradingCreditProfileId
          }]
        };
      }
    },
    coreRepository: {
      async getProjectionStateInTransaction(_client, type) {
        if (type === CoreProjectionType.SUBJECT) return { value: subject };
        if (type === CoreProjectionType.PRINCIPAL) return { value: principal };
        if (type === CoreProjectionType.TRADING_CREDIT_PROFILE) {
          return {
            value: finalized.response.profile,
            aggregateVersion: 3,
            sourceEventId: finalized.events[0].event.eventId,
            sourceEvidenceHash: HASH_A,
            sourceFinality: "finalized"
          };
        }
        return undefined;
      }
    }
  });
  assert.equal(rebound.response.profile.bindingEpoch, 2);
  assert.equal(rebound.response.profile.evidenceAuthority.active, false);
  assert.equal(
    rebound.response.profile.priorEvidenceInvalidation.active,
    false
  );
  assert.equal(rebound.events[0].expectedVersion, 3);
  assert.equal(
    Object.hasOwn(rebound, "authorizationResourceTransition"),
    false
  );
});

test("TC-202 handlers reject caller-authored signals and cross-actor mutation", async () => {
  const deps = dependencies();
  assert.throws(
    () =>
      createTradingAccountBindingChallengeHandler(deps).preflight({
        payload: {
          environment: "hyperliquid_testnet",
          masterAccountAddress: MASTER_ADDRESS,
          subaccountAddress: SUBACCOUNT_ADDRESS,
          pnl: 999999
        }
      }),
    /not available/
  );
  const input = base();
  input.payload = {
    masterAccountAddress: MASTER_ADDRESS,
    subaccountAddress: SUBACCOUNT_ADDRESS,
    signature: `0x${"1".repeat(64)}${"2".repeat(64)}1b`
  };
  input.authorizationDecision = {
    resourceType: "trading_credit_profile",
    resourceId: "trading_credit_profile_1",
    resourceVersion: 1
  };
  input.directory = {
    async listActiveResourceBindings() {
      return [{ ...binding, actorId: "another_actor" }];
    }
  };
  await assert.rejects(
    () => importTradingHistoryHandler(deps).plan(input),
    /not available/
  );
  assert.equal(deps.calls.length, 0);
});
