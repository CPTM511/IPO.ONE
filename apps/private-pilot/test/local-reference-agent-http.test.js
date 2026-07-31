import assert from "node:assert/strict";
import test from "node:test";
import { RoleBundle } from "../../../modules/authorization/src/index.js";
import {
  LOCAL_REFERENCE_AGENT_HTTP_ROUTES,
  createLocalReferenceAgentHttpService
} from "../src/local-reference-agent-http.js";

function service() {
  return createLocalReferenceAgentHttpService({
    createAgentSession: async () => assert.fail("invalid request created Agent session"),
    gateway: { execute: async () => assert.fail("invalid request reached Gateway") },
    networkContext: { source: "local_test" },
    proveAccount: async () => assert.fail("invalid request reached account proof")
  });
}

const principal = Object.freeze({
  actorType: "human",
  roles: Object.freeze([RoleBundle.PRINCIPAL_CONTROLLER])
});

test("reference Agent HTTP surface is closed to exact POST routes", async () => {
  const referenceAgent = service();
  const handled = await referenceAgent.handle({
    request: { method: "POST" },
    url: new URL("http://127.0.0.1/not-reference-agent"),
    authenticationContext: principal,
    readJson: async () => assert.fail("unmatched route read a body"),
    sendJson: () => assert.fail("unmatched route sent a response")
  });
  assert.equal(handled, false);

  await assert.rejects(
    referenceAgent.handle({
      request: { method: "GET" },
      url: new URL(
        `http://127.0.0.1${LOCAL_REFERENCE_AGENT_HTTP_ROUTES.application}`
      ),
      authenticationContext: principal,
      readJson: async () => ({ mandateId: "mandate_reference_agent" }),
      sendJson: () => undefined
    }),
    (error) => error.code === "local_reference_agent_method_not_allowed"
  );
});

test("reference Agent HTTP surface requires Principal access and closed input", async () => {
  const referenceAgent = service();
  await assert.rejects(
    referenceAgent.handle({
      request: { method: "POST" },
      url: new URL(
        `http://127.0.0.1${LOCAL_REFERENCE_AGENT_HTTP_ROUTES.application}`
      ),
      authenticationContext: {
        actorType: "human",
        roles: ["borrower"]
      },
      readJson: async () => ({ mandateId: "mandate_reference_agent" }),
      sendJson: () => undefined
    }),
    (error) => error.code === "authorization_denied"
  );

  await assert.rejects(
    referenceAgent.handle({
      request: { method: "POST" },
      url: new URL(
        `http://127.0.0.1${LOCAL_REFERENCE_AGENT_HTTP_ROUTES.runtime}`
      ),
      authenticationContext: principal,
      readJson: async () => ({
        mandateId: "mandate_reference_agent",
        offerReceipt: {},
        browserCredential: "forbidden"
      }),
      sendJson: () => undefined
    }),
    (error) => error.code === "local_reference_agent_request_invalid"
  );
});

test("reference Agent account proof returns only the verified binding", async () => {
  const challenge = {
    subjectId: "subject_reference_agent"
  };
  const referenceAgent = createLocalReferenceAgentHttpService({
    createAgentSession: async () => assert.fail("account proof created Agent session"),
    gateway: { execute: async () => assert.fail("account proof reached Human Gateway") },
    networkContext: { source: "local_test" },
    async proveAccount(input) {
      assert.equal(input, challenge);
      return {
        subjectId: challenge.subjectId,
        subjectStatus: "active",
        accountBinding: {
          chainId: "eip155:84532",
          accountHash: `0x${"1".repeat(64)}`,
          proofHash: `0x${"2".repeat(64)}`
        },
        challengeConsumed: true
      };
    }
  });
  let response;
  await referenceAgent.handle({
    request: { method: "POST" },
    url: new URL(
      `http://127.0.0.1${LOCAL_REFERENCE_AGENT_HTTP_ROUTES.accountProof}`
    ),
    authenticationContext: principal,
    readJson: async () => ({
      subjectId: challenge.subjectId,
      challenge
    }),
    sendJson(status, body) {
      response = { status, body };
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "account_bound");
  assert.equal(response.body.challengeConsumed, true);
  assert.equal(response.body.credentialEnteredBrowser, false);
  assert.equal(response.body.signatureEnteredBrowser, false);
});
