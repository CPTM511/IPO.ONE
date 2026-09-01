# M3-000 — Post-M2 Task/API/Compute Agent Credit alignment

Status: `ALIGNMENT COMPLETE — NARROW — NO RUNTIME CHANGE`

Date: 2026-09-01

Decision owner: IPO.ONE Founder / Product / Governance

Repository baseline: `origin/main` at
`06509847ab6e63889b4aa4df5928815f1abcb966`

Production baseline: `c4cc81f09f1c7aeb78871373d29ed581e428daca`

## 1. Authority and decision boundary

Founder direction accepts `PASS — PHASE 3 CLOSED` and authorizes M3-000 as
alignment only after the Phase 3 closure merge. PR #67 merged the closure at
`06509847ab6e63889b4aa4df5928815f1abcb966`; production remains live on the
already user-verified SHA and was not redeployed.

This package may identify a product problem, propose a Constitution vNext
decision and define a minimum implementation sequence. It does **not** amend
Product Constitution v1.4 and does not authorize implementation, schema or
migration changes, Provider integration, deployment, credentials, capital,
signing, mainnet, real value, funds movement, pricing, limits or policy change.

## 2. Recommendation

Recommendation: `NARROW`.

Task/API/Compute credit is not a genuinely separate product primitive. The
existing Agent Lockbox, allowlisted Provider Spend, Capital Partner Offer,
Facility, Authorization, Obligation, Ledger, settlement, repayment, Event and
Evidence kernel already represents fixed-price, purpose-bound machine-service
spend.

The narrow unsolved capability is:

> convert authenticated, provider-originated metered machine-service usage
> into deterministic, capped and reconciled usage Evidence whose charge is
> posted through the existing Facility, Obligation and Ledger.

Therefore:

- assessment A is not supported: no new Task/API/Compute product, ledger or
  obligation is justified;
- assessment B is supported and selected: use one thin metered-resource
  Facility profile over the existing Provider Spend and obligation kernel; and
- a proposed separate Task Credit, API Credit or Compute Credit product falls
  under C—redundant—and is rejected.

`Task` is optional external context, not economic truth. `API`, `inference`,
`compute`, `storage`, `RPC` and `data` are resource classes under one provider
policy, not separate products.

## 3. Exact unsolved problem and job to be done

### Target user

The primary borrower is an Agent Subject controlled by, or operating under an
exact Mandate from, an accountable Human or organization Principal. The
Principal needs the Agent to buy approved machine services before the Agent's
captured revenue is available, without giving the Agent cash, arbitrary
transfer authority or open-ended Provider access.

The Human role is the Principal/controller and protected decision maker, not a
new Human cash borrower for this profile.

### Job to be done

> When an authorized Agent consumes an approved variable-price machine
> service, let the Principal and Capital Partner know exactly what was used,
> under which accepted terms, what amount became utilization, and how it was
> repaid or became adverse—without trusting a caller-supplied invoice or
> building a second financial system.

### Why the current capability is insufficient

| Current capability | What it already proves | Narrow remaining gap |
| --- | --- | --- |
| `REQ-EXEC-002` Provider Spend | Provider, purpose, asset and amount are allowlisted and capped under a Mandate | Assumes a known spend amount; it does not prove variable usage quantity or valuation |
| TransferIntent v2 | Exact server-resolved destination, value and settlement receipt | Represents a payment intent, not an authenticated metering interval |
| signed Provider sandbox callback | Provider binding, signature, nonce, expiry and accepted/rejected outcome | Carries no resource unit, quantity, price-schedule version, billing window, correction or usage finality |
| Offer / Facility / CreditLine / Obligation | Accepted economic authority, capacity and canonical utilization | Needs a trustworthy input for the exact charge created by metered use |
| Ledger / settlement / repayment | Canonical posting, waterfall, Evidence and reconciliation | Must consume a finalized usage charge rather than an unverified invoice |
| Agent Lockbox | Captured revenue and repayment-first routing | Does not establish what machine service was consumed or correctly priced |

Fixed-price or prepaid Provider purchases are already covered and should not
be rebuilt under M3. Only post-use or incrementally metered consumption needs
the proposed addition.

## 4. Minimum genuinely new component

### Proposed component: Metered Usage Evidence

The minimum new component is one typed, versioned `MeteredUsageEvidence`
record admitted through the existing Event/Evidence and reconciliation path.
It is not a ledger, invoice system, task engine or Provider marketplace.

Minimum semantic fields:

- usage Evidence ID and content hash;
- Tenant, Agent Subject and accountable Principal references;
- exact Mandate, Facility, Authorization and Obligation references;
- approved Provider and resource-class references;
- measurement unit, quantity and bounded observation window;
- accepted price-schedule hash, currency/asset and deterministic charge;
- Provider event reference, signer/key version and observation time;
- finality, revocation, correction/supersession and reconciliation state;
- idempotency identity and prior aggregate version; and
- explicit no-funds / production-funds-moved state.

The corresponding existing Provider/resource policy needs only profile fields
for allowed resource classes, measurement units, price-schedule hash, maximum
quantity/charge per event and window, expiry and staleness. Those are extensions
of the current Provider Spend policy, not a new policy engine.

Raw prompts, model inputs/outputs, source code, task content, storage objects,
credentials and Provider-private logs are not part of this Evidence.

### Proposed Constitution vNext entry — not ratified

Proposed stable requirement:

| Proposed ID | Capability | Proposed status | Earliest mode | Gate |
| --- | --- | --- | --- | --- |
| `REQ-EXEC-005` | Mandate-bound metered machine-service usage Evidence and deterministic charge admission | `APPROVED_MVP` only after Constitution ratification | `L0_LOCAL_NO_FUNDS` | exact Provider/resource policy; signed and replay-safe usage; accepted price schedule; caps; finality/correction/reconciliation; no external Provider or real funds |

Proposed decision name:
`DEC-METERED-RESOURCE-CREDIT-001 — Metered machine service is a Provider Spend
Facility profile, not a new credit product`.

No other new stable requirement is justified. Existing `REQ-CREDIT-005..009`,
`REQ-EXEC-002..004`, `REQ-PAY-001..004`, `REQ-EVID-001..004`, `REQ-RISK-001..002`,
`REQ-UX-002`, `REQ-PRIV-001` and `REQ-AUTO-001` retain their meaning.

## 5. End-to-end value and repayment flow

```text
Agent Subject + accountable Principal
  -> exact Mandate for Provider/resource/caps/window
  -> Capital Partner-authored Offer
  -> exact acceptance and existing purpose-bound Facility
  -> existing Authorization reserves bounded capacity
  -> approved Provider supplies machine service
  -> signed MeteredUsageEvidence arrives
  -> verify identity, policy, unit, price hash, window, cap and replay
  -> finalize/reconcile or hold as unknown
  -> deterministic charge posts through the canonical Ledger
  -> existing Obligation/CreditLine utilization updates
  -> Agent revenue enters the existing Lockbox/cashflow route
  -> canonical repayment waterfall applies
  -> repayment, DPD/default/cure/loss and Evidence use existing state machines
```

No task completion, Provider HTTP 200, self-reported token count or unfinalized
callback may create utilization. Unknown, stale, disputed, corrected or
unreconciled usage cannot authorize new risk or duplicate a charge.

### Repayment capacity and failure

Repayment capacity comes from the exact captured revenue or other accepted
cashflow route disclosed in the Offer; it does not come from an assumption that
the Agent will finish a task or earn future revenue.

If captured revenue is insufficient:

1. new usage is frozen or reduced under existing policy;
2. the Obligation remains outstanding;
3. the existing schedule, DPD, default, cure, restructure, repurchase,
   write-off and Evidence transitions apply; and
4. no system action manufactures repayment, silently increases the limit or
   releases the Principal.

## 6. Parties, capital and loss

| Party | Responsibility |
| --- | --- |
| Agent Subject | Uses only the authorized machine service; has no cash, withdrawal or arbitrary transfer authority |
| Principal | Accountable Obligor; grants/revokes the exact Mandate and makes protected decisions |
| Capital Partner | Authors Offer economics and bears credit loss after contractual recoveries in any future separately approved real-value mode |
| Provider | Supplies and meters the machine service; signs usage Evidence; is not automatically a lender or loss bearer |
| IPO.ONE | Enforces authority and policy, admits Evidence, posts canonical utilization, services the Obligation, reconciles and reports |

A Provider may also be a Capital Partner only through two explicit,
independently authorized role bindings. Provider status must never imply capital
authority, Offer authorship or access to lender-private policy.

No real loss exists in the proposed L0 no-funds mode. Future capital source,
Provider payment timing, recourse, disputes, chargebacks and loss allocation
remain commercial/legal decisions requiring a separate Founder gate.

## 7. Principal and Mandate authority

The exact active Mandate must bind:

- Agent Subject and accountable Principal;
- Provider IDs and resource classes;
- measurement units and accepted price-schedule hashes;
- maximum quantity and charge per event, billing window and Facility;
- total utilization, rate, expiry and staleness bounds;
- allowed automation level and revocation behavior; and
- no withdrawal, transfer, credential delegation or Provider substitution.

Within an exact Mandate, usage admission and reconciliation may be A2/A3
automation. Creating or expanding the Mandate, accepting the Offer, changing a
Provider/resource/price/cap, resolving an adverse dispute or increasing credit
remains A4 Human or approved dual-control work.

## 8. Existing-kernel reuse map

| Existing object | M3 reuse |
| --- | --- |
| Subject | Existing Agent Subject; no second Agent identity |
| Principal | Existing accountable Human/organization Principal |
| Mandate | Adds exact Provider/resource/metering bounds; remains canonical authority |
| Credit Intent | Requests a purpose-bound machine-service Facility |
| Risk Decision | Existing deterministic and explainable policy only |
| Capital Partner Offer | Owns limit, price/fee, term, schedule, purpose and conditions |
| Facility | Thin `metered_machine_service` profile; no new product kernel |
| CreditLine | Existing capacity/utilization projection; never authority |
| Authorization | Reserves capacity before admitted usage |
| Obligation | Existing canonical debt and servicing state |
| Ledger | Posts deterministic charges, repayment and correction; no Usage Ledger |
| Payment | Existing Provider settlement and Lockbox cashflow records |
| Repayment | Existing waterfall and receipts |
| Event | Typed usage admission/finality/correction events in the same stream |
| Evidence | New MeteredUsageEvidence type under the same Evidence model |
| Credit State | Existing repayment/adverse outcome history; no universal score |
| Reconciliation | Provider usage, charge, Ledger and Obligation must agree before new risk |

## 9. Threat model

| Threat | Required fail-closed control |
| --- | --- |
| Forged Provider usage | Bound Provider identity, signed closed schema, exact key version and least-privilege verifier |
| Replay or duplicate billing | Provider event ID plus window/sequence idempotency; conflicting duplicate is an incident |
| Inflated quantity or unit confusion | Closed resource/unit registry, maximum quantity and deterministic integer arithmetic |
| Price drift or surprise pricing | Exact accepted price-schedule hash; changed or expired price requires a new Offer/acceptance where economics change |
| Usage outside Mandate | Recheck Provider, resource, Facility, window, expiry, revocation and remaining caps at admission |
| Late/out-of-order events | Monotonic window sequence; hold unknown until reconciliation; no unsafe retry |
| Provider/Agent collusion | Capital Partner-visible aggregate Evidence, caps, anomaly alerts and independently reconcilable receipts |
| Partial service or dispute | Preserve original Evidence; correction is additive and linked; disputed usage cannot silently rewrite Ledger truth |
| Callback compromise | Rotation/revocation, short validity, nonce consumption, redacted logs and incident freeze |
| Privacy leakage | No prompts, outputs, source, object contents, secrets or raw behavioral payloads in Evidence |
| Provider outage | Existing Facility remains readable; new usage stops; no fabricated settlement or utilization |
| Revenue failure | Freeze new usage; existing DPD/default/loss lifecycle remains authoritative |

## 10. Privacy and data boundary

Store only the minimum economic proof: resource class, normalized unit,
quantity, time window, Provider reference, price-schedule hash, calculated
amount, authority references and integrity/finality/reconciliation metadata.

Keep off canonical/public Evidence by default:

- prompts, responses and model traces;
- task descriptions and customer payloads;
- code, datasets and storage objects;
- IP addresses and unnecessary device/behavior telemetry;
- Provider credentials, API keys, signatures and private billing policy; and
- raw Principal/Human PII.

Detailed Provider records, if ever required, remain encrypted offchain,
Tenant-scoped, retention-bound and separately permissioned. Hashes do not make
sensitive content safe to publish when the source is guessable.

## 11. Launch-mode proposal

The first implementation, if separately approved, begins only at
`L0_LOCAL_NO_FUNDS` using one synthetic Provider, one resource class, one unit,
one price schedule, one Agent/Principal, one Capital Partner Offer and one
Facility.

All runtime flags must state:

- `sandboxOnly=true`;
- `productionFundsMoved=false`;
- `realFundsEnabled=false`;
- external Provider execution disabled; and
- no mainnet, signer, custody, withdrawal or transfer.

An L2 no-funds deployment, external Provider sandbox, L3 testnet profile or
real-value proposal would each require a later named decision and current
Evidence. M3-000 proposes no launch-policy change.

## 12. Explicit non-goals

- no Task Ledger, Compute Ledger, API Credit Ledger or second Obligation;
- no task marketplace, job scheduler, orchestration framework or workflow
  engine;
- no model router, compute cloud, storage provider or Provider marketplace;
- no generic invoicing, accounts-payable or subscription billing platform;
- no Provider credential custody or arbitrary Agent API keys;
- no caller-supplied charge, price, unit or settlement truth;
- no new risk model, universal score or automatic policy promotion;
- no real Provider payment, capital, custody, mainnet or real funds;
- no Human cash lending; and
- no M3 implementation under this alignment authority.

## 13. Minimum implementation sequence — proposal only

Implementation is not authorized. If the Founder accepts `NARROW`, the minimum
sequence is:

1. **M3-GOV-001 — Constitution vNext ratification.** Add only
   `REQ-EXEC-005` and `DEC-METERED-RESOURCE-CREDIT-001`, with an explicit
   v1.4-to-vNext crosswalk. No runtime change.
2. **M3-RESOURCE-001 — one L0 no-funds vertical slice.** Add the closed
   resource policy and MeteredUsageEvidence contracts, deterministic charge
   admission, PostgreSQL durability, canonical Ledger/Obligation reuse and
   fail-closed correction/reconciliation as one issue.
3. **M3-RESOURCE-002 — co-equal product acceptance.** Expose the same slice
   through Principal Web and versioned Agent OpenAPI/SDK/MCP, add one signed
   synthetic Provider adapter, then prove replay, restart, recovery, denial and
   visible-click/API parity.

Stop again before deployment, external Provider integration, real value or a
second resource/provider profile.

## 14. Definition of M3 success

M3 succeeds only if one no-funds Agent can, without internal IDs or database
intervention:

1. operate under an exact Principal Mandate and accepted Capital Partner Offer;
2. consume one approved metered resource within all caps;
3. produce signed, privacy-minimal and replay-safe usage Evidence;
4. deterministically create one canonical utilization charge;
5. repay it through captured Lockbox revenue or truthfully enter an adverse
   state;
6. recover the same next action after refresh, re-login, restart and replay;
7. expose the same facts through Human Web and Agent API/SDK/MCP; and
8. reject wrong Provider, unit, price version, window, duplicate, stale,
   revoked, over-cap, disputed and unreconciled inputs.

Success does not require a new product family, Provider marketplace, external
integration, production deployment or real funds.

## 15. Proposed implementation issue contract

This section is a reviewable scope, not implementation authority.

### Context and scope

Implement only the single `metered_machine_service` L0 no-funds vertical slice
described above. Reuse the current signed Provider sandbox, TransferIntent,
Facility, Authorization, Obligation, Ledger, Lockbox, Event/Evidence,
reconciliation and Tenant Command Gateway.

### Likely files if later approved

- one new versioned MeteredUsageEvidence schema and one resource-policy schema
  extension under `schemas/v2/`;
- focused domain logic under `packages/domain/src/`;
- Provider admission and Gateway transaction handling under
  `modules/provider-sandbox/` and `modules/tenant-command-gateway/`;
- one additive PostgreSQL migration for immutable usage Evidence and its
  idempotency/correction projection;
- Tenant protocol, OpenAPI/SDK/MCP and Principal presentation adapters;
- unit, schema, security, PostgreSQL/RLS, replay/restart and browser/API tests;
  and
- the eventual approved Constitution/traceability update.

No new dependency, service, queue, database, ledger, contract or cloud resource
is proposed.

### Given / When / Then acceptance

- Given an exact active Mandate, Facility, resource policy and accepted price
  schedule, when one valid signed usage event is finalized, then exactly one
  capped charge updates the canonical Ledger, Obligation and CreditLine.
- Given a replay of identical Evidence, when it is admitted again, then the
  same result is returned with no second charge.
- Given conflicting, forged, stale, revoked, wrong-unit, wrong-price,
  out-of-window, over-cap or unreconciled Evidence, when admission is attempted,
  then no utilization or external action occurs and a reason-coded Evidence
  record remains queryable.
- Given a correction, when it is authorized and reconciled, then the original
  record remains immutable and the canonical Ledger receives an additive
  correction rather than history rewrite.
- Given restart/replay and Human/Agent re-entry, when the workspace recovers,
  then both surfaces show the same charge, repayment/adverse state and next
  action.

### Prospective test commands

```text
pnpm run check:schemas
pnpm run check:tenant-protocol
pnpm run check:product-traceability
node --test <M3 resource domain and gateway tests>
DATABASE_URL=<isolated-postgres> node --test <M3 PostgreSQL/RLS tests>
pnpm check
```

### Security checklist

- [ ] Provider identity, key version, signature, nonce and validity window are
      verified before admission.
- [ ] Tenant, Actor, Subject, Principal, Mandate, Facility, Provider and object
      authorization are rechecked in one Gateway transaction.
- [ ] Unit, quantity, price hash, charge, caps, version and arithmetic are
      server-derived and closed.
- [ ] Duplicate, conflicting, late, stale, revoked, disputed and unknown inputs
      fail closed.
- [ ] Original Evidence is immutable; correction is linked and additive.
- [ ] Raw prompts, outputs, task content, PII and credentials are absent from
      schema, Evidence, logs and fixtures.
- [ ] No withdrawal, transfer, production funds, external Provider or policy
      promotion authority is introduced.

### Data, migration and rollback

Any later migration must be additive, Tenant/RLS-bound and preserve immutable
Evidence plus idempotency. It must not repurpose existing settlement or Ledger
rows. Rollback disables the resource profile and admission operation, preserves
all admitted Evidence and Ledger corrections, and removes no history.

### Required completion Evidence

Bind exact commit, migration head, schema/API versions, policy/config hashes,
positive and denial tests, PostgreSQL restart/replay, browser and Agent API/MCP
acceptance, reconciliation, disabled external/real-value capabilities and zero
open scoped P0/P1.

## 16. Remaining decisions and stop gate

Founder review is required to accept or reject:

- recommendation `NARROW`;
- proposed `REQ-EXEC-005` and decision semantics;
- one-resource L0 implementation scope; and
- whether a Provider price schedule is Offer economics or a separately
  accepted, Offer-bound schedule reference. It may never drift silently.

M3-000 is complete at the alignment level. Stop before Constitution edits or
runtime implementation. The current product, launch policy, production
deployment and real-value gates remain unchanged.

Permission/funds/deployment impact: **none**.
