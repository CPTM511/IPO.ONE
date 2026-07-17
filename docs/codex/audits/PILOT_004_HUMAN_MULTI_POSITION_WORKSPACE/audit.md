# PILOT-004 Audit — Human multi-position workspace

Date: 2026-07-17

Result: Passed for the local synthetic no-funds private pilot.

## Evidence

- The Human UI retains only the bounded Obligation references already returned
  by `pilotReadWorkspaceResume`; it introduces no list/search or new operation.
- References are accepted only when the resource type is `obligation`, the
  opaque ID is valid, and the reviewed relationship is `owner` or `controller`.
  Duplicate IDs collapse before rendering.
- `My positions` renders with text-safe DOM nodes, stable server ordering,
  explicit selection state, and responsive one/two-column layouts.
- Selecting a position invokes the existing `pilotReadOwnObligation` exact read;
  returned server state remains the only source for lifecycle, economics,
  schedule, DPD, and servicing details.
- `Start another application` clears the prior application/workflow envelope
  while preserving the selected existing Obligation. Acceptance of the next
  Offer resets execution, repayment sequence, and servicing state before the
  new Obligation becomes current.
- The private UI now reports the correct 35-operation catalog and describes
  core workspace recovery accurately.

## Verification

- Syntax and static UI tests: passed.
- Full repository gate: passed; 317 tests, 46 schemas, 35 private Tenant
  operations, 21 OpenAPI operations, and 23 ordered migration pairs.
- Real PostgreSQL/browser run created two Human sandbox Obligations with
  different approved principal amounts (`$120` and `$80`).
- Payments rendered both as `2 positions`. Selecting either position changed
  the exact Obligation ID and outstanding amount to the corresponding server
  result while the position order remained stable.
- The accepted second Offer exposed `Start another application` without
  removing the first position.
- After clearing both `localStorage` and `sessionStorage`, a fresh reload
  restored the same two positions from authenticated PostgreSQL server truth
  and selected the most recently bound position.
- Browser console after the full interaction reported zero errors and zero
  warnings.

## Residual gates

This is a Human private-pilot usability increment, not a public portfolio API
or production loan approval. Production IdP/workload Credentials, protected
remote transport/deployment, backup/DR, named operators, privacy/security/legal
review, production Provider/capital/custody/collections integrations, CHAIN-001B
funded receipts, and every real-value permission remain closed.
