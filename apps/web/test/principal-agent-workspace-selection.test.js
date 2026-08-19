import assert from "node:assert/strict";
import test from "node:test";

import { selectPrincipalAgentWorkspace } from "../src/principal-agent-workspace-selection.js";

function recovery(overrides = {}) {
  return {
    workspaceKind: "principal_controller",
    resources: [],
    controlledAgentActorIds: ["actor_agent_alpha"],
    continuationReceipts: [],
    hasMore: false,
    serverTruth: true,
    schemaVersion: "tenant_workspace_resume_view.v2",
    ...overrides
  };
}

function continuation(overrides = {}) {
  const subjectId = "subject_alpha";
  const mandateId = "mandate_alpha";
  const creditOfferId = "credit_offer_alpha";
  const creditOfferHash = `0x${"a".repeat(64)}`;
  return {
    continuationReceiptId: "continuation_receipt_alpha",
    receiptHash: `0x${"b".repeat(64)}`,
    subjectId,
    mandateId,
    creditOfferId,
    creditOfferHash,
    offerAggregateVersion: 1,
    expiresAt: "2026-08-13T00:00:00.000Z",
    receipt: {
      schemaVersion: "agent_credit_offer_workflow_receipt.v1",
      status: "offer_ready",
      subjectId,
      mandateId,
      offer: { creditOfferId, creditOfferHash }
    },
    serverTruth: true,
    schemaVersion: "workspace_continuation_receipt_view.v1",
    ...overrides
  };
}

test("one controlled Agent is selected without a browser-authored locator", () => {
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery()), {
    status: "selected",
    actorId: "actor_agent_alpha",
    subjectId: null,
    mandateId: null
  });
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery({
    resources: [
      { resourceType: "subject", resourceId: "subject_alpha", relationship: "controller" },
      { resourceType: "mandate", resourceId: "mandate_alpha", relationship: "controller" }
    ]
  })), {
    status: "selected",
    actorId: "actor_agent_alpha",
    subjectId: "subject_alpha",
    mandateId: "mandate_alpha"
  });
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery({
    resources: [
      { resourceType: "subject", resourceId: "subject_alpha", relationship: "controller" },
      { resourceType: "mandate", resourceId: "mandate_alpha", relationship: "controller" }
    ],
    continuationReceipts: [continuation()]
  })), {
    status: "selected",
    actorId: "actor_agent_alpha",
    subjectId: "subject_alpha",
    mandateId: "mandate_alpha"
  });
});

test("zero controlled Agents exposes an explicit empty state", () => {
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery({ controlledAgentActorIds: [] })), {
    status: "empty"
  });
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery({
    controlledAgentActorIds: [],
    resources: [
      { resourceType: "subject", resourceId: "subject_without_actor", relationship: "controller" }
    ]
  })), {
    status: "ambiguous"
  });
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery({
    controlledAgentActorIds: [],
    resources: [
      { resourceType: "subject", resourceId: "subject_without_actor", relationship: "controller" },
      { resourceType: "mandate", resourceId: "mandate_without_actor", relationship: "controller" }
    ]
  })), {
    status: "ambiguous"
  });
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery({
    controlledAgentActorIds: [],
    continuationReceipts: [{ serverTruth: true }]
  })), {
    status: "ambiguous"
  });
});

test("multiple controlled Agents require and verify one server-backed visible selection", () => {
  const options = [
    {
      actorId: "actor_agent_existing",
      label: "Existing Agent workspace",
      setupStatus: "configured"
    },
    {
      actorId: "actor_agent_new",
      label: "New Agent workspace",
      setupStatus: "setup_required"
    }
  ];
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery({
    controlledAgentActorIds: options.map(({ actorId }) => actorId),
    controlledAgentOptions: options,
    selectedAgentActorId: null
  })), {
    status: "selection_required",
    options
  });
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery({
    controlledAgentActorIds: options.map(({ actorId }) => actorId),
    controlledAgentOptions: options,
    selectedAgentActorId: "actor_agent_new"
  })), {
    status: "selected",
    actorId: "actor_agent_new",
    subjectId: null,
    mandateId: null,
    options
  });
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery({
    controlledAgentActorIds: options.map(({ actorId }) => actorId),
    controlledAgentOptions: options,
    selectedAgentActorId: "actor_agent_uncontrolled"
  })), { status: "ambiguous" });
});

test("multiple, incomplete and malformed server truth fail closed", () => {
  for (const input of [
    recovery({ controlledAgentActorIds: ["actor_a", "actor_b"] }),
    recovery({ hasMore: true }),
    recovery({ hasMore: undefined }),
    recovery({ hasMore: "false" }),
    recovery({ continuationReceipts: undefined }),
    recovery({ continuationReceipts: [{ serverTruth: true }] }),
    recovery({
      resources: [
        { resourceType: "subject", resourceId: "subject_alpha", relationship: "controller" },
        { resourceType: "mandate", resourceId: "mandate_alpha", relationship: "controller" }
      ],
      continuationReceipts: [{ serverTruth: true }]
    }),
    recovery({
      resources: [
        { resourceType: "subject", resourceId: "subject_alpha", relationship: "controller" },
        { resourceType: "mandate", resourceId: "mandate_alpha", relationship: "controller" }
      ],
      continuationReceipts: [continuation(), continuation({
        continuationReceiptId: "continuation_receipt_beta"
      })]
    }),
    recovery({
      resources: [
        { resourceType: "subject", resourceId: "subject_alpha", relationship: "controller" },
        { resourceType: "mandate", resourceId: "mandate_alpha", relationship: "controller" }
      ],
      continuationReceipts: [continuation({ subjectId: "subject_other" })]
    }),
    recovery({
      resources: [
        { resourceType: "subject", resourceId: "subject_alpha", relationship: "controller" },
        { resourceType: "mandate", resourceId: "mandate_alpha", relationship: "controller" }
      ],
      continuationReceipts: [continuation({ unexpectedAuthority: true })]
    }),
    recovery({ controlledAgentActorIds: ["actor_agent_alpha", "actor_agent_alpha"] }),
    recovery({ controlledAgentActorIds: ["unsafe actor"] }),
    recovery({ resources: [
      { resourceType: "subject", resourceId: "subject_a", relationship: "controller" },
      { resourceType: "subject", resourceId: "subject_b", relationship: "controller" }
    ] }),
    recovery({ resources: [
      { resourceType: "mandate", resourceId: "mandate_a", relationship: "controller" }
    ] }),
    recovery({ resources: [
      { resourceType: "subject", resourceId: "subject_a", relationship: "owner" }
    ] }),
    recovery({ resources: [
      { resourceType: "unknown", resourceId: "subject_a", relationship: "controller" }
    ] }),
    recovery({ resources: [null] }),
    recovery({ resources: [
      { resourceType: "obligation", resourceId: "unsafe obligation", relationship: "controller" }
    ] }),
    recovery({ unexpectedAuthority: true }),
    recovery({ resources: [
      {
        resourceType: "subject",
        resourceId: "subject_a",
        relationship: "controller",
        actorId: "actor_browser_authored"
      }
    ] })
  ]) {
    assert.deepEqual(selectPrincipalAgentWorkspace(input), { status: "ambiguous" });
  }
});

test("unknown, non-server and non-Principal inputs are unavailable", () => {
  assert.deepEqual(selectPrincipalAgentWorkspace(), { status: "unavailable" });
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery({ serverTruth: false })), {
    status: "unavailable"
  });
  assert.deepEqual(selectPrincipalAgentWorkspace(recovery({ workspaceKind: "human_borrower" })), {
    status: "unavailable"
  });
});
