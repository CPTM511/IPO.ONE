import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  createTc203LiveEvidenceSession,
  hyperliquidBindingTypedDataTransport
} from "../start-hyperliquid-live-evidence-handoff.mjs";
import {
  HyperliquidBindingProofVerifier,
  normalizeHyperliquidAddress
} from "../../../modules/hyperliquid-info/src/index.js";
import { hashId } from "../../../packages/domain/src/index.js";

const MASTER_PRIVATE_KEY =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const MASTER = privateKeyToAccount(MASTER_PRIVATE_KEY);
const SUBACCOUNT = "0x2222222222222222222222222222222222222222";
const NOW = new Date("2026-07-25T12:00:00.000Z");
const HASH = (character) => `0x${character.repeat(64)}`;

function fakeInfoAdapter(callOrder) {
  const masterAddressHash =
    normalizeHyperliquidAddress(MASTER.address).addressHash;
  const subaccountAddressHash =
    normalizeHyperliquidAddress(SUBACCOUNT).addressHash;
  return {
    async verifyMasterSubaccountBinding() {
      callOrder.push("relationship");
      return {
        profileId: "hyperliquid_testnet_info.v1",
        environment: "testnet",
        masterAddressHash,
        subaccountAddressHash,
        sourceResponseHashes: {
          masterUserRole: HASH("1"),
          subaccountUserRole: HASH("2"),
          subAccounts: HASH("3")
        },
        observedAt: NOW.toISOString(),
        relationshipHash: HASH("4"),
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
    async readFillHistory({ fillWindowStartMs, fillWindowEndMs }) {
      callOrder.push("history");
      return {
        profileId: "hyperliquid_testnet_info.v1",
        environment: "testnet",
        accountAddressHash: subaccountAddressHash,
        windowStartsAt: new Date(fillWindowStartMs).toISOString(),
        windowEndsAt: new Date(fillWindowEndMs).toISOString(),
        sourceRoleHash: HASH("5"),
        pageHashes: [HASH("6")],
        eventHashes: [HASH("7")],
        paginationComplete: true,
        paginationStalled: false,
        pageLimitReached: false,
        sourceRetentionLimitReached: false,
        historyManifestHash: HASH("8"),
        events: [{
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
          transactionHash: HASH("9"),
          direction: "Open Long",
          crossed: true,
          timestamp: new Date(
            fillWindowEndMs - 60 * 60 * 1_000
          ).toISOString(),
          eventHash: HASH("7")
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
        observedAt: NOW.toISOString(),
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
    async readAccountSnapshot() {
      callOrder.push("snapshot");
      return {
        snapshot: {
          profileId: "hyperliquid_testnet_info.v1",
          environment: "testnet",
          accountRole: "subaccount",
          accountAddressHash: subaccountAddressHash,
          verifiedMasterAddressHash: masterAddressHash,
          accountRoleVerified: true,
          equity: {
            accountValue: "1000.5",
            withdrawable: "750.25"
          },
          counts: {
            positions: 1,
            openOrders: 2
          },
          sourceBundleHash: HASH("a"),
          snapshotHash: HASH("b"),
          observedAt: NOW.toISOString(),
          venueTime: new Date(NOW.getTime() - 1_000).toISOString(),
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
  };
}

test("TC-203 wallet transport is JSON-string-compatible EIP-712 v4 data", () => {
  const typedData = {
    domain: { name: "Test", version: "1", chainId: 998 },
    types: {
      Example: [{ name: "value", type: "bytes32" }]
    },
    primaryType: "Example",
    message: { value: HASH("1") }
  };
  const transport = hyperliquidBindingTypedDataTransport(typedData);
  assert.deepEqual(transport.types.EIP712Domain, [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" }
  ]);
  assert.doesNotThrow(() => JSON.stringify(transport));
  assert.throws(
    () =>
      hyperliquidBindingTypedDataTransport({
        ...typedData,
        types: {
          EIP712Domain: [],
          Example: typedData.types.Example
        }
      }),
    /outside the approved transport shape/
  );
});

test("TC-203 handoff verifies ownership before reads and returns only hash Evidence", async () => {
  const callOrder = [];
  const verifier = new HyperliquidBindingProofVerifier();
  const proofVerifier = {
    createTypedData(input) {
      return verifier.createTypedData(input);
    },
    async verify(input) {
      callOrder.push("ownership");
      return verifier.verify(input);
    }
  };
  const session = createTc203LiveEvidenceSession({
    infoAdapter: fakeInfoAdapter(callOrder),
    proofVerifier,
    clock: () => new Date(NOW)
  });
  const challenge = session.createChallenge({
    masterAccountAddress: MASTER.address,
    subaccountAddress: SUBACCOUNT
  });
  assert.deepEqual(callOrder, []);
  const signature = await MASTER.signTypedData({
    domain: challenge.typedData.domain,
    types: {
      HyperliquidAccountBindingProof:
        challenge.typedData.types.HyperliquidAccountBindingProof
    },
    primaryType: challenge.typedData.primaryType,
    message: challenge.typedData.message
  });
  const evidence = await session.complete({
    challengeId: challenge.challengeId,
    masterAccountAddress: MASTER.address,
    signature,
    subaccountAddress: SUBACCOUNT
  });

  assert.deepEqual(callOrder, [
    "ownership",
    "relationship",
    "history",
    "snapshot"
  ]);
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.nonEmptyHistory, true);
  assert.equal(evidence.imported, true);
  assert.equal(evidence.finalized, true);
  assert.equal(evidence.readBack, true);
  assert.equal(evidence.authorizing, false);
  assert.equal(evidence.economicStateMutation, false);
  assert.equal(evidence.fundsAuthority, false);
  assert.equal(evidence.rawAddressesPersisted, false);
  assert.equal(evidence.rawSignaturePersisted, false);
  assert.equal(evidence.rawEventsPersisted, false);
  assert.equal(evidence.shadowRiskFeatures.length, 16);
  assert.equal(
    JSON.stringify(evidence).includes(MASTER.address.toLowerCase()),
    false
  );
  assert.equal(JSON.stringify(evidence).includes(SUBACCOUNT.toLowerCase()), false);
  assert.equal(JSON.stringify(evidence).includes(signature.toLowerCase()), false);
  assert.equal(
    evidence.masterAddressHash,
    hashId(
      "hyperliquid_account_address",
      MASTER.address.toLowerCase()
    )
  );

  await assert.rejects(
    () =>
      session.complete({
        challengeId: challenge.challengeId,
        masterAccountAddress: MASTER.address,
        signature,
        subaccountAddress: SUBACCOUNT
      }),
    /not current/
  );
});
