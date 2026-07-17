# PILOT-004 — Human multi-position workspace

Status: Implemented locally

## Context

PILOT-003 restored every bounded Actor-bound Obligation reference, but the
Human interface loaded only one record. A commercial credit workspace must let
one borrower resume, distinguish, and select multiple positions without
copying opaque identifiers or weakening exact-resource authorization.

## Scope

- retain the bounded Obligation references returned by the existing
  authenticated workspace-recovery operation;
- render an Aave-inspired `My positions` selector in the Human Servicing Case;
- keep the server's deterministic position order stable while selection changes;
- load a selected position only through the existing exact authorized
  `pilotReadOwnObligation` operation;
- support a second Human credit application after the current Offer is accepted
  while preserving the selected existing Obligation;
- restore the complete bounded position selector after browser storage loss;
- correct the product UI's private-operation count and reload language.

## Non-goals

- a new listing, search, portfolio, batch-read, mutation, or permission;
- cross-Actor, Risk, Auditor, Agent, Provider, Worker, public, or MCP discovery;
- aggregate balances that have not been read and verified for each exact
  Obligation;
- real funds, production identity, remote transport, deployment, or capital.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/app.js`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`

## Acceptance criteria

- only valid recovered `obligation` references with `owner` or `controller`
  relationships can enter the selector, and duplicate identifiers collapse;
- a manually authorized or newly accepted Obligation joins the selector without
  reordering existing positions during selection;
- selecting a position invokes the existing exact-resource read and renders the
  returned outstanding amount, schedule, DPD, and servicing state;
- accepting one Offer exposes a clear `Start another application` action;
- the next application gets fresh workflow identifiers and cannot reuse prior
  execution, repayment, or servicing state;
- clearing browser local/session storage and reloading restores all server-bound
  positions from PostgreSQL;
- the UI remains responsive, text-safe, accessible, and explicitly no-funds.

## Test command

```sh
node --check apps/web/src/app.js
node --test apps/web/test/static-ui.test.js
pnpm run check
```

## Security checklist

- [x] No new server operation, capability, authorization path, or MCP tool.
- [x] The selector consumes only Actor-bound server-truth references.
- [x] Every position hydration still requires exact-resource authorization.
- [x] DOM rendering uses text nodes and never injects API-controlled HTML.
- [x] Position state contains opaque IDs only, with no PII, KYC, or credentials.
- [x] Starting another application cannot reuse prior economic workflow state.
- [x] No public route, remote transport, production authority, or funds effect.
