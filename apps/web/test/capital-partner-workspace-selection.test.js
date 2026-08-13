import test from "node:test";
import assert from "node:assert/strict";
import {
  capitalPartnerApplicationLabel,
  chooseCapitalPartnerApplication,
  createCapitalPartnerInboxSelection,
  createCapitalPartnerWorkspaceSelection,
  sameCapitalPartnerApplication
} from "../src/capital-partner-workspace-selection.js";

const self = Object.freeze({
  resource: { resourceType: "capital_partner_profile", resourceId: "capital_partner_001" },
  profile: { capitalPartnerId: "capital_partner_001", displayName: "Northstar Sandbox Capital" },
  fundsAuthority: false,
  serverTruth: true,
  readOnly: true,
  schemaVersion: "tenant_capital_partner_self_view.v1"
});

function application(index = 1) {
  return {
    resource: {
      resourceType: "credit_passport_artifact",
      resourceId: `credit_passport_artifact_${index}`
    },
    reviewContext: {
      creditIntentId: `credit_intent_${index}`,
      artifactHash: `0x${String(index).padStart(64, "0")}`,
      artifactVersion: index
    },
    summary: {
      claimCount: index,
      purpose: "private_credit_review",
      issuedAt: "2026-08-13T00:00:00.000Z",
      expiresAt: "2026-08-14T00:00:00.000Z"
    }
  };
}

function inbox(items) {
  return {
    items,
    count: items.length,
    hasMore: false,
    fundsAuthority: false,
    serverTruth: true,
    readOnly: true,
    schemaVersion: "tenant_capital_partner_passport_inbox_view.v1"
  };
}

test("one authorized application is selected from server truth", () => {
  const result = createCapitalPartnerWorkspaceSelection(self, inbox([application()]));
  assert.equal(result.status, "selected");
  assert.equal(result.selected.resource.resourceId, "credit_passport_artifact_1");
  assert.match(capitalPartnerApplicationLabel(result.selected, 1), /1 verified claim$/);
});

test("multiple applications require an explicit labeled choice and never guess the first row", () => {
  const result = createCapitalPartnerWorkspaceSelection(
    self,
    inbox([application(1), application(2)])
  );
  assert.equal(result.status, "choice_required");
  assert.equal(result.selected, null);
  assert.equal(
    chooseCapitalPartnerApplication(result.applications, "credit_passport_artifact_2")
      .reviewContext.creditIntentId,
    "credit_intent_2"
  );
});

test("empty, duplicate, unsafe, and stale response truth fails closed", () => {
  assert.equal(createCapitalPartnerWorkspaceSelection(self, inbox([])).status, "empty");
  assert.throws(
    () => createCapitalPartnerWorkspaceSelection(self, inbox([application(), application()])),
    /duplicate/
  );
  assert.throws(
    () => createCapitalPartnerWorkspaceSelection(
      { ...self, fundsAuthority: true },
      inbox([])
    ),
    /own Profile/
  );
  assert.equal(sameCapitalPartnerApplication(application(), application()), true);
  const changed = application();
  changed.reviewContext.artifactVersion = 2;
  assert.equal(sameCapitalPartnerApplication(application(), changed), false);
  assert.throws(
    () => createCapitalPartnerInboxSelection({ ...inbox([]), hasMore: true }),
    /authorized Inbox/
  );
  assert.throws(
    () => createCapitalPartnerInboxSelection(inbox([
      { ...application(), summary: { ...application().summary, claimCount: 0 } }
    ])),
    /authorized application/
  );
  assert.throws(
    () => createCapitalPartnerInboxSelection(inbox([
      { ...application(), summary: { ...application().summary, expiresAt: "not-a-date" } }
    ])),
    /authorized application/
  );
  assert.throws(
    () => createCapitalPartnerInboxSelection({ ...inbox([]), unexpected: true }),
    /authorized Inbox/
  );
});
