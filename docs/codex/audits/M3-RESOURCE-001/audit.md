# M3-RESOURCE-001 Acceptance Evidence

Date: 2026-09-02

Verdict: `PASS — L0 LOCAL NO-FUNDS VERIFIED`

Baseline: `475b7baa6b65fc5d439e79d1fd07da4c4794e590`

Implementation: `b3cdfe9e5f242a785752ffee3036e6b6d638f8b8`

Provenance correction (2026-09-03): this L0 result was completed and accepted,
but independent Evidence of prior Founder implementation authorization was not
established. The Founder now explicitly ratifies this completed L0 scope; that
ratification does not rewrite the authority available when the work occurred.

This record accepts one synthetic metered machine-service slice under
Constitution v1.5 `REQ-EXEC-005` and
`DEC-METERED-RESOURCE-CREDIT-001`. It grants no deployment, external Provider,
credential, pricing-policy, risk-policy, mainnet, signer, custody, transfer,
withdrawal or real-funds authority.

## Delivered product truth

One synthetic Provider may report finalized `inference_tokens` usage in the
`token` unit under one exact accepted price schedule. The worker-facing Tenant
operation verifies the Provider signature and exact live policy, derives the
integer charge server-side, and atomically appends Metered Usage Evidence,
admission, Mandate capacity, canonical Obligation/Ledger, Event and Evidence
state. It does not create a second obligation, ledger or credit product.

The original usage record is immutable. One linked correction is additive and
posts a signed non-zero delta; the tested negative correction releases Mandate
capacity and writes a balanced correction Ledger transaction. A second
branching correction, forged signature, conflicting replay, wrong Tenant,
stale or inconsistent authority fails closed before utilization.

Principal Web and Agent API/MCP reuse the owned Obligation Evidence query. Both
receive the same privacy-minimal Metered Usage summary and
`review_metered_usage_receipt` next action. Raw Provider signatures, prompts,
outputs, task content, PII and credentials are neither persisted nor returned.

## Durable Evidence

| Gate | Result |
| --- | --- |
| Implementation commit | PASS `b3cdfe9e5f242a785752ffee3036e6b6d638f8b8` |
| Migration | PASS `0073_metered_usage_evidence`; immutable forced-RLS Evidence and admission tables |
| JSON Schemas | PASS `147` contracts |
| Tenant protocol | PASS `115` closed operations |
| Product traceability | PASS `115` bound operations |
| Signed admission and exact replay | PASS; one utilization, one durable response |
| Conflicting duplicate and cross-Tenant access | PASS; no second charge and RLS denial |
| Additive correction | PASS; original preserved, one linked negative delta, balanced Ledger |
| Restart and recovery | PASS; PostgreSQL state reconstructs the same Web/API/MCP receipt |
| Reconciliation and repayment | PASS; no projection drift and the existing repayment path remains valid |
| Full repository check | PASS; `1257/1257` ordinary tests plus all PostgreSQL, security, transport, contract and static gates |
| Scoped P0/P1 | PASS; none open |

The PostgreSQL runtime path used a real synthetic Ed25519 signature and an
isolated local PostgreSQL 17 database. No mock success response, external
Provider call, Venue submission or funds movement was used.

## Truthful runtime state

- `sandboxOnly=true`
- `productionFundsMoved=false`
- `realFundsEnabled=false`
- external Provider execution disabled
- no deployment performed
- no production credential or signer loaded
- no mainnet, custody, withdrawal or transfer

This is CODE, local RUNTIME and local VERIFIED Evidence. It is not DEPLOYED or
production REACHABLE Evidence. Production Public Beta remains on its existing
Phase 3 release and does not inherit this M3 capability.

## Rollback and stop gate

Disable the Metered Usage admission operation and resource profile while
preserving immutable Evidence, admissions and Ledger correction history. Apply
the guarded migration down only when no later migration depends on `0073` and
after the preserved history requirement is separately reviewed.

Stop before deployment, an external Provider, a second resource/provider
profile, production credentials, new pricing/risk policy or real value. Each
requires a new named decision and current Evidence.
