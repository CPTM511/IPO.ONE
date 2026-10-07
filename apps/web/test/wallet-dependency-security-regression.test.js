import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import test from "node:test";

// Follow the installed wallet chain, rather than loading an unrelated root axios.
let requireFromWallet = createRequire(new URL("../../../package.json", import.meta.url));
let sdkEntry;
for (const name of [
  "@walletconnect/ethereum-provider", "@reown/appkit", "@reown/appkit-pay",
  "@reown/appkit-utils", "@base-org/account", "@coinbase/cdp-sdk"
]) {
  sdkEntry = requireFromWallet.resolve(name);
  requireFromWallet = createRequire(sdkEntry);
}
const axios = requireFromWallet("axios");
const cdp = requireFromWallet("./openapi-client/cdpApiClient.js");
const authHeaders = requireFromWallet("./auth/utils/http.js");

function response(config, data = { ok: true }) {
  return { config, data, status: 200, statusText: "OK", headers: {} };
}

function offlineCdp(t, adapter) {
  // No API keys, wallet secrets, signing or real service requests are used.
  // Mock only the credential-dependent header supplier; keep the SDK's actual
  // interceptors, bigint transform, retry integration and error translation.
  t.mock.method(authHeaders, "getAuthHeaders", async options => {
    assert.equal(options.apiKeyId, undefined);
    assert.equal(options.apiKeySecret, undefined);
    return { "Content-Type": "application/json" };
  });
  cdp.configure({ basePath: "https://cdp.invalid/platform" });
  const instance = cdp.getAxiosInstance();
  instance.defaults.adapter = async config => {
    assert.match(config.url, /^\/offline-/);
    assert.equal(config.baseURL, "https://cdp.invalid/platform");
    return adapter(config);
  };
  return instance;
}

function inherited(t, key, value) {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
  Object.defineProperty(Object.prototype, key, { configurable: true, writable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(Object.prototype, key, previous);
    else delete Object.prototype[key];
  });
}

function transportFixture(onOptions) {
  return {
    request(options, callback) {
      onOptions(options);
      const request = new EventEmitter();
      request.destroyed = false;
      request.destroy = () => { request.destroyed = true; };
      request.setTimeout = () => request;
      request.write = () => true;
      request.end = () => {
        const incoming = Readable.from([Buffer.from('{"ok":true}')]);
        incoming.headers = { "content-type": "application/json" };
        incoming.statusCode = 200;
        incoming.statusMessage = "OK";
        incoming.req = request;
        callback(incoming);
      };
      return request;
    }
  };
}

test("wallet's CDP 1.54.0 and axios-retry resolve the approved axios override", async () => {
  const metadata = JSON.parse(await readFile(new URL("../package.json", pathToFileURL(sdkEntry)), "utf8"));
  assert.equal(metadata.version, "1.54.0");
  assert.equal(axios.VERSION, "1.20.0");
  const retryRequire = createRequire(requireFromWallet.resolve("axios-retry"));
  assert.equal(retryRequire.resolve("axios"), requireFromWallet.resolve("axios"));
  assert.equal(typeof requireFromWallet("axios-retry").default, "function");
});

test("real CDP interceptors preserve JSON/bigint, own headers, params and idempotency", async t => {
  let observed;
  offlineCdp(t, async config => { observed = config; return response(config, { accepted: true }); });
  const result = await cdp.cdpApiClient({
    method: "POST", url: "/offline-review", data: { quantity: 12n, nested: { sequence: 2n } },
    params: { limit: 2 }, headers: { "X-Review": "fixture" }
  }, "fixture-idempotency");
  assert.deepEqual(result, { accepted: true });
  assert.deepEqual(JSON.parse(observed.data), { quantity: "12", nested: { sequence: "2" } });
  assert.deepEqual(observed.params, { limit: 2 });
  assert.equal(observed.headers.get("X-Review"), "fixture");
  assert.equal(observed.headers.get("X-Idempotency-Key"), "fixture-idempotency");
  assert.equal(observed.headers.has("Authorization"), false);
});

test("real CDP axios-retry still retries a safe read without changing request identity", async t => {
  const calls = [];
  offlineCdp(t, async config => {
    calls.push({ method: config.method, url: config.url, key: config.headers.get("X-Idempotency-Key") });
    if (calls.length === 1) throw new axios.AxiosError("fixture reset", "ECONNRESET", config);
    return response(config, { recovered: true });
  });
  assert.deepEqual(await cdp.cdpApiClient({
    method: "GET", url: "/offline-retry", "axios-retry": { retries: 1, retryDelay: () => 0 }
  }, "fixture-retry"), { recovered: true });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
});

test("real CDP timeout, DNS and API error shapes survive the axios override", async t => {
  for (const [code, expected] of [["ECONNABORTED", "network_timeout"], ["ENOTFOUND", "network_dns_failure"]]) {
    offlineCdp(t, async config => { throw new axios.AxiosError("fixture failure", code, config); });
    await assert.rejects(cdp.cdpApiClient({ method: "GET", url: "/offline-error", "axios-retry": { retries: 0 } }),
      error => error.name === "NetworkError" && error.errorType === expected && error.networkDetails.code === code);
  }
  offlineCdp(t, async config => {
    throw new axios.AxiosError("fixture rejection", "ERR_BAD_REQUEST", config, undefined, {
      ...response(config), status: 400,
      data: { errorType: "invalid_request", errorMessage: "Fixture rejected", correlationId: "fixture-correlation" }
    });
  });
  await assert.rejects(cdp.cdpApiClient({ method: "POST", url: "/offline-error", "axios-retry": { retries: 0 } }),
    error => error.name === "APIError" && error.statusCode === 400 && error.errorType === "invalid_request" &&
      error.correlationId === "fixture-correlation");
});

test("aborted CDP work never reaches its adapter or retries", async t => {
  let calls = 0;
  offlineCdp(t, async config => { calls++; return response(config); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(cdp.cdpApiClient({ method: "GET", url: "/offline-cancel", signal: controller.signal }),
    error => error.name === "NetworkError" && error.networkDetails.code === "ERR_CANCELED");
  assert.equal(calls, 0);
});

test("GHSA-9fr6-4gfg-395g ignores inherited default request methods", async t => {
  inherited(t, "method", "post");
  let method;
  await axios.request({ url: "https://review.invalid/", adapter: async config => {
    method = config.method;
    return response(config);
  } });
  assert.equal(method, "get");
});

test("GHSA-j8rh-479h-cp32 ignores inherited headers after a minimal interceptor", async t => {
  inherited(t, "headers", { "X-Inherited": "must-not-send" });
  const instance = axios.create();
  instance.interceptors.request.use(config => ({ url: config.url, method: config.method, adapter: config.adapter }));
  let observed;
  await instance.get("https://review.invalid/", { adapter: async config => {
    observed = config.headers;
    return response(config);
  } });
  assert.equal(observed.has("X-Inherited"), false);
});

test("GHSA-x97p-jq2g-jp4f ignores inherited form serializer options", t => {
  inherited(t, "dots", true);
  const form = axios.toFormData({ nested: { field: "fixture" } }, new FormData(), {});
  assert.deepEqual([...form.entries()], [["nested[field]", "fixture"]]);
  const explicit = axios.toFormData({ nested: { field: "fixture" } }, new FormData(), { dots: true });
  assert.deepEqual([...explicit.entries()], [["nested.field", "fixture"]]);
});

test("GHSA-r4gj-5m52-g5wh enforces no redirects through a controlled fetch transport", async () => {
  const calls = [];
  const result = await axios.get("https://review.invalid/", {
    adapter: "fetch", maxRedirects: 0, validateStatus: () => true,
    env: { fetch: async request => {
      calls.push(request);
      return new Response("fixture redirect", { status: 302, headers: { Location: "https://other.invalid/" } });
    } }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].redirect, "manual");
  assert.equal(result.status, 302);
});

test("GHSA-vh66-26gq-q6x8 fetch request options cannot come from Object.prototype", async t => {
  inherited(t, "fetchOptions", { method: "POST", headers: { "X-Inherited": "must-not-send" } });
  let observed;
  await axios.get("https://review.invalid/", { adapter: "fetch", env: { fetch: async request => {
    observed = request;
    return new Response("ok");
  } } });
  assert.equal(observed.method, "GET");
  assert.equal(observed.headers.has("X-Inherited"), false);
});

test("GHSA-4hqw-qxg8-jxx2 ignores inherited FormData getHeaders", async t => {
  inherited(t, "getHeaders", () => ({ "X-Inherited": "must-not-send" }));
  const form = new FormData();
  form.append("review", "fixture");
  let observed;
  await axios.post("https://review.invalid/", form, {
    adapter: "fetch", headers: { "Content-Type": false }, env: { fetch: async request => {
    observed = request;
    return new Response("ok");
  } } });
  assert.equal(observed.headers.has("X-Inherited"), false);
  assert.match(observed.headers.get("Content-Type"), /^multipart\/form-data; boundary=/);
});

test("GHSA-m8m8-qj5v-23w3 HTTP adapter shadows inherited socket factories", async t => {
  let inheritedCalls = 0;
  inherited(t, "createConnection", () => { inheritedCalls++; throw new Error("unexpected socket factory"); });
  let observed;
  assert.deepEqual((await axios.get("https://review.invalid/", {
    adapter: "http", proxy: false,
    transport: transportFixture(options => { observed = options; })
  })).data, { ok: true });
  assert.equal(Object.hasOwn(observed, "createConnection"), true);
  assert.equal(observed.createConnection, undefined);
  assert.equal(inheritedCalls, 0);
});

test("patched HTTP adapter keeps data-URI decoding bounded and invalid options structured", async () => {
  const result = await axios.get("data:text/plain;base64,Zml4dHVyZQ==", { adapter: "http", responseType: "text" });
  assert.equal(result.data, "fixture");
  await assert.rejects(axios.get("data:text/plain;base64,Zml4dHVyZQ==", {
    adapter: "http", maxContentLength: 3
  }), error => axios.isAxiosError(error) && error.code === "ERR_BAD_RESPONSE");
  for (const httpVersion of ["not-a-version", 3]) {
    await assert.rejects(axios.get("https://review.invalid/", {
      adapter: "http", proxy: false, httpVersion,
      transport: { request() { assert.fail("invalid options must fail before transport"); } }
    }), error => axios.isAxiosError(error) && error.code === "ERR_BAD_OPTION_VALUE");
  }
});
