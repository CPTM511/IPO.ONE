import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import {
  expiredCsrfBootstrapCookie,
  expiredSessionCookie
} from "../../../modules/authentication/src/index.js";
import {
  HUMAN_ACCESS_ROUTES,
  createHumanAccessRouteHandler
} from "../src/index.js";

const ORIGIN = "https://pilot.ipo.one";
const SESSION = "session-invalidation-route-000000000000000001";
const CSRF = "csrf-route-invalidation-000000000000000001";
const IDEMPOTENCY = "wallet-route-idempotency-00000000000000001";
const RESULT = Object.freeze({
  schemaVersion: "wallet_session_invalidation_result.v1",
  status: "invalidated",
  reauthenticationRequired: true,
  authorityAvailable: false,
  credentialsIncluded: false,
  fundsAuthority: false
});

function responseCapture() {
  return {
    status: undefined,
    headers: undefined,
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body?.toString() ?? "";
    }
  };
}

function request({ path, body, headers = {}, method = "POST" }) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  stream.method = method;
  stream.headers = headers;
  return {
    request: stream,
    url: new URL(path, ORIGIN)
  };
}

function fixture() {
  const calls = [];
  const invalidations = new Map();
  const humanSessionBff = {
    async authenticateSession() {
      throw new Error("not used");
    },
    async logout() {
      throw new Error("not used");
    },
    async invalidateBrowserSession(input) {
      calls.push(structuredClone(input));
      const replay = invalidations.get(input.idempotencyKey);
      if (!replay) {
        if (input.sessionHandle !== SESSION) {
          throw Object.assign(new Error("inactive"), {
            code: "authentication_session_rejected"
          });
        }
        invalidations.set(input.idempotencyKey, input.reasonCode);
      } else if (replay !== input.reasonCode || input.sessionHandle !== undefined) {
        throw Object.assign(new Error("inactive"), {
          code: "authentication_session_rejected"
        });
      }
      return Object.freeze({
        result: RESULT,
        clearSessionCookie: expiredSessionCookie(),
        clearCsrfBootstrapCookie: expiredCsrfBootstrapCookie()
      });
    }
  };
  return {
    calls,
    handler: createHumanAccessRouteHandler({
      browserOrigin: ORIGIN,
      humanSessionBff,
      oidcProviders: {},
      clock: () => new Date("2026-07-23T12:00:00.000Z")
    })
  };
}

function invalidationRequest({ cookie = true, reasonCode = "wallet_account_changed" } = {}) {
  return request({
    path: HUMAN_ACCESS_ROUTES.walletInvalidate,
    headers: {
      ...(cookie ? { cookie: `__Host-ipo_one_session=${SESSION}` } : {}),
      "content-type": "application/json",
      "idempotency-key": IDEMPOTENCY,
      origin: ORIGIN,
      "x-csrf-token": CSRF
    },
    body: JSON.stringify({
      schemaVersion: "wallet_session_invalidation_request.v1",
      reasonCode
    })
  });
}

test("wallet invalidation route returns one closed result and exact replay without a cookie", async () => {
  const { calls, handler } = fixture();
  const first = invalidationRequest();
  const firstResponse = responseCapture();
  assert.equal(await handler({
    ...first,
    response: firstResponse,
    requestId: "request_wallet_invalidate_0001"
  }), true);
  assert.equal(firstResponse.status, 200);
  assert.deepEqual(JSON.parse(firstResponse.body), RESULT);
  assert.equal(firstResponse.headers["set-cookie"].length, 2);

  const replay = invalidationRequest({ cookie: false });
  const replayResponse = responseCapture();
  assert.equal(await handler({
    ...replay,
    response: replayResponse,
    requestId: "request_wallet_invalidate_0002"
  }), true);
  assert.equal(replayResponse.status, 200);
  assert.deepEqual(JSON.parse(replayResponse.body), RESULT);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].sessionHandle, SESSION);
  assert.equal(calls[1].sessionHandle, undefined);
  assert.equal(calls.some((call) => Object.hasOwn(call, "tenantId")), false);
});

test("logout uses the same idempotent audited invalidation boundary", async () => {
  const { calls, handler } = fixture();
  const logout = request({
    path: HUMAN_ACCESS_ROUTES.logout,
    headers: {
      cookie: `__Host-ipo_one_session=${SESSION}`,
      "idempotency-key": IDEMPOTENCY,
      origin: ORIGIN,
      "x-csrf-token": CSRF
    }
  });
  const response = responseCapture();
  assert.equal(await handler({
    ...logout,
    response,
    requestId: "request_wallet_logout_0001"
  }), true);
  assert.deepEqual(JSON.parse(response.body), {
    schemaVersion: "ipo_one_logout_result.v1",
    status: "logged_out"
  });
  assert.equal(calls[0].reasonCode, "human_logout");
});

test("wallet invalidation route rejects open bodies, missing idempotency, and wrong origin", async () => {
  const { handler } = fixture();
  const open = request({
    path: HUMAN_ACCESS_ROUTES.walletInvalidate,
    headers: {
      cookie: `__Host-ipo_one_session=${SESSION}`,
      "content-type": "application/json",
      "idempotency-key": IDEMPOTENCY,
      origin: ORIGIN,
      "x-csrf-token": CSRF
    },
    body: JSON.stringify({
      schemaVersion: "wallet_session_invalidation_request.v1",
      reasonCode: "wallet_account_changed",
      tenantId: "tenant_attacker"
    })
  });
  await assert.rejects(
    () => handler({
      ...open,
      response: responseCapture(),
      requestId: "request_wallet_invalidate_open"
    }),
    (error) => error.code === "invalid_json_body"
  );

  const missingIdempotency = invalidationRequest();
  delete missingIdempotency.request.headers["idempotency-key"];
  await assert.rejects(
    () => handler({
      ...missingIdempotency,
      response: responseCapture(),
      requestId: "request_wallet_invalidate_no_idempotency"
    }),
    (error) => error.code === "authentication_input_rejected"
  );

  const wrongOrigin = invalidationRequest();
  wrongOrigin.request.headers.origin = "https://attacker.example";
  await assert.rejects(
    () => handler({
      ...wrongOrigin,
      response: responseCapture(),
      requestId: "request_wallet_invalidate_origin"
    }),
    (error) => error.code === "csrf_origin_rejected"
  );
});
