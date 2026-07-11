import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const port = 32_000 + (process.pid % 10_000);
const baseUrl = `http://127.0.0.1:${port}`;
const sessionA = "security_test_session_a";
const sessionB = "security_test_session_b";

function headers(session = sessionA, extra = {}) {
  return {
    "x-ipo-one-sandbox-session": session,
    ...extra
  };
}

async function post(path, body, { session = sessionA, extraHeaders = {} } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: headers(session, { "content-type": "application/json", ...extraHeaders }),
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

async function waitForServer(child, output) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`security test server exited early (${child.exitCode})\n${output()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // The child may still be binding its loopback socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`security test server did not become ready\n${output()}`);
}

function rawRequest(payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let response = "";
    socket.setEncoding("utf8");
    socket.setTimeout(3_000, () => socket.destroy(new Error("raw request timed out")));
    socket.on("connect", () => socket.end(payload));
    socket.on("data", (chunk) => { response += chunk; });
    socket.on("end", () => resolve(response));
    socket.on("error", reject);
  });
}

test("public sandbox rejects adversarial HTTP input and bounds mutable state", async (t) => {
  let output = "";
  const child = spawn(process.execPath, ["apps/api/src/server.js"], {
    cwd: rootDir,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 1_000))
      ]);
    }
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 1_000))
      ]);
    }
    child.stdout.destroy();
    child.stderr.destroy();
  });

  await waitForServer(child, () => output);

  await t.test("security headers and identifiers are closed and non-reflective", async () => {
    const response = await fetch(`${baseUrl}/v1/demo/state`, {
      headers: {
        host: "attacker.invalid",
        "x-request-id": "short",
        "x-ipo-one-sandbox-session": "short"
      }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.notEqual(response.headers.get("x-request-id"), "short");
    assert.notEqual(response.headers.get("x-ipo-one-sandbox-session"), "short");
    assert.doesNotMatch(response.headers.get("x-ipo-one-sandbox-session"), /attacker/);
  });

  await t.test("unsupported methods and media encodings fail closed", async () => {
    const optionsResponse = await fetch(`${baseUrl}/v1/demo/state`, { method: "OPTIONS" });
    assert.equal(optionsResponse.status, 405);
    assert.equal(optionsResponse.headers.get("allow"), "GET, POST");

    const wrongType = await fetch(`${baseUrl}/v1/agents`, {
      method: "POST",
      headers: headers(sessionA, { "content-type": "text/plain" }),
      body: "{}"
    });
    assert.equal(wrongType.status, 415);
    assert.equal((await wrongType.json()).code, "unsupported_media_type");

    const compressed = await post("/v1/agents", {}, {
      extraHeaders: { "content-encoding": "gzip" }
    });
    assert.equal(compressed.status, 415);
    assert.equal((await compressed.json()).code, "unsupported_content_encoding");

    const emptyReset = await fetch(`${baseUrl}/v1/demo/reset`, {
      method: "POST",
      headers: headers(sessionB)
    });
    assert.equal(emptyReset.status, 200);
  });

  await t.test("JSON parser rejects malformed, oversized, deep, and polluted input", async () => {
    const malformed = await post("/v1/agents", "{");
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).code, "invalid_json");

    const arrayRoot = await post("/v1/agents", []);
    assert.equal(arrayRoot.status, 400);
    assert.equal((await arrayRoot.json()).code, "invalid_json_body");

    const polluted = await post("/v1/agents", '{"__proto__":{"admin":true}}');
    assert.equal(polluted.status, 400);
    assert.equal((await polluted.json()).code, "invalid_json_body");

    let nested = "value";
    for (let depth = 0; depth < 10; depth += 1) nested = { nested };
    const deep = await post("/v1/agents", nested);
    assert.equal(deep.status, 400);
    assert.equal((await deep.json()).code, "invalid_json_body");

    const oversized = await post("/v1/agents", `{"displayName":"${"x".repeat(65_536)}"}`);
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).code, "payload_too_large");
  });

  await t.test("operation contracts reject mass assignment and unbounded values", async () => {
    const unknownField = await post("/v1/agents", { displayName: "Agent", isAdmin: true });
    assert.equal(unknownField.status, 400);
    assert.equal((await unknownField.json()).code, "invalid_request_field");

    const longName = await post("/v1/agents", { displayName: "x".repeat(121) });
    assert.equal(longName.status, 400);
    assert.equal((await longName.json()).code, "invalid_request_field");

    await post("/v1/demo/reset", {});
    const created = await post("/v1/agents", { displayName: "Bounded Agent" });
    const state = await created.json();
    const hugeAmount = await post("/v1/revenue-capture", {
      agentId: state.agent.subjectId,
      amountMinor: "9".repeat(79)
    });
    assert.equal(hugeAmount.status, 400);
    assert.equal((await hugeAmount.json()).code, "invalid_request_field");

    const ambiguousAmount = await post("/v1/revenue-capture", {
      agentId: state.agent.subjectId,
      amountMinor: "0001"
    });
    assert.equal(ambiguousAmount.status, 400);
    assert.equal((await ambiguousAmount.json()).code, "invalid_minor_units");
  });

  await t.test("request targets, static paths, and parser errors cannot escape the public root", async () => {
    const longTarget = await fetch(`${baseUrl}/${"a".repeat(2_100)}`);
    assert.equal(longTarget.status, 414);

    const ambiguousTarget = await rawRequest("GET //attacker.invalid/ HTTP/1.1\r\nHost: localhost\r\n\r\n");
    assert.match(ambiguousTarget, /^HTTP\/1\.1 400 Bad Request/);

    const traversal = await fetch(`${baseUrl}/..%2F..%2Fpackage.json`);
    assert.notEqual(traversal.status, 200);
    assert.doesNotMatch(await traversal.text(), /\"name\"\s*:\s*\"ipo-one\"/);

    const staticPost = await post("/index.html", {});
    assert.equal(staticPost.status, 405);

    const malformed = await rawRequest("GET / HTTP/1.1\r\nHost: localhost\r\nInvalid Header\r\n\r\n");
    assert.match(malformed, /^HTTP\/1\.1 400 Bad Request/);
  });

  await t.test("sandbox sessions stay isolated and mutable histories stay bounded", async () => {
    await post("/v1/demo/reset", {}, { session: sessionA });
    await post("/v1/demo/reset", {}, { session: sessionB });
    const created = await post("/v1/agents", { displayName: "Session A" }, { session: sessionA });
    assert.equal(created.status, 201);
    const peer = await fetch(`${baseUrl}/v1/demo/state`, { headers: headers(sessionB) });
    assert.equal((await peer.json()).agent, undefined);

    for (let mutation = 1; mutation < 32; mutation += 1) {
      const response = await post("/v1/agents", { displayName: "Session A" }, { session: sessionA });
      assert.equal(response.status, 201);
    }
    const limited = await post("/v1/agents", { displayName: "Session A" }, { session: sessionA });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");
    assert.equal((await limited.json()).code, "sandbox_mutation_limit_exceeded");

    const reset = await post("/v1/demo/reset", {}, { session: sessionA });
    assert.equal(reset.status, 200);
    const afterReset = await post("/v1/agents", { displayName: "Fresh Session A" }, { session: sessionA });
    assert.equal(afterReset.status, 201);
  });

  assert.equal(child.exitCode, null, `server must remain alive after adversarial requests\n${output}`);
});
