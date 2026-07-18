# RISK-002A Evidence Feature Snapshot and Decision Passport Audit

Date: 2026-07-17

Result: Passed for the local/private no-real-funds Human and Agent pilot.
Production underwriting, KYC/identity, legal notices, policy/risk limits,
pricing, overrides, external providers, deployment, and real funds are not
approved by this result.

## Outcome

New authenticated evaluations no longer persist a bare deterministic result.
They persist `risk_decision.v3` with one immutable point-in-time feature
snapshot and one Decision Passport. The exact existing sandbox policy remains
unchanged and is now hashed from its cap, term, rate bands, fee, validity,
disclosure, feature definition, reason registry, and lineage.

Human Consent plus identity-reference Evidence and Agent Mandate plus Principal
binding Evidence enter the same policy and economic kernel while retaining
their entry-specific source roles. The caller still submits an empty evaluation
payload and cannot provide a feature, score, policy, Evidence reference,
Decision value, or trusted timestamp.

## Evidence Reviewed

- Domain `risk_feature_snapshot.v1` and `risk_decision_passport.v1` builders
  reject open feature shapes, non-final Evidence, missing positive lineage,
  duplicate roles, malformed hashes, wrong policy identity, and unsafe flags.
- Projection reads verify registry hash, latest snapshot hash, aggregate root,
  version, source Event, Evidence Event, Evidence hash, and finality inside the
  evaluation transaction.
- The current adverse-Obligation/frozen-CreditLine query is Tenant-locked and
  produces one domain-separated hash over exact normalized rows without
  exposing those row identities to the response.
- Migration `0023` accepts v1/v2 history, requires the complete v3 evidence
  shape, enforces hash and safety flags, and retains the existing immutable
  Risk Decision trigger and forced Tenant RLS.
- `tenant_credit_application_evaluated.v2` exposes only a bounded passport
  summary: policy/feature identity, Evidence/entity hashes, aggregate versions,
  finality, risk-state hash, reason lineage, time, and no-funds flags.
- Human HTTP and Agent MCP receipts require the passport. Agent receipts reject
  Human identity-reference roles; Human receipts require them.
- Dual-native Offer parity compares the exact policy hash and feature-set
  version before emitting its intentionally hash-free shared economic view.
- PostgreSQL tests assert two v3 Decisions, two Decision Evidence envelopes,
  complete snapshot/passport columns, exact replay, shared policy identity,
  entry-specific Evidence roles, finalized Evidence, and immutable policy hash.

## Verification

- Node runtime: `24.18.0` activated through the approved project runtime.
- Full static/unit gate: 291/291 tests passed.
- Tenant protocol: 32 operations, 48 request fixtures, 39 result fixtures,
  8 handoff fixtures, 3 capability manifests, 5 workflow receipt fixtures, and
  all invalid mutations passed.
- Schema gate: 46 contracts passed.
- Migration gate: 23 ordered up/down pairs passed.
- Clean PostgreSQL 17.10 integration matrix: 61/61 passed, including migration
  up/down/up, non-owner `NOBYPASSRLS` posture, restart, race, replay,
  reconciliation, v3 durability, and mutation rejection.
- Security boundary regression: 21/21 passed.
- Human HTTP, Agent MCP, and SDK transport regression: 35/35 passed.
- Provider sandbox regression: 5/5 passed.
- Base Sepolia/X Layer adapter and live-observer unit regression: 15/15 passed.
- `git diff --check`: passed.

## Remaining Named Gates

- Production feature and policy registry owner, review, promotion, rollback,
  kill switch, and independent model validation.
- Real Evidence providers and data contracts, KYC/identity assurance, privacy
  inventory, retention, adverse-action/legal handling, and dispute process.
- Approved risk limits, pricing, capital/loss owner, stop-loss and concentration
  controls.
- Production identities, credentials, protected deployment, monitoring,
  incident ownership, collection/custody rails, and real funds.
