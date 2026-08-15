import assert from "node:assert/strict";
import test from "node:test";

import {
  POST_LOGIN_VIEW_INTENT_TTL_MS,
  createPostLoginViewIntent,
  readPostLoginViewIntent,
  resolveWorkspaceLocation
} from "../src/workspace-navigation.js";

test("workspace locations retain canonical product views", () => {
  assert.deepEqual(resolveWorkspaceLocation("borrower", "obligations"), {
    kind: "product_view",
    view: "obligations",
    canonicalFragment: "obligations",
    requiresReplace: false
  });
});

test("legacy aliases and invalid or cross-role views require canonical replacement", () => {
  assert.deepEqual(resolveWorkspaceLocation("controller", "#human"), {
    kind: "product_view",
    view: "request-credit",
    canonicalFragment: "request-credit",
    requiresReplace: true
  });
  assert.deepEqual(resolveWorkspaceLocation("risk", "#risk"), {
    kind: "product_view",
    view: "risk-operations",
    canonicalFragment: "risk-operations",
    requiresReplace: true
  });
  assert.deepEqual(resolveWorkspaceLocation("capitalPartner", "risk-operations"), {
    kind: "product_view",
    view: "capital-partners",
    canonicalFragment: "capital-partners",
    requiresReplace: true
  });
  assert.deepEqual(resolveWorkspaceLocation("borrower", "not-a-view"), {
    kind: "product_view",
    view: "overview",
    canonicalFragment: "overview",
    requiresReplace: true
  });
});

test("the skip-link fragment remains a native document anchor", () => {
  assert.deepEqual(resolveWorkspaceLocation("borrower", "#mainContent"), {
    kind: "document_anchor",
    fragment: "mainContent"
  });
});

test("post-login view intent is strict, role-bound, short-lived, and presentation-only", () => {
  const createdAt = Date.parse("2026-08-13T10:00:00.000Z");
  const intent = createPostLoginViewIntent("borrower", "obligations", createdAt);
  assert.deepEqual(intent, {
    createdAt,
    schemaVersion: "post_login_view_intent.v1",
    view: "obligations"
  });
  assert.equal(readPostLoginViewIntent("borrower", intent, { now: createdAt }), "obligations");
  assert.equal(
    readPostLoginViewIntent("borrower", intent, {
      now: createdAt + POST_LOGIN_VIEW_INTENT_TTL_MS
    }),
    "obligations"
  );
  assert.equal(
    readPostLoginViewIntent("borrower", intent, {
      now: createdAt + POST_LOGIN_VIEW_INTENT_TTL_MS + 1
    }),
    null
  );
  assert.equal(readPostLoginViewIntent("risk", intent, { now: createdAt }), null);
  assert.equal(readPostLoginViewIntent("borrower", { ...intent, extra: true }, { now: createdAt }), null);
  assert.throws(
    () => createPostLoginViewIntent("borrower", "risk-operations", createdAt),
    /Post-login view intent is invalid/
  );
});
