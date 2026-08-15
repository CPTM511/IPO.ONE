import assert from "node:assert/strict";
import test from "node:test";
import {
  HYPERLIQUID_TESTNET_INFO_PROFILE,
  HyperliquidTestnetInfoAdapter
} from "../src/index.js";
import { hashId } from "../../../packages/domain/src/index.js";

const APPROVAL = "TC-201";
const ACCOUNT_ADDRESS =
  process.env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS;
const ACCOUNT_ROLE =
  process.env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ROLE;

test("approved Hyperliquid Testnet Info profile verifies one real account before a bounded snapshot", async () => {
  assert.equal(
    process.env.IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_READ,
    APPROVAL,
    "set IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_READ=TC-201"
  );
  assert.match(
    ACCOUNT_ADDRESS ?? "",
    /^0x(?!0{40}$)[0-9a-fA-F]{40}$/,
    "set IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS to an actual non-zero master or subaccount"
  );
  assert.ok(
    new Set(["master", "subaccount"]).has(ACCOUNT_ROLE),
    "set IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ROLE to master or subaccount"
  );
  const now = Date.now();
  const calls = [];
  let userRoleResponse;
  const adapter = new HyperliquidTestnetInfoAdapter({
    maximumCallsPerMinute: 5,
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body.type);
      const response = await fetch(url, options);
      if (body.type === "userRole") {
        userRoleResponse = await response.clone().json();
      }
      return response;
    }
  });
  const result = await adapter.readAccountSnapshot({
    accountAddress: ACCOUNT_ADDRESS,
    accountRole: ACCOUNT_ROLE,
    fillWindowStartMs: now - 60 * 60 * 1_000,
    fillWindowEndMs: now
  });
  assert.equal(adapter.profile, HYPERLIQUID_TESTNET_INFO_PROFILE);
  assert.equal(calls[0], "userRole");
  assert.deepEqual(
    calls.slice(1).sort(),
    [
      "clearinghouseState",
      "frontendOpenOrders",
      "userFillsByTime",
      ...(ACCOUNT_ROLE === "master" ? ["subAccounts"] : [])
    ].sort()
  );
  assert.equal(
    userRoleResponse.role,
    ACCOUNT_ROLE === "master" ? "user" : "subAccount"
  );
  assert.equal(result.snapshot.accountRoleVerified, true);
  assert.equal(result.snapshot.actualAccountAddressQueried, true);
  assert.equal(result.snapshot.apiWalletAddressAccepted, false);
  assert.equal(result.snapshot.readOnly, true);
  assert.equal(result.snapshot.testnetOnly, true);
  assert.equal(result.snapshot.externalOrderSubmitted, false);
  assert.equal(result.snapshot.signerAvailable, false);
  assert.equal(result.snapshot.exchangeEndpointAvailable, false);
  assert.equal(result.snapshot.credentialsUsed, false);
  assert.equal(result.snapshot.productionAuthority, false);
  assert.equal(result.snapshot.fundsAuthority, false);
  console.log(`TC201_LIVE_EVIDENCE ${JSON.stringify({
    profileId: result.snapshot.profileId,
    environment: result.snapshot.environment,
    origin: result.snapshot.origin,
    path: result.snapshot.path,
    method: result.snapshot.method,
    queryTypes: calls,
    accountAddressHash: result.snapshot.accountAddressHash,
    verifiedMasterAddressHash: result.snapshot.verifiedMasterAddressHash,
    accountRoleVerified: result.snapshot.accountRoleVerified,
    observedAt: result.snapshot.observedAt,
    venueTime: result.snapshot.venueTime,
    freshness: result.snapshot.freshness,
    userRoleResponseHash: hashId(
      "hyperliquid_info_source_response",
      {
        profileId: HYPERLIQUID_TESTNET_INFO_PROFILE.profileId,
        queryType: "userRole",
        value: userRoleResponse
      }
    ),
    returnedRole: userRoleResponse.role,
    sourceResponseHashes: result.snapshot.sourceResponseHashes,
    sourceBundleHash: result.snapshot.sourceBundleHash,
    snapshotHash: result.snapshot.snapshotHash,
    counts: result.snapshot.counts,
    outcome: "snapshot_created",
    readOnly: result.snapshot.readOnly,
    testnetOnly: result.snapshot.testnetOnly,
    externalOrderSubmitted: result.snapshot.externalOrderSubmitted,
    signerAvailable: result.snapshot.signerAvailable,
    exchangeEndpointAvailable: result.snapshot.exchangeEndpointAvailable,
    credentialsUsed: result.snapshot.credentialsUsed,
    productionAuthority: result.snapshot.productionAuthority,
    fundsAuthority: result.snapshot.fundsAuthority
  })}`);
});
