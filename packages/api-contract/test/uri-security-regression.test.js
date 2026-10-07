import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isTenantProtocolRequest,
  isTenantProtocolResult
} from "../src/tenant-protocol.js";

const require = createRequire(import.meta.url);
const requireFromAjv = createRequire(require.resolve("ajv"));
const uri = requireFromAjv("fast-uri");
const Ajv2020 = require("ajv/dist/2020").default;

test("API-contract AJV resolves the reviewed fast-uri patch", () => {
  assert.equal(require("ajv/package.json").version, "8.20.0");
  assert.equal(requireFromAjv("fast-uri/package.json").version, "3.1.8");
});

test("GHSA-qw65-cvwx-89v3 rejects invalid ports across URI composition paths", () => {
  for (const port of ["@other.example:80", "80/path", "80x"]) {
    const components = { scheme: "https", host: "policy.example", port, path: "/review" };
    for (const compose of [
      value => uri.serialize(value),
      value => uri.normalize(value)
    ]) assert.throws(() => compose({ ...components }), /port is malformed/i);
    assert.equal(uri.equal({ ...components }, { ...components }), false);
  }
  assert.equal(uri.serialize({ scheme: "https", host: "policy.example", port: "8443", path: "/review" }),
    "https://policy.example:8443/review");
});

test("GHSA-58mr-gqgx-xq4g marks misplaced authority brackets as malformed", () => {
  for (const value of ["https://[broken.example/review", "https://broken].example/review"]) {
    assert.match(uri.parse(value).error, /host is malformed/i);
  }
  const valid = uri.parse("https://[2001:db8::1]:8443/review");
  assert.equal(valid.error, undefined);
  assert.equal(valid.host, "2001:db8::1");
  assert.equal(uri.parse(uri.serialize(valid)).host, valid.host);
});

test("GHSA-hrr3-gc8f-f4qj normalizes percent-encoded host case consistently", () => {
  for (const value of ["//%41.example/review", "//A.example/review", "//a.example/review"]) {
    assert.equal(uri.parse(value).host, "a.example");
    assert.equal(uri.normalize(value), "//a.example/review");
    assert.equal(uri.equal(value, "//a.example/review"), true);
  }
  assert.equal(uri.resolve("https://a.example/schema/root.json", "../defs.json#/$defs/id"),
    "https://a.example/defs.json#/$defs/id");
});

test("patched URI resolution preserves AJV relative refs, fragments and closed-schema validation", () => {
  const ajv = new Ajv2020({ strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false });
  ajv.addSchema({
    $id: "https://schemas.ipo.one/dependency-regression/defs.json",
    $defs: { reference: { type: "string", pattern: "^request_[a-z]+$" } }
  });
  const validate = ajv.compile({
    $id: "https://schemas.ipo.one/dependency-regression/root.json",
    type: "object",
    required: ["requestId"],
    properties: { requestId: { $ref: "defs.json#/$defs/reference" } },
    additionalProperties: false
  });
  const valid = { requestId: "request_review" };
  assert.equal(validate(valid), true);
  assert.deepEqual(valid, { requestId: "request_review" });
  for (const value of [{}, { requestId: 123 }, { requestId: "other" }, { ...valid, unrestricted: true }]) {
    const before = structuredClone(value);
    assert.equal(validate(value), false);
    assert.deepEqual(value, before);
  }
});

test("actual Tenant and wallet conformance branches remain closed with patched AJV resolver", async () => {
  for (const name of ["tenant-protocol.v1", "wallet-execution.v1", "secured-pool-workspace.v1"]) {
    const fixture = JSON.parse(await readFile(new URL(
      `../../../api/tenant-protocol/conformance/${name}.fixtures.json`, import.meta.url
    ), "utf8"));
    for (const value of fixture.validRequests) assert.equal(isTenantProtocolRequest(value), true, name);
    for (const value of fixture.invalidRequests) assert.equal(isTenantProtocolRequest(value), false, name);
    for (const value of fixture.validResults) assert.equal(isTenantProtocolResult(value), true, name);
    for (const value of fixture.invalidResults) assert.equal(isTenantProtocolResult(value), false, name);
  }
});
