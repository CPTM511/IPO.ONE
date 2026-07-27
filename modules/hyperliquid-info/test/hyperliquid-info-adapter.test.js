import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  HYPERLIQUID_TESTNET_INFO_PROFILE,
  HyperliquidBindingProofVerifier,
  HyperliquidTestnetInfoAdapter,
  normalizeHyperliquidAddress
} from "../src/index.js";

const requireFromApiContract = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const schema = JSON.parse(await readFile(
  new URL(
    "../../../schemas/v2/hyperliquid-info-account-snapshot.schema.json",
    import.meta.url
  ),
  "utf8"
));
const fixture = JSON.parse(await readFile(
  new URL("./fixtures/official-info-responses.v1.json", import.meta.url),
  "utf8"
));
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

const CLOCK = 1735969715000;
const REQUEST = Object.freeze({
  accountAddress: fixture.accountAddress,
  accountRole: fixture.accountRole,
  fillWindowStartMs: fixture.fillWindowStartMs,
  fillWindowEndMs: fixture.fillWindowEndMs
});

function json(value, {
  status = 200,
  contentType = "application/json",
  contentLength
} = {}) {
  const body = JSON.stringify(value);
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      ...(contentLength === undefined
        ? { "content-length": String(Buffer.byteLength(body)) }
        : { "content-length": String(contentLength) })
    }
  });
}

function recordedFetch({
  responses = fixture.responses,
  calls = [],
  responseFor
} = {}) {
  return async (url, options) => {
    assert.equal(url, "https://api.hyperliquid-testnet.xyz/info");
    assert.equal(options.method, "POST");
    assert.deepEqual(options.headers, {
      accept: "application/json",
      "content-type": "application/json"
    });
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.signal instanceof AbortSignal, true);
    assert.equal(Object.hasOwn(options.headers, "authorization"), false);
    const body = JSON.parse(options.body);
    calls.push(structuredClone(body));
    return responseFor?.(body) ?? json(responses[body.type]);
  };
}

test("TC-201 profile is a fixed signer-free Testnet Info boundary", () => {
  assert.deepEqual(HYPERLIQUID_TESTNET_INFO_PROFILE, {
    profileId: "hyperliquid_testnet_info.v1",
    environment: "testnet",
    origin: "https://api.hyperliquid-testnet.xyz",
    path: "/info",
    endpoint: "https://api.hyperliquid-testnet.xyz/info",
    method: "POST",
    staleAfterMs: 15000,
    maximumFillWindowMs: 86400000,
    maximumResponseBytes: 1048576,
    maximumPositions: 200,
    maximumOpenOrders: 200,
    maximumFills: 500,
    maximumSubaccounts: 100,
    signerAvailable: false,
    exchangeEndpointAvailable: false,
    credentialsRequired: false,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion: "hyperliquid_info_profile.v1"
  });
  for (const forbidden of [
    { origin: "https://api.hyperliquid.xyz" },
    { endpoint: "https://api.hyperliquid-testnet.xyz/exchange" },
    { proxyUrl: "http://127.0.0.1:8080" },
    { credential: "secret" },
    { apiWalletPrivateKey: "not-a-key" }
  ]) {
    assert.throws(
      () => new HyperliquidTestnetInfoAdapter(forbidden),
      (error) => error.code === "invalid_hyperliquid_info_client"
    );
  }
  const adapter = new HyperliquidTestnetInfoAdapter({
    fetchImpl: recordedFetch(),
    clock: () => CLOCK
  });
  assert.equal("exchange" in adapter, false);
  assert.equal("sign" in adapter, false);
  assert.equal("request" in adapter, false);
});

test("TC-201 normalizes official fixtures into one closed provenance snapshot", async () => {
  const calls = [];
  const adapter = new HyperliquidTestnetInfoAdapter({
    fetchImpl: recordedFetch({ calls }),
    clock: () => CLOCK
  });
  const result = await adapter.readAccountSnapshot(REQUEST);
  assert.equal(result.cache.hit, false);
  assert.equal(result.cache.ageMs, 0);
  assert.equal(validate(result.snapshot), true, JSON.stringify(validate.errors));
  assert.deepEqual(
    calls.map(({ type }) => type).sort(),
    [
      "clearinghouseState",
      "frontendOpenOrders",
      "subAccounts",
      "userFillsByTime",
      "userRole"
    ]
  );
  for (const request of calls) {
    assert.equal(request.user, fixture.accountAddress);
    const expectedKeys =
      request.type === "userFillsByTime"
        ? ["aggregateByTime", "endTime", "startTime", "type", "user"]
        : ["type", "user"];
    assert.deepEqual(Object.keys(request).sort(), expectedKeys);
  }
  const fillsRequest = calls.find(({ type }) => type === "userFillsByTime");
  assert.deepEqual(fillsRequest, {
    type: "userFillsByTime",
    user: fixture.accountAddress,
    startTime: fixture.fillWindowStartMs,
    endTime: fixture.fillWindowEndMs,
    aggregateByTime: true
  });
  assert.equal(result.snapshot.accountRole, "master");
  assert.equal(result.snapshot.accountRoleVerified, true);
  assert.equal(
    result.snapshot.verifiedMasterAddressHash,
    result.snapshot.accountAddressHash
  );
  assert.equal(result.snapshot.actualAccountAddressQueried, true);
  assert.equal(result.snapshot.apiWalletAddressAccepted, false);
  assert.equal(result.snapshot.freshness, "stale");
  assert.equal(result.snapshot.positions.length, 1);
  assert.equal(result.snapshot.openOrders.length, 1);
  assert.equal(result.snapshot.fills.length, 1);
  assert.equal(result.snapshot.subaccounts.length, 1);
  assert.equal(result.snapshot.openOrders[0].reduceOnly, true);
  assert.equal(result.snapshot.externalSystemQueried, true);
  assert.equal(result.snapshot.externalOrderSubmitted, false);
  assert.equal(result.snapshot.exchangeEndpointAvailable, false);
  assert.equal(result.snapshot.signerAvailable, false);
  assert.equal(result.snapshot.productionAuthority, false);
  assert.equal(result.snapshot.fundsAuthority, false);
  assert.equal(
    JSON.stringify(result.snapshot).includes(fixture.accountAddress),
    false
  );
  assert.equal(Object.isFrozen(result.snapshot), true);

  const cached = await adapter.readAccountSnapshot(REQUEST);
  assert.equal(cached.cache.hit, true);
  assert.equal(calls.length, 5);
  assert.strictEqual(cached.snapshot, result.snapshot);
});

test("TC-201 subaccount reads never issue master-only discovery", async () => {
  const calls = [];
  const responses = {
    ...fixture.responses,
    userRole: {
      role: "subAccount",
      data: {
        master: fixture.accountAddress
      }
    },
    frontendOpenOrders: [],
    userFillsByTime: []
  };
  const adapter = new HyperliquidTestnetInfoAdapter({
    fetchImpl: recordedFetch({ responses, calls }),
    clock: () => CLOCK
  });
  const result = await adapter.readAccountSnapshot({
    ...REQUEST,
    accountAddress: "0x035605fc2f24d65300227189025e90a0d947f16c",
    accountRole: "subaccount"
  });
  assert.deepEqual(
    calls.map(({ type }) => type).sort(),
    [
      "clearinghouseState",
      "frontendOpenOrders",
      "userFillsByTime",
      "userRole"
    ]
  );
  assert.equal(result.snapshot.sourceResponseHashes.subAccounts, null);
  assert.notEqual(
    result.snapshot.verifiedMasterAddressHash,
    result.snapshot.accountAddressHash
  );
  assert.deepEqual(result.snapshot.subaccounts, []);
  assert.equal(validate(result.snapshot), true, JSON.stringify(validate.errors));
});

test("TC-201 rejects open requests, API-wallet roles, raw query types, and unbounded windows", async () => {
  const adapter = new HyperliquidTestnetInfoAdapter({
    fetchImpl: recordedFetch(),
    clock: () => CLOCK
  });
  for (const request of [
    { ...REQUEST, type: "exchange" },
    { ...REQUEST, accountRole: "api_wallet" },
    { ...REQUEST, accountAddress: "https://attacker.example" },
    {
      ...REQUEST,
      accountAddress: "0x0000000000000000000000000000000000000000"
    },
    {
      ...REQUEST,
      fillWindowStartMs: REQUEST.fillWindowEndMs - 86400001
    },
    {
      ...REQUEST,
      fillWindowEndMs: CLOCK + 5001
    }
  ]) {
    await assert.rejects(
      () => adapter.readAccountSnapshot(request),
      (error) => error.code === "invalid_hyperliquid_info_request"
    );
  }
});

test("TC-201 verifies the actual account role before any account-data query", async () => {
  for (const role of ["agent", "vault", "missing"]) {
    const calls = [];
    const adapter = new HyperliquidTestnetInfoAdapter({
      fetchImpl: recordedFetch({
        calls,
        responses: {
          ...fixture.responses,
          userRole:
            role === "agent"
              ? { role, data: { user: fixture.accountAddress } }
              : { role }
        }
      }),
      clock: () => CLOCK,
      maxAttempts: 1
    });
    await assert.rejects(
      () => adapter.readAccountSnapshot(REQUEST),
      (error) => error.code === "hyperliquid_info_account_role_denied"
    );
    assert.deepEqual(calls, [
      {
        type: "userRole",
        user: fixture.accountAddress
      }
    ]);
  }
});

test("TC-201 fails closed on partial, malformed, oversized, and wrong-type responses", async () => {
  const cases = [
    {
      responseFor(body) {
        if (body.type !== "clearinghouseState") {
          return json(fixture.responses[body.type]);
        }
        const partial = structuredClone(fixture.responses.clearinghouseState);
        delete partial.marginSummary;
        return json(partial);
      },
      code: "hyperliquid_info_partial_response"
    },
    {
      responseFor(body) {
        if (body.type !== "clearinghouseState") {
          return json(fixture.responses[body.type]);
        }
        return new Response("{not-json", {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      },
      code: "invalid_hyperliquid_info_response"
    },
    {
      responseFor(body) {
        if (body.type !== "clearinghouseState") {
          return json(fixture.responses[body.type]);
        }
        return new Response('{"assetPositions":[],"assetPositions":[]}', {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      },
      code: "invalid_hyperliquid_info_response"
    },
    {
      responseFor(body) {
        return json(fixture.responses[body.type], {
          contentLength: 1048577
        });
      },
      code: "hyperliquid_info_response_too_large"
    },
    {
      responseFor(body) {
        return json(fixture.responses[body.type], {
          contentType: "text/html"
        });
      },
      code: "invalid_hyperliquid_info_response"
    },
    {
      responseFor(body) {
        if (body.type !== "frontendOpenOrders") {
          return json(fixture.responses[body.type]);
        }
        return json(Array.from({ length: 201 }, () =>
          fixture.responses.frontendOpenOrders[0]
        ));
      },
      code: "hyperliquid_info_partial_response"
    }
  ];
  for (const item of cases) {
    const adapter = new HyperliquidTestnetInfoAdapter({
      fetchImpl: recordedFetch({ responseFor: item.responseFor }),
      clock: () => CLOCK,
      maxAttempts: 1
    });
    await assert.rejects(
      () => adapter.readAccountSnapshot(REQUEST),
      (error) => error.code === item.code
    );
  }
});

test("TC-201 bounds retry, timeout, rate limit, request budget, and circuit state", async () => {
  let calls = 0;
  const retrying = new HyperliquidTestnetInfoAdapter({
    fetchImpl: async (url, options) => {
      calls += 1;
      if (calls === 1) return new Response("busy", { status: 429 });
      const body = JSON.parse(options.body);
      return json(fixture.responses[body.type]);
    },
    clock: () => CLOCK,
    maxAttempts: 2
  });
  const recovered = await retrying.readAccountSnapshot(REQUEST);
  assert.equal(validate(recovered.snapshot), true, JSON.stringify(validate.errors));
  assert.equal(calls, 6);

  let timeoutCalls = 0;
  const timedOut = new HyperliquidTestnetInfoAdapter({
    fetchImpl: async () => {
      timeoutCalls += 1;
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    },
    clock: () => CLOCK,
    maxAttempts: 2,
    failureThreshold: 1
  });
  await assert.rejects(
    () => timedOut.readAccountSnapshot(REQUEST),
    (error) => error.code === "hyperliquid_info_timeout"
  );
  assert.equal(timeoutCalls, 2);
  assert.equal(timedOut.circuitState, "open");
  await assert.rejects(
    () => timedOut.readAccountSnapshot(REQUEST),
    (error) => error.code === "hyperliquid_info_circuit_open"
  );
  assert.equal(timeoutCalls, 2);

  const budgeted = new HyperliquidTestnetInfoAdapter({
    fetchImpl: recordedFetch(),
    clock: () => CLOCK,
    maximumCallsPerMinute: 5
  });
  await budgeted.readAccountSnapshot(REQUEST);
  await assert.rejects(
    () => budgeted.readAccountSnapshot({
      ...REQUEST,
      fillWindowStartMs: REQUEST.fillWindowStartMs + 1
    }),
    (error) => error.code === "hyperliquid_info_budget_exhausted"
  );
});

test("TC-202 verifies one-use EIP-712 master ownership without returning the signature", async () => {
  const account = privateKeyToAccount(
    "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  );
  const verifier = new HyperliquidBindingProofVerifier();
  const master = normalizeHyperliquidAddress(account.address);
  const subaccount = normalizeHyperliquidAddress(
    "0x2222222222222222222222222222222222222222"
  );
  const challengeInput = {
    tenantHash: `0x${"1".repeat(64)}`,
    subjectHash: `0x${"2".repeat(64)}`,
    principalHash: `0x${"3".repeat(64)}`,
    masterAddressHash: master.addressHash,
    subaccountAddressHash: subaccount.addressHash,
    nonceHash: `0x${"4".repeat(64)}`,
    challengeId: "tc202_binding_proof_001",
    environment: "hyperliquid_testnet",
    infoProfileId: "hyperliquid_testnet_info.v1",
    bindingEpoch: 1,
    issuedAt: "2026-07-25T00:00:00.000Z",
    expiresAt: "2026-07-25T00:05:00.000Z"
  };
  const prepared = verifier.createTypedData(challengeInput);
  const signature = await account.signTypedData(prepared.typedData);
  const proof = await verifier.verify({
    masterAccountAddress: account.address,
    signature,
    challenge: {
      ...challengeInput,
      typedDataHash: prepared.typedDataHash,
      chainId: "eip155:998",
      status: "pending",
      oneUse: true,
      bindingMethod: "eip712_eoa_master_v1"
    },
    now: new Date("2026-07-25T00:01:00.000Z")
  });

  assert.equal(proof.masterAddressHash, master.addressHash);
  assert.equal(proof.typedDataHash, prepared.typedDataHash);
  assert.equal(proof.rawSignaturePersisted, false);
  assert.equal(proof.reusableSignature, false);
  assert.equal(Object.hasOwn(proof, "signature"), false);
  await assert.rejects(
    verifier.verify({
      masterAccountAddress: account.address,
      signature,
      challenge: {
        ...challengeInput,
        typedDataHash: prepared.typedDataHash,
        chainId: "eip155:998",
        status: "pending",
        oneUse: true,
        bindingMethod: "eip712_eoa_master_v1"
      },
      now: new Date("2026-07-25T00:06:00.000Z")
    }),
    { code: "hyperliquid_binding_proof_denied" }
  );
});

test("TC-202 independently verifies master/subaccount relationship with actual addresses", async () => {
  const masterAddress = fixture.accountAddress;
  const subaccountAddress = fixture.responses.subAccounts[0].subAccountUser;
  const calls = [];
  const adapter = new HyperliquidTestnetInfoAdapter({
    clock: () => CLOCK,
    fetchImpl: recordedFetch({
      calls,
      responseFor(body) {
        if (body.type === "userRole" && body.user === masterAddress) {
          return json({ role: "user" });
        }
        if (body.type === "userRole" && body.user === subaccountAddress) {
          return json({
            role: "subAccount",
            data: { master: masterAddress }
          });
        }
        if (body.type === "subAccounts") {
          return json(fixture.responses.subAccounts);
        }
        assert.fail(`unexpected query ${body.type}`);
      }
    })
  });
  const relationship = await adapter.verifyMasterSubaccountBinding({
    masterAccountAddress: masterAddress,
    subaccountAddress
  });

  assert.equal(relationship.relationshipVerified, true);
  assert.equal(relationship.masterRole, "user");
  assert.equal(relationship.subaccountRole, "subAccount");
  assert.equal(relationship.actualAccountAddressesQueried, true);
  assert.equal(relationship.apiWalletAddressAccepted, false);
  assert.equal(relationship.signerAvailable, false);
  assert.deepEqual(
    calls.map(({ type }) => type).sort(),
    ["subAccounts", "userRole", "userRole"].sort()
  );
});

test("TC-202 paginates inclusive fill history, deduplicates overlap, and exposes retention gaps", async () => {
  const masterAddress = fixture.accountAddress;
  const subaccountAddress = fixture.responses.subAccounts[0].subAccountUser;
  const startTimeMs = CLOCK - 10_000;
  const endTimeMs = CLOCK - 1;
  const baseFill = fixture.responses.userFillsByTime[0];
  const firstPage = Array.from({ length: 2_000 }, (_, index) => ({
    ...baseFill,
    oid: index + 1,
    tid: index + 1,
    hash: `0x${(index + 1).toString(16).padStart(64, "0")}`,
    time: startTimeMs + index
  }));
  const secondPage = [
    firstPage.at(-1),
    {
      ...baseFill,
      oid: 2_001,
      tid: 2_001,
      hash: `0x${(2_001).toString(16).padStart(64, "0")}`,
      time: startTimeMs + 2_000
    }
  ];
  let fillPage = 0;
  const calls = [];
  const adapter = new HyperliquidTestnetInfoAdapter({
    clock: () => CLOCK,
    fetchImpl: recordedFetch({
      calls,
      responseFor(body) {
        if (body.type === "userRole") {
          return json({
            role: "subAccount",
            data: { master: masterAddress }
          });
        }
        if (body.type === "userFillsByTime") {
          fillPage += 1;
          return json(fillPage === 1 ? firstPage : secondPage);
        }
        assert.fail(`unexpected query ${body.type}`);
      }
    })
  });
  const history = await adapter.readFillHistory({
    accountAddress: subaccountAddress,
    fillWindowStartMs: startTimeMs,
    fillWindowEndMs: endTimeMs
  });

  assert.equal(history.counts.pageCount, 2);
  assert.equal(history.counts.totalReturnedCount, 2_002);
  assert.equal(history.counts.uniqueEventCount, 2_001);
  assert.equal(history.counts.duplicateCount, 1);
  assert.equal(history.paginationComplete, true);
  assert.equal(history.dataGapCodes.includes(
    "venue_exposes_only_10000_most_recent_fills"
  ), true);
  assert.equal(history.events.length, history.eventHashes.length);
  assert.deepEqual(
    calls
      .filter(({ type }) => type === "userFillsByTime")
      .map(({ startTime }) => startTime),
    [startTimeMs, startTimeMs + 1_999]
  );
});
