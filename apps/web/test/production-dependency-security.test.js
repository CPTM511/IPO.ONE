import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";

const rootRequire = createRequire(new URL("../../../package.json", import.meta.url));
let appKitRequire = rootRequire;
for (const name of ["@walletconnect/ethereum-provider", "@reown/appkit"]) {
  appKitRequire = createRequire(appKitRequire.resolve(name));
}
const walletEntry = appKitRequire.resolve("@reown/appkit-wallet");
const walletRequire = createRequire(walletEntry);
const { W3mFrameSchema, W3mFrameConstants } = await import(pathToFileURL(walletEntry));
const { z } = walletRequire("zod");

const contractRequire = createRequire(
  new URL("../../../packages/api-contract/package.json", import.meta.url)
);
const ajvRequire = createRequire(contractRequire.resolve("ajv"));
const uri = ajvRequire("fast-uri");

let cdpRequire = appKitRequire;
for (const name of ["@reown/appkit-pay", "@reown/appkit-utils", "@base-org/account", "@coinbase/cdp-sdk"]) {
  cdpRequire = createRequire(cdpRequire.resolve(name));
}
const axiosRequire = createRequire(cdpRequire.resolve("axios"));
const followRedirects = axiosRequire("follow-redirects");
const viemRequire = createRequire(rootRequire.resolve("viem"));
const abi = await import(pathToFileURL(viemRequire.resolve("abitype/zod")));

test("installed wallet and protocol dependency chains resolve the reviewed fixes", () => {
  assert.equal(walletRequire("zod/package.json").version, "4.6.6");
  assert.equal(axiosRequire("follow-redirects/package.json").version, "1.16.2");
  assert.equal(ajvRequire("fast-uri/package.json").version, "3.1.9");
});

test("real AppKit event schemas preserve valid wallet messages and reject invalid payloads", () => {
  const switchNetwork = {
    type: W3mFrameConstants.APP_SWITCH_NETWORK,
    payload: { chainId: 97 }
  };
  assert.deepEqual(W3mFrameSchema.appEvent.parse(switchNetwork), switchNetwork);
  const theme = {
    type: W3mFrameConstants.APP_SYNC_THEME,
    payload: {
      themeMode: "dark",
      themeVariables: { "--w3m-color-mix-strength": 20 },
      w3mThemeVariables: { "--w3m-accent": "#fff" }
    }
  };
  assert.deepEqual(W3mFrameSchema.appEvent.parse(theme), theme);
  assert.equal(W3mFrameSchema.appEvent.safeParse({
    ...switchNetwork, payload: { chainId: null }
  }).success, false);
  assert.equal(W3mFrameSchema.appEvent.safeParse({
    type: "unrecognized-wallet-event", payload: {}
  }).success, false);
});

test("real ABI schemas retain typed-data and tuple validation after the Zod update", () => {
  const input = [{
    type: "function",
    name: "review",
    stateMutability: "view",
    inputs: [{ name: "subject", type: "tuple", components: [{ name: "owner", type: "address" }] }],
    outputs: [{ name: "amount", type: "uint256" }]
  }];
  assert.deepEqual(abi.Abi.parse(input), input);
  assert.equal(abi.Abi.safeParse([{ type: "function", inputs: "invalid" }]).success, false);
  const typedData = { Review: [{ name: "owner", type: "address" }] };
  assert.deepEqual(abi.TypedData.parse(typedData), typedData);
  assert.equal(abi.TypedData.safeParse({ Review: [{ name: "owner", type: "MissingType" }] }).success, false);
});

test("real Coinbase SDK record schemas preserve ESM and CJS validation", async () => {
  const schemas = [
    cdpRequire("./policies/evmSchema.js"),
    await import(new URL(
      "../_esm/policies/evmSchema.js",
      pathToFileURL(cdpRequire.resolve("@coinbase/cdp-sdk"))
    ))
  ];
  const input = {
    type: "evmTypedDataField",
    types: { types: { Review: [{ name: "owner", type: "address" }] }, primaryType: "Review" },
    conditions: [{
      operator: "in",
      addresses: ["0x0000000000000000000000000000000000000001"],
      path: "owner"
    }]
  };
  for (const { SignEvmTypedDataFieldCriterionSchema: schema } of schemas) {
    assert.deepEqual(schema.parse(input), input);
    const invalid = {
      ...input,
      types: { ...input.types, types: { Review: [{ name: 7, type: "address" }] } }
    };
    const result = schema.safeParse(invalid);
    assert.equal(result.success, false);
    assert.ok(result.error.issues.length > 0);
  }
});

test("oversized bounded Zod arrays reject before parsing elements", () => {
  let elementVisits = 0;
  const schema = z.array(z.any().transform(value => {
    elementVisits += 1;
    return value;
  })).max(2);
  assert.deepEqual(schema.parse(["one", "two"]), ["one", "two"]);
  elementVisits = 0;
  const result = schema.safeParse(Array(10_000).fill("fixture"));
  assert.equal(result.success, false);
  assert.equal(elementVisits, 0);
  assert.deepEqual(result.error.issues.map(issue => issue.code), ["too_big"]);
});

test("protocol URI normalization preserves encoded data and rejects scheme confusion", () => {
  assert.equal(uri.equal("%68ttp://example.test/", "http://example.test/"), false);
  assert.equal(
    uri.normalize("http://example.test/public/%2e%2e/admin"),
    "http://example.test/public/%2E%2E/admin"
  );
  assert.equal(uri.equal("http://trusted.test%2540evil.test/", "http://trusted.test%2540evil.test/", {}), false);
  assert.equal(uri.normalize("./a:b"), "./a:b");
});

test("redirected raw-array headers strip standard and cross-realm custom credentials", async t => {
  let sourceHeaders;
  let targetHeaders;
  const target = createServer((request, response) => {
    targetHeaders = request.headers;
    response.end("fixture");
  });
  target.listen(0, "127.0.0.1");
  await once(target, "listening");
  t.after(() => new Promise(resolve => target.close(resolve)));

  const source = createServer((request, response) => {
    sourceHeaders = request.headers;
    response.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/result` });
    response.end();
  });
  source.listen(0, "127.0.0.1");
  await once(source, "listening");
  t.after(() => new Promise(resolve => source.close(resolve)));

  await new Promise((resolve, reject) => {
    followRedirects.http.get(`http://127.0.0.1:${source.address().port}/start`, {
      headers: ["Authorization", "Bearer fixture", "Cookie", "fixture=1",
        "X-Fixture+", "fixture-secret", "X-Public", "retained"],
      sensitiveHeaders: runInNewContext('["X-Fixture+"]')
    }, response => {
      response.resume();
      response.once("end", resolve);
      response.once("error", reject);
    }).once("error", reject);
  });
  assert.equal(sourceHeaders.authorization, "Bearer fixture");
  assert.equal(sourceHeaders["x-fixture+"], "fixture-secret");
  assert.equal(targetHeaders.authorization, undefined);
  assert.equal(targetHeaders.cookie, undefined);
  assert.equal(targetHeaders["x-fixture+"], undefined);
  assert.equal(targetHeaders["x-public"], "retained");
});

