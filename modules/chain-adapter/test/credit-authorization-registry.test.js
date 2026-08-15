import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, encodeFunctionResult } from "viem";
import { hashId } from "../../../packages/domain/src/index.js";
import {
  BASE_SEPOLIA_PROFILE,
  BaseSepoliaCreditAuthorizationAdapter,
  CREDIT_AUTHORIZATION_REGISTRY_ABI,
  createCreditAuthorizationProjection
} from "../src/index.js";

const contractAddress = "0x3333333333333333333333333333333333333333";
const zeroHash = `0x${"0".repeat(64)}`;

function projection() {
  return createCreditAuthorizationProjection({
    authorizationId: "authorization_base_sepolia_001",
    accountId: "eip155:84532:0x1111111111111111111111111111111111111111",
    subjectAccountHash: hashId("test_subject_account", "one"),
    acceptedOfferHash: hashId("test_offer", "one"),
    policyHash: hashId("test_policy", "one"),
    providerScopeHash: hashId("test_provider_scope", "one"),
    creditStateHash: hashId("test_credit_state", "one"),
    obligationProofHash: zeroHash,
    validUntil: "2026-08-01T00:00:00.000Z"
  });
}

test("Base Sepolia is the only active registry profile and publish is zero-value and Offer-bound", () => {
  const adapter = new BaseSepoliaCreditAuthorizationAdapter({ contractAddress });
  const prepared = adapter.preparePublish(projection());
  assert.equal(prepared.chainId, "eip155:84532");
  assert.equal(prepared.value, 0n);
  assert.equal(adapter.descriptor().profileHash, BASE_SEPOLIA_PROFILE.profileHash);
  const decoded = decodeFunctionData({ abi: CREDIT_AUTHORIZATION_REGISTRY_ABI, data: prepared.data });
  assert.equal(decoded.functionName, "publishAuthorization");
  assert.equal(decoded.args[0], projection().authorizationHash);
  assert.equal(decoded.args[3], projection().acceptedOfferHash);
  assert.equal(decoded.args[4], projection().policyHash);
  assert.equal(decoded.args[5], projection().providerScopeHash);
});

test("registry mutations bind expected versions and exact proof hashes", () => {
  const adapter = new BaseSepoliaCreditAuthorizationAdapter({ contractAddress });
  const authorizationHash = projection().authorizationHash;
  const creditStateHash = hashId("test_credit_state", "two");
  const obligationProofHash = hashId("test_obligation", "one");
  const calls = [
    adapter.prepareUpdate({ authorizationHash, expectedVersion: 1, creditStateHash, obligationProofHash }),
    adapter.prepareSuspend({ authorizationHash, expectedVersion: 2 }),
    adapter.prepareRevoke({ authorizationHash, expectedVersion: 3 }),
    adapter.prepareClose({ authorizationHash, expectedVersion: 3, obligationProofHash })
  ].map(({ data }) => decodeFunctionData({ abi: CREDIT_AUTHORIZATION_REGISTRY_ABI, data }));
  assert.deepEqual(calls.map(({ functionName }) => functionName), [
    "updateProof", "suspendAuthorization", "revokeAuthorization", "closeAuthorization"
  ]);
  assert.equal(calls[0].args[1], 1n);
  assert.equal(calls[0].args[2], creditStateHash);
  assert.equal(calls[0].args[3], obligationProofHash);
  assert.equal(calls[1].args[1], 2n);
  assert.equal(calls[2].args[1], 3n);
});

test("decoded chain state reconciles exact PostgreSQL projection and reports drift", () => {
  const adapter = new BaseSepoliaCreditAuthorizationAdapter({ contractAddress });
  const expected = projection();
  const resultData = encodeFunctionResult({
    abi: CREDIT_AUTHORIZATION_REGISTRY_ABI,
    functionName: "getAuthorization",
    result: {
      account: expected.accountAddress,
      subjectAccountHash: expected.subjectAccountHash,
      acceptedOfferHash: expected.acceptedOfferHash,
      policyHash: expected.policyHash,
      providerScopeHash: expected.providerScopeHash,
      creditStateHash: expected.creditStateHash,
      obligationProofHash: expected.obligationProofHash,
      validUntil: BigInt(new Date(expected.validUntil).getTime() / 1_000),
      version: 1n,
      status: 1
    }
  });
  const state = adapter.decodeAuthorization(resultData);
  assert.equal(state.status, "active");
  assert.equal(adapter.reconcile(expected, state).reconciled, true);
  const drifted = { ...state, creditStateHash: hashId("test_credit_state", "drift") };
  assert.deepEqual(adapter.reconcile(expected, drifted).differences, ["creditStateHash"]);
});

test("registry projection rejects X Layer, caller fields, stale versions, and malformed hashes", () => {
  const valid = {
    authorizationId: "authorization_base_sepolia_001",
    accountId: "eip155:84532:0x1111111111111111111111111111111111111111",
    subjectAccountHash: hashId("test_subject_account", "one"),
    acceptedOfferHash: hashId("test_offer", "one"),
    policyHash: hashId("test_policy", "one"),
    providerScopeHash: hashId("test_provider_scope", "one"),
    creditStateHash: hashId("test_credit_state", "one"),
    obligationProofHash: zeroHash,
    validUntil: "2026-08-01T00:00:00.000Z"
  };
  assert.throws(
    () => createCreditAuthorizationProjection({ ...valid, accountId: valid.accountId.replace("84532", "1952") }),
    (error) => error.code === "account_proof_chain_mismatch"
  );
  assert.throws(
    () => createCreditAuthorizationProjection({ ...valid, tenantId: "caller_tenant" }),
    (error) => error.code === "invalid_credit_authorization_projection"
  );
  const adapter = new BaseSepoliaCreditAuthorizationAdapter({ contractAddress });
  assert.throws(
    () => adapter.prepareSuspend({ authorizationHash: projection().authorizationHash, expectedVersion: 0 }),
    (error) => error.code === "invalid_credit_authorization_projection"
  );
  assert.throws(
    () => adapter.prepareClose({ authorizationHash: zeroHash, expectedVersion: 1, obligationProofHash: zeroHash }),
    (error) => error.code === "invalid_credit_authorization_projection"
  );
});
