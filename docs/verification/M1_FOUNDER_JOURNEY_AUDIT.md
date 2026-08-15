# M1 Founder Journey Audit

Audit ID: `M1-A-20260803T132413Z`

Historical-snapshot notice: this document preserves the original read-only
M1-A observation. It is not current runtime truth after the Founder-authorized
M1-A.1 remediation. Current authenticated Human and Agent results are recorded
in `docs/verification/M1_A_1_AUTHENTICATED_GOLDEN_FLOW.md`; this historical
snapshot must not be used to claim that authentication is still blocked.

Audit constraint: read-only. No sign-in invitation was consumed, no session was
created, and no product command was submitted.

## Runtime entry evidence

Four existing loopback listeners were observed on `127.0.0.1:8787-8790`.
Each returned HTTP `200` and this exact bounded health result from
`/tenant/v1/healthz`:

```json
{"status":"ready","transport":"authenticated_http_loopback","public":false,"schemaVersion":"tenant_transport_health.v1"}
```

Real-browser checks loaded these URLs:

- `http://127.0.0.1:8787/#overview`
- `http://127.0.0.1:8788/#human`
- `http://127.0.0.1:8789/#risk`
- `http://127.0.0.1:8790/#capital-partners`

All four displayed:

- `No-funds product sandbox`;
- `No real lending`;
- `No real funds`;
- `Synthetic identity only`;
- `Sign-in required`.

The shells correctly withheld private state. The audit therefore proves public
entry and fail-closed authentication behavior, not an authenticated journey.

## Status vocabulary

Only the directed values are used below:

- `IMPLEMENTED`
- `PARTIAL`
- `MOCKED`
- `UI_ONLY`
- `BACKEND_ONLY`
- `UNREACHABLE`
- `NOT_IMPLEMENTED`
- `BLOCKED`

`BACKEND_ONLY` means the current backend has executable evidence but the step
was not reached in the real browser during this read-only audit. Fixture hosts
do not change that classification.

## Human entry journey

| Step | Status | Backend/persistence evidence | Authorization evidence | UI/runtime evidence | Stop or gap |
| --- | --- | --- | --- | --- | --- |
| Subject | BACKEND_ONLY | PostgreSQL Human self-Subject test; `subjects`/`principals` | Human session and Tenant resource binding | private UI not reached | blocked by sign-in in real browser |
| Consent | BACKEND_ONLY | durable Consent lifecycle and `consent_records` | owned Human Subject | private UI not reached | blocked by sign-in |
| Evidence | BACKEND_ONLY | Evidence envelopes, Passport/report handlers | owner-scoped read | Activity & Proofs shell exists | private UI not reached |
| Credit Intent | BACKEND_ONLY | shared durable credit-intent handler | current Consent, purpose, cap, freeze checks | Request Credit navigation exists | private UI not reached |
| Decision | BACKEND_ONLY | deterministic Evidence-derived decision | non-authorizing policy result | decision panel code exists | private UI not reached |
| Offer | BACKEND_ONLY | versioned synthetic Offer | Capital Partner role and disclosed application | Offer UI code exists | private UI not reached |
| Acceptance | BACKEND_ONLY | durable acceptance, stale/version checks | exact Human owner and Offer version | acceptance UI code exists | no browser mutation permitted |
| Authorization | BACKEND_ONLY | Gateway authority resources and audit | Authentication Context, Consent, exact resource | not independently visible signed out | no authenticated proof |
| Obligation | BACKEND_ONLY | durable Obligation/installments | exact accepted Offer | Obligations navigation exists | private UI not reached |
| Funding state | BACKEND_ONLY | no-funds execution/Facility state | exact Obligation/authority | safety boundary visible | no real funding exists or is approved |
| Repayment | BACKEND_ONLY | deterministic synthetic repayment and Ledger posting | owned Obligation and idempotency | Repay & Settle navigation exists | private UI not reached |
| CreditState | BACKEND_ONLY | outcomes, servicing, Passport records | owned/permissioned access | Credit Track Record navigation exists | private UI not reached |
| Dispute/Correction | NOT_IMPLEMENTED | no dispute case domain, table, operation, or handler | absent | no dispute case UI | required before closed pilot; additive Evidence correction is not a dispute workflow |

Human Golden Flow stop: before `Subject`, at the authentication gate. Backend
tests demonstrate later local no-funds behavior, but they do not make the
Founder browser journey reachable under M1-A.

## Agent entry journey

| Step | Status | Backend/persistence evidence | Authorization evidence | UI/runtime evidence | Stop or gap |
| --- | --- | --- | --- | --- | --- |
| Principal/Operator | BACKEND_ONLY | durable Principal and membership | Principal Controller role | port 8788 shell loads | blocked by sign-in |
| Agent binding | BACKEND_ONLY | durable challenge/proof/account binding | Principal-bound one-use proof | Agent Console/Wallet navigation exists | no real wallet E2E |
| Mandate | BACKEND_ONLY | draft, acknowledge, activate, revoke | Principal exact authority and nonce | authority workspace code exists | private UI not reached |
| Credit Intent | BACKEND_ONLY | shared intent handler | active Mandate, caps, freeze | Agent machine workflow tested | no current runtime credential used |
| Plan validation | BACKEND_ONLY | typed protocol and exact request validation | caller authority fields rejected | Agent Console code exists | no authenticated browser/MCP run in M1-A |
| Offer | BACKEND_ONLY | synthetic bilateral Offer | disclosed intent and lender role | Offer UI code exists | private UI not reached |
| Authorization | BACKEND_ONLY | accepted Offer/Obligation plus active Mandate | Gateway derives authority out of band | private UI not reached | no current credential runtime proof |
| Purpose-bound Lockbox | MOCKED | `LockboxService` uses process-local `Map` | not exposed as durable Tenant operation | legacy/demo presence cannot prove it | P0 durability/authentication gap |
| Controlled execution | BACKEND_ONLY | signed loopback Provider receipt and durable accounting | exact Mandate/Provider/purpose/caps | execution UI code exists | no external Provider or funds |
| Obligation | BACKEND_ONLY | shared durable Obligation | exact Offer acceptance | Obligations navigation exists | private UI not reached |
| Settlement | BACKEND_ONLY | synthetic trading/credit settlement records | exact Facility plus reconciliation | Repay & Settle/Trading UI exists | real settlement prohibited |
| Repayment | BACKEND_ONLY | deterministic shared repayment | Mandate/owned Obligation | repayment UI code exists | private UI not reached |
| Agent and Principal CreditState | BACKEND_ONLY | outcomes, Passport, operator/Agent reads | subject/role-scoped | status surfaces exist | private UI not reached |

Agent Golden Flow stop: before `Principal/Operator`, at the authentication gate.
The machine transport suite proves a local typed protocol boundary, not a
current real credential or external Agent runtime.

## Fixture and prototype exclusion

The following are useful acceptance assets but were not accepted as current
runtime proof:

- `apps/web/test/support/human-lifecycle-browser-host.mjs`;
- `apps/web/test/support/agent-console-browser-host.mjs`;
- other `apps/web/test/support/*fixture*` and `*browser-host*` files;
- browser-generated downloads and prototype state;
- the legacy demo API at `apps/api/src/server.js:551-673`;
- the scripted flow under `packages/mvp-flow/src/`.

## Founder-visible contradictions

1. The signed-out shell label says `Closed Pilot · Synthetic Capital` while the
   Constitution says L2 closed pilot is disabled until named gates and
   approvals pass (`docs/PRODUCT_CONSTITUTION.md:82-87`). The adjacent `Locked`
   and `Sandbox only` labels reduce risk, but `Closed Pilot` can still be read as
   an availability claim.
2. Navigation exposes broad destination labels including Trading Capital and
   Capital Partners while current private actions remain locked. Navigation is
   not capability evidence.
3. The real page correctly hides all private data until sign-in; consequently,
   previous screenshots or fixture journeys cannot stand in for the current
   authenticated journey.

## Reproduction commands

```sh
lsof -nP -iTCP -sTCP:LISTEN | rg ':(8787|8788|8789|8790)\b'
curl --silent --show-error --max-time 5 http://127.0.0.1:8787/tenant/v1/healthz
/Users/cptmao/.codex/skills/playwright/scripts/playwright_cli.sh open http://127.0.0.1:8787/#overview
/Users/cptmao/.codex/skills/playwright/scripts/playwright_cli.sh snapshot
/Users/cptmao/.codex/skills/playwright/scripts/playwright_cli.sh goto http://127.0.0.1:8788/#human
/Users/cptmao/.codex/skills/playwright/scripts/playwright_cli.sh snapshot
/Users/cptmao/.codex/skills/playwright/scripts/playwright_cli.sh goto http://127.0.0.1:8789/#risk
/Users/cptmao/.codex/skills/playwright/scripts/playwright_cli.sh snapshot
/Users/cptmao/.codex/skills/playwright/scripts/playwright_cli.sh goto http://127.0.0.1:8790/#capital-partners
/Users/cptmao/.codex/skills/playwright/scripts/playwright_cli.sh snapshot
```
