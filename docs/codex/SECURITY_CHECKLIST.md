# IPO.ONE Foundation Security Checklist

- [x] Shared domain contracts separate Subject, Principal, WalletAccount, AccountBinding, Lockbox, CreditLine, Obligation, Provider, SpendRequest, SpendPolicy, Settlement, Repayment, RiskDecision, CreditEvent, AuditEvent, and AdminAction.
- [x] No generic User domain object is introduced.
- [x] CAIP-2 and CAIP-10 validators are present.
- [x] Invalid state transitions are rejected.
- [x] Disallowed Provider spend is rejected.
- [x] Over-limit credit use is rejected.
- [x] Human production lending attempts are rejected.
- [x] Financial/risk state changes emit credit or audit events in the local foundation.
- [x] Credit learning is deterministic, explainable, and emits signal/recommendation events.
- [x] Provider payments require an approved SpendPolicy decision and live Mandate at authorization and submission time.
- [x] Payment and settlement compatibility APIs project from one event-sourced Rail aggregate and do not keep a second source of truth.
- [x] Rail commands enforce idempotency, optimistic versions, quote expiry, exact integer/rational amounts, explicit finality, and append-only reversal evidence.
- [x] Rail account data is represented by opaque hashes; raw bank account fields are rejected.
- [x] The only Rail adapter is sandbox-only, loads no plugin code, makes no network call, and reports `productionFundsMoved: false`.
- [x] Boundary lint prevents modules from importing each other directly.
- [x] Migration baseline stores hashes/references and avoids raw PII fields.
- [x] The local PostgreSQL Rail runtime atomically commits command idempotency, stream version, event, Evidence, compatibility event, and outbox state.
- [x] PostgreSQL tests cover transaction rollback, concurrent writers, replay conflict, outbox lease recovery/dead-letter, inbox deduplication, and restart replay.
- [x] Public API errors use closed Problem Details, stable request IDs, and redact unexpected internal failures.
- [x] OpenAPI explicitly declares that production authentication, command idempotency, Human execution, and real funds are unavailable.
- [x] Public-beta UI loads no third-party runtime script, font, image, or analytics dependency.
- [x] Live responses set CSP, frame denial, MIME, referrer, permissions, cache, and same-origin isolation policies.
- [x] Browser and SDK sandbox sessions are high-entropy, TTL/LRU/mutation bounded, serialized per session, and explicitly not treated as authentication or tenant identity.
- [x] Live HTTP input is method/media/path/shape bounded with strict parser settings, request/connection timeouts, global fallback budgets, and adversarial regression tests.
- [x] CI repeats locked install, contract/schema/migration tests, PostgreSQL recovery, live smoke, and production dependency audit.
- [x] Local Human/workload AuthN produces a branded non-authorizing context with active Actor/Credential and exact Credential-version binding.
- [x] Local tenant AuthZ is deny-by-default across explicit capabilities, Membership/client binding, object ownership, AccessGrants, live checks, MFA, reason/idempotency/approval policy, revalidation, and awaited allow/deny audit.
- [x] Public sandbox operations remain explicitly isolated from authenticated tenant authority.

Open human-review items before production:

- [ ] Select first production execution chain.
- [ ] Select initial allowlisted Providers.
- [ ] Review all smart-contract fund paths.
- [ ] Review and activate production role assignments, dual control, multisig, timelock, break-glass, and deployment controls.
- [ ] Review compliance boundary for any future Human or Originator flow.
- [ ] Expand reviewed persistence and replay/reconciliation jobs beyond the Rail event stream.
- [x] Add an append-only double-entry ledger for the local Lockbox model.
- [ ] Review and operate production PostgreSQL, broker workers, backups, encryption, IAM, observability, and disaster recovery before any real value path.
- [ ] Replace demo SHA3-256 IDs with reviewed Keccak-compatible protocol encoding and cross-language test vectors.
- [x] Implement Mandate as a first-class, revocable Agent authorization object.
- [ ] Review and implement Human Consent/delegation semantics before any Human execution.
- [ ] Certify out-of-process KYC/KYP/Rail adapters, signatures, webhook replay protection, revocation, and failure policy.
- [ ] Require evidence-linked, idempotent signals and governed model promotion for any production learning system.
