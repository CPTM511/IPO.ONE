# V9-007 pre-change mapping

Date: 2026-07-24

## Source identity and task boundary

- Branch: `codex/commercial-access-release`
- Source HEAD: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`
- The accepted stacked worktree is intentionally dirty. V9-007 must preserve it and touch only the files listed in its audit.
- V9-006 was accepted by IPO.ONE Founder at `2026-07-24T14:43:24.082Z`. That acceptance authorizes V9-007 only.
- V9-007 is no-funds and local-only. It does not authorize Provider funding, a public pool, TVL, production pricing, custody, withdrawal, mainnet, credentials, deployment, or real capital.

## Prototype surface

`apps/web/src/index.html` currently describes Capital Network with three static cards:

1. the real local Provider sandbox loop;
2. an unbound matching / earnings simulation statement; and
3. a disabled join / fund statement.

The page has no exact Provider resource input, no server response binding, no
delivery or reconciliation receipt, and no fail-closed presentation contract.
The navigation maturity badge checks catalog presence only. It is not evidence
that a Provider identity has an assigned intent.

## Existing server truth to reuse

| Concern | Current source of truth | V9-007 treatment |
| --- | --- | --- |
| Provider read | `pilotReadProviderIntent` -> `provider_intent_view.v1` | Reuse exact assigned `transfer_intent` read; no list or discovery endpoint |
| Provider acknowledgement | `pilotAcknowledgeProviderIntent` -> `provider_intent_acknowledgement.v1` | Reuse with a stable browser idempotency key bound to the exact delivery hash |
| Identity and scope | Provider Actor plus exact `AccessGrant` purpose `provider_intent_delivery` | Preserve; browser cannot supply Tenant, role, Actor, Provider identity, or grant |
| Delivery | signed Ed25519 envelope to one fixed `127.0.0.1` path | Present as a local signed boundary; do not expose keys, signature, nonce, or endpoint choice |
| Callback | signed, expiring callback admitted before durable work | Present only the server-derived terminal delivery status |
| Canonical state | `provider_intent_deliveries`, acknowledgements, callback inbox, Event, Evidence, outbox | No browser ledger or alternate Provider state |
| Retry | Gateway idempotency plus immutable Provider delivery replay | Keep one deterministic key per exact delivery; existing conflict and restart tests remain authoritative |
| Reconciliation | PostgreSQL reconciliation covers Provider delivery, acknowledgement, callback inbox, events and projections | Display a receipt derived from the exact Provider view, not a client-created settlement claim |

Current Provider result contracts carry the mandatory boundary flags
`sandboxOnly=true`, `productionFundsMoved=false`, and `withdrawable=false`.
Unknown fields already fail schema validation at the protocol boundary.

## Contract and UI delta

V9-007 will add `capital_network_presentation.v1`, a closed presentation
contract that accepts only:

- the current catalog operation IDs;
- either no Provider view, or one exact `provider_intent_view.v1`;
- either no acknowledgement, or the exact matching
  `provider_intent_acknowledgement.v1`.

The contract will reject unknown fields, unsafe flags, invalid identifiers,
invalid timestamps, amount drift, mismatched acknowledgement bindings, unknown
delivery status, or impossible status / receipt combinations. It will expose:

- a no-funds Provider mandate / facility descriptor;
- assigned sandbox exposure from the server amount only;
- delivery and reconciliation stages derived from the exact server status;
- a clearly labeled historical, unapproved earnings example; and
- an explicit disabled-capabilities set for funding, withdrawal, public pool,
  TVL, production fees, remote Provider access, mainnet, and real capital.

The UI will require one exact `TransferIntent` ID. Missing, denied, expired, and
cross-Provider resources remain indistinguishable. Acknowledgement is not
funding or settlement and remains available only when the exact server state is
`pending`; all capital actions remain disabled.

## No change expected

- No new Tenant protocol operation, catalog entry, AuthZ capability, admission
  rule, migration, external dependency, Ledger rule, capital rule, signer,
  credential, endpoint, or deployment.
- No Provider enumeration, browser fixture fallback in production, local
  storage of Provider state, public/remote listener, withdrawal, funding, TVL,
  or production fee policy.
- Historical Provider ADR text that refers to an older operation count remains
  historical. Current catalog/runtime checks, not the old count, are the source
  of truth.
