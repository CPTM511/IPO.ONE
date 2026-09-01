import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  HYPERCORE_TESTNET_SIGNER_PROVISIONING_APPROVAL,
  destroyHypercoreIsolatedTestnetSigner,
  provisionAgentCreditHyperliquidTestnetSigner,
  provisionHypercoreIsolatedTestnetSigner
} from "../hypercore-isolated-signer.mjs";
import {
  authorizeAgentCreditHyperliquidRegistration,
  classifyHyperliquidRegistrationError,
  createAgentCreditHyperliquidHandoffProfile,
  createHypercore002dHandoffSession
} from "../start-hypercore-002d-handoff.mjs";

const MASTER = privateKeyToAccount(
  "0x1111111111111111111111111111111111111111111111111111111111111111"
);
const NOW = new Date("2026-08-09T06:30:00.000Z");

function json(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function fetchFixture({ accountValue = "100", withdrawable = "100" } = {}) {
  return async (url, options) => {
    assert.equal(url, "https://api.hyperliquid-testnet.xyz/info");
    const request = JSON.parse(options.body);
    assert.equal(request.user, MASTER.address.toLowerCase());
    if (request.type === "userRole") return json({ role: "user" });
    if (request.type === "openOrders") return json([]);
    if (request.type === "clearinghouseState") {
      return json({
        marginSummary: { accountValue },
        withdrawable,
        assetPositions: []
      });
    }
    throw new Error(`unexpected query ${request.type}`);
  };
}

test("002D handoff verifies a qualified master and stops at exact registration approval", async () => {
  const variable = "IPO_ONE_APPROVE_HYPERCORE_TESTNET_SIGNER";
  const previous = process.env[variable];
  process.env[variable] = HYPERCORE_TESTNET_SIGNER_PROVISIONING_APPROVAL;
  const keyPath =
    `/private/tmp/ipo-one-hypercore-002d/handoff-${process.pid}-${Date.now()}.key`;
  try {
    await provisionHypercoreIsolatedTestnetSigner({ keyPath });
    const session = createHypercore002dHandoffSession({
      signerKeyPath: keyPath,
      fetchImpl: fetchFixture(),
      clock: () => new Date(NOW)
    });
    const account = await session.inspectMaster({
      masterAccountAddress: MASTER.address
    });
    assert.equal(account.qualified, true);
    assert.equal(JSON.stringify(account).includes(MASTER.address.toLowerCase()), false);
    const prepared = await session.prepareRegistration();
    assert.match(prepared.signingRequestHash, /^0x[0-9a-f]{64}$/);
    assert.deepEqual(prepared.typedData.types.EIP712Domain, [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" }
    ]);
    assert.equal(prepared.registrationWritePerformed, false);
    assert.equal(
      prepared.exactApprovalMarker,
      `HYPERLIQUID-002D-AGENT:${prepared.signingRequestHash}`
    );
    const state = await session.state();
    assert.equal(state.registrationAuthorized, false);
    assert.equal(state.safety.orderSubmissionAvailable, false);
    assert.equal(state.safety.walletSigningChain, "eip155:421614");
    assert.equal(state.safety.hyperliquidSignatureChainId, "0x66eee");
    assert.equal(JSON.stringify(state).includes(MASTER.address.toLowerCase()), false);
  } finally {
    await destroyHypercoreIsolatedTestnetSigner(keyPath).catch(() => {});
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
});

test("Agent Credit handoff binds the exact run, candidate and separate registration authority", async () => {
  const runId = `agent-credit-exec-001-l3-test-${process.pid}-${Date.now()}`;
  const candidateCommit = "ffbcae38fedcb6dbcc4b2da538a2636df0836fde";
  const keyPath = `/private/tmp/ipo-one-agent-credit-exec-001/${runId}.key`;
  const profile = createAgentCreditHyperliquidHandoffProfile({
    runId,
    candidateCommit
  });
  let approvalPath;
  try {
    await provisionAgentCreditHyperliquidTestnetSigner({
      keyPath,
      runId,
      env: { IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: runId }
    });
    const session = createHypercore002dHandoffSession({
      signerKeyPath: keyPath,
      fetchImpl: fetchFixture(),
      clock: () => new Date(NOW),
      profile
    });
    await session.inspectMaster({ masterAccountAddress: MASTER.address });
    const prepared = await session.prepareRegistration();
    assert.equal(prepared.issueId, "AGENT-CREDIT-EXEC-001");
    assert.equal(prepared.runId, runId);
    assert.equal(prepared.candidateCommit, candidateCommit);
    assert.equal(prepared.typedData.message.agentName, "ipo1-l3-002");
    assert.equal(
      prepared.exactApprovalMarker,
      `AGENT-CREDIT-EXEC-001:${runId}:${candidateCommit}:AGENT:${prepared.signingRequestHash}`
    );
    const state = await session.state();
    assert.equal(state.runId, runId);
    assert.equal(state.candidateCommit, candidateCommit);
    assert.equal(state.registrationAuthorized, false);

    const authorization = await authorizeAgentCreditHyperliquidRegistration({
      requestHash: prepared.signingRequestHash,
      runId,
      candidateCommit,
      env: {
        IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_REGISTRATION:
          prepared.exactApprovalMarker
      }
    });
    approvalPath =
      `/private/tmp/ipo-one-agent-credit-exec-001/approvals/` +
      `${prepared.signingRequestHash.slice(2)}.authorized`;
    assert.equal(authorization.requestHash, prepared.signingRequestHash);
    assert.equal((await session.state()).registrationAuthorized, true);
  } finally {
    if (approvalPath) await unlink(approvalPath).catch(() => {});
    await destroyHypercoreIsolatedTestnetSigner(keyPath).catch(() => {});
  }
});

test("Agent Credit registration uses the official POST shape and persists only normalized rejection evidence", async () => {
  const runId = `agent-credit-exec-001-l3-rejection-${process.pid}-${Date.now()}`;
  const candidateCommit = "ffbcae38fedcb6dbcc4b2da538a2636df0836fde";
  const keyPath = `/private/tmp/ipo-one-agent-credit-exec-001/${runId}.key`;
  let consumedPath;
  let resultPath;
  let exchangeCalls = 0;
  let exchangeBody;
  const fetchImpl = async (url, options) => {
    if (url === "https://api.hyperliquid-testnet.xyz/info") {
      return fetchFixture()(url, options);
    }
    assert.equal(url, "https://api.hyperliquid-testnet.xyz/exchange");
    exchangeCalls += 1;
    exchangeBody = JSON.parse(options.body);
    return json({ status: "err", response: "Agent name is invalid" });
  };
  try {
    await provisionAgentCreditHyperliquidTestnetSigner({
      keyPath,
      runId,
      env: { IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN: runId }
    });
    const profile = createAgentCreditHyperliquidHandoffProfile({
      runId,
      candidateCommit
    });
    const session = createHypercore002dHandoffSession({
      signerKeyPath: keyPath,
      fetchImpl,
      clock: () => new Date(NOW),
      profile
    });
    await session.inspectMaster({ masterAccountAddress: MASTER.address });
    const prepared = await session.prepareRegistration();
    await authorizeAgentCreditHyperliquidRegistration({
      requestHash: prepared.signingRequestHash,
      runId,
      candidateCommit,
      env: {
        IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_REGISTRATION:
          prepared.exactApprovalMarker
      }
    });
    const stem = prepared.signingRequestHash.slice(2);
    consumedPath = `/private/tmp/ipo-one-agent-credit-exec-001/approvals/${stem}.consumed`;
    resultPath = `/private/tmp/ipo-one-agent-credit-exec-001/approvals/${stem}.result.json`;
    const signature = await MASTER.signTypedData(prepared.typedData);
    const result = await session.registerAgent({
      signingRequestHash: prepared.signingRequestHash,
      signature
    });
    assert.equal(exchangeCalls, 1);
    assert.deepEqual(Object.keys(exchangeBody), [
      "action",
      "nonce",
      "signature",
      "vaultAddress",
      "expiresAfter"
    ]);
    assert.equal(exchangeBody.action.nonce, exchangeBody.nonce);
    assert.equal(exchangeBody.vaultAddress, null);
    assert.equal(exchangeBody.expiresAfter, null);
    assert.equal(result.status, "REJECTED");
    assert.equal(result.venueErrorClass, "INVALID_AGENT_NAME");
    const persisted = JSON.parse(await readFile(resultPath, "utf8"));
    assert.deepEqual(Object.keys(persisted).sort(), [
      "actionHash",
      "httpStatus",
      "nonce",
      "observedAt",
      "requestHash",
      "venueErrorClass",
      "venueErrorHash"
    ]);
    assert.equal(persisted.httpStatus, 200);
    assert.equal(persisted.venueErrorClass, "INVALID_AGENT_NAME");
    assert.equal(JSON.stringify(persisted).includes("Agent name is invalid"), false);
  } finally {
    if (consumedPath) await unlink(consumedPath).catch(() => {});
    if (resultPath) await unlink(resultPath).catch(() => {});
    await destroyHypercoreIsolatedTestnetSigner(keyPath).catch(() => {});
  }
});

test("registration rejection classifier is closed and deterministic", () => {
  assert.equal(
    classifyHyperliquidRegistrationError({ status: "err", response: "invalid signature" }),
    "INVALID_SIGNATURE"
  );
  assert.equal(
    classifyHyperliquidRegistrationError({ status: "err", response: "nonce too low" }),
    "INVALID_NONCE"
  );
  assert.equal(
    classifyHyperliquidRegistrationError({ status: "err", response: "unclassified venue failure" }),
    "UNKNOWN_VENUE_REJECTION"
  );
});

test("002D handoff rejects an unqualified or non-master account", async () => {
  const session = createHypercore002dHandoffSession({
    signerKeyPath: "/private/tmp/ipo-one-hypercore-002d/not-used.key",
    fetchImpl: fetchFixture({ accountValue: "0", withdrawable: "0" }),
    clock: () => new Date(NOW)
  });
  const account = await session.inspectMaster({
    masterAccountAddress: MASTER.address
  });
  assert.equal(account.qualified, false);
  assert.deepEqual(account.blockers, [
    "testnet_account_value_below_10_usdc",
    "testnet_withdrawable_below_10_usdc"
  ]);
  await assert.rejects(
    session.prepareRegistration(),
    (error) => error.code === "hypercore_002d_qualified_account_required"
  );
});

test("002D handoff resumes only the exact previously approved registration request", async () => {
  const variable = "IPO_ONE_APPROVE_HYPERCORE_TESTNET_SIGNER";
  const previous = process.env[variable];
  process.env[variable] = HYPERCORE_TESTNET_SIGNER_PROVISIONING_APPROVAL;
  const keyPath =
    `/private/tmp/ipo-one-hypercore-002d/resume-${process.pid}-${Date.now()}.key`;
  try {
    await provisionHypercoreIsolatedTestnetSigner({ keyPath });
    const baseline = createHypercore002dHandoffSession({
      signerKeyPath: keyPath,
      fetchImpl: fetchFixture(),
      clock: () => new Date(NOW)
    });
    await baseline.inspectMaster({ masterAccountAddress: MASTER.address });
    const expected = await baseline.prepareRegistration();

    const resumed = createHypercore002dHandoffSession({
      signerKeyPath: keyPath,
      fetchImpl: fetchFixture(),
      clock: () => new Date(NOW.getTime() + 60_000),
      registrationResume: {
        nonce: NOW.getTime(),
        signingRequestHash: expected.signingRequestHash
      }
    });
    await resumed.inspectMaster({ masterAccountAddress: MASTER.address });
    const actual = await resumed.prepareRegistration();
    assert.equal(actual.signingRequestHash, expected.signingRequestHash);
    assert.equal(actual.digestHash, expected.digestHash);
    assert.equal(actual.actionHash, expected.actionHash);

    const drifted = createHypercore002dHandoffSession({
      signerKeyPath: keyPath,
      fetchImpl: fetchFixture(),
      clock: () => new Date(NOW),
      registrationResume: {
        nonce: NOW.getTime(),
        signingRequestHash: `0x${"00".repeat(32)}`
      }
    });
    await drifted.inspectMaster({ masterAccountAddress: MASTER.address });
    await assert.rejects(
      drifted.prepareRegistration(),
      (error) => error.code === "hypercore_002d_registration_resume_mismatch"
    );
  } finally {
    await destroyHypercoreIsolatedTestnetSigner(keyPath).catch(() => {});
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
});

test("002D handoff browser polling reads the nested operational state", async () => {
  const source = await readFile(
    new URL("../start-hypercore-002d-handoff.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /response\.state\.registrationAuthorized/);
  assert.match(source, /text\(response, "text\/javascript; charset=utf-8", SERVED_SCRIPT\)/);
});

test("002D handoff fails closed before wallet signing on chain or account drift", async () => {
  const source = await readFile(
    new URL("../start-hypercore-002d-handoff.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /EXPECTED_SIGNING_CHAIN=421614n/);
  assert.match(source, /EXPECTED_SIGNING_CHAIN_HEX="0x66eee"/);
  assert.match(source, /method:"eth_chainId"/);
  assert.match(source, /method:"wallet_switchEthereumChain"/);
  assert.match(source, /numericChainId!==EXPECTED_SIGNING_CHAIN/);
  assert.match(source, /method:"eth_accounts"/);
  assert.match(source, /current!==account\?\.toLowerCase\(\)/);
  assert.ok(
    source.indexOf('method:"wallet_switchEthereumChain"') <
      source.indexOf('method:"eth_signTypedData_v4"')
  );
  assert.ok(
    source.indexOf("await requireSigningContext(p)") <
      source.indexOf('method:"eth_signTypedData_v4"')
  );
});
