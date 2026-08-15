# V9-004 pre-change mapping

Recorded: 2026-07-24  
Source branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Prerequisite: V9-003 accepted by the IPO.ONE Founder at
`2026-07-24T09:53:21Z`

## Existing authoritative Decision path

The current shared Human/Agent kernel already creates an immutable,
Evidence-derived point-in-time Decision:

- `pilotEvaluateCreditApplication` locks the exact Credit Intent, Subject,
  Principal, Consent or Mandate, synthetic Human identity reference when
  applicable, and Tenant risk state inside the durable Gateway transaction.
- `risk_feature_snapshot.v1` freezes the checked-in feature definition,
  policy hash, Tenant-bound risk-state attestation, finalized source Evidence,
  aggregate versions, and trusted evaluation time.
- `risk_decision.v3` binds the outcome, policy, reason codes, feature snapshot,
  and exact Human Consent or Agent Mandate authority.
- `risk_decision_passport.v1` binds the Decision hash, feature-set and policy
  versions, source Evidence hashes, factor-to-reason lineage, trusted time, and
  the explicit `nonAuthorizing=true`, `sandboxOnly=true`, and
  `productionAuthority=false` safety flags.
- Decision, Passport, normalized projection, Event, Evidence, outbox,
  aggregate version, command response, and idempotency record commit in one
  serializable PostgreSQL transaction.
- `pilotReadCreditApplication` reauthorizes the exact owned application and
  returns the bounded Decision Passport summary to both Human HTTP and Agent
  SDK/MCP flows.

The historical educational process-local score is not part of this authority
path and cannot become canonical credit truth.

## Existing authoritative performance Evidence

- `pilotReadOwnObligationEvidence` reauthorizes one exact Actor-owned
  Obligation and returns at most 50 hash-only Evidence summaries per page.
- Each summary binds Evidence ID/hash, Event type, aggregate type/ID/version,
  exact Obligation, payload hash, source finality, occurrence time, and
  recording time.
- Pending, confirmed, finalized, reorged, and invalidated finality states remain
  explicit. The browser cannot relabel them.
- Human and Agent callers use the same canonical Evidence records and
  pagination semantics through separate authenticated transports.
- The current response contains no raw Event payload, transaction history,
  wallet address, KYC document, raw identity fact, credential, or reusable
  signature.

## Existing product composition

- Request Credit renders one verified Human Decision Passport presentation
  with policy, source count, reason explanations, lineage, and compact hashes.
- Credit Passport is currently a thin navigation/status page. It does not own
  a standalone artifact, issuer, verifier, purpose, expiry, revocation,
  supersession, retention, or selective-disclosure lifecycle.
- Credit Track Record currently reports only whether an exact owned
  Obligation and its redacted Evidence page are loaded. It does not create
  factor grades, a performance report, or a portable credential.
- `credit_passport.read_decision_passport` and
  `credit_track_record.read_evidence_derived_record` are mapped to existing
  owner reads.
- `credit_passport.create_shareable_proof` is intentionally
  `SPECIFIED_DISABLED`.
- Wallet-history import, score impact, and report generation remain simulation
  or absent. They are not allowed inputs to product truth.

## Missing official-artifact boundary

The repository has no approved or implemented:

- Passport/report issuer identity or issuer version;
- exact verifier identity, Tenant, Actor, or audience binding;
- permitted verification purpose;
- artifact lifetime or retention rule;
- revocation or supersession state machine;
- selective-disclosure allowlist and mandatory safety claims;
- replay protection across Tenant, verifier, purpose, or artifact version;
- artifact create/read/verify/revoke operation;
- artifact AuthZ capability or admission class;
- artifact projection, migration, Event, Evidence, outbox, SDK, or UI workflow;
- public credential, URL, QR code, VC/DID/JWT, signature, export, or external
  verification adapter.

This is a deliberate human gate, not an implementation omission that Codex may
fill by inference. The package Human Approval Matrix reserves official
Passport/report issuer, privacy, retention, revocation, and verifier choices to
the Founder.

## Safe V9-004 implementation boundary after approval

The recommended smallest implementation is a private, same-Tenant,
authenticated, no-real-funds artifact:

1. add one closed `credit_passport_artifact.v1` contract before any new success
   action;
2. derive every disclosed claim from the exact
   `risk_decision_passport.v1` and owned Evidence semantics;
3. omit a 0-1000 score entirely;
4. allow only fixed factor/outcome/lineage claims and mandatory safety
   metadata;
5. bind one exact issuer version, Tenant, Subject, verifier Actor, purpose,
   issued time, expiry, artifact version, and source Passport hash;
6. verify online through the Tenant Gateway only;
7. fail verification for wrong Tenant, Actor, purpose, version, time,
   revocation, supersession, source mismatch, or unsafe/redaction drift;
8. make revocation terminal and idempotent;
9. supersede an older artifact atomically when an approved replacement is
   issued for the same source, verifier, and purpose;
10. keep public/anonymous/cross-Tenant/external verification, downloads,
    signatures, credentials, and production claims disabled.

## Human decision required before implementation

`V9-004-PASSPORT-PRIVACY-001` must approve the exact issuer, verifier, subject
controllers, purpose, lifetime, retention interpretation, disclosure fields,
revocation/supersession behavior, permissions, Evidence owner, rollback, and
approval expiry.

The IPO.ONE Founder approved the exact decision pack SHA-256
`427f0a95d52b78e463a50d20c377a36d8893d68f8301fb98b52a5164741bad30`
at `2026-07-24T10:00:39.987Z`, with approval expiry
`2026-09-22T23:59:59.999Z`. The immutable approval record is
`docs/security/V9_004_CREDIT_PASSPORT_PRIVACY_APPROVAL_001.md`.

Before that decision was approved:

- New Tenant operation: none.
- New success mutation: none.
- Catalog/AuthZ/admission capability change: none.
- Migration or database state change: none.
- Event/Evidence/outbox change: none.
- Public or shareable artifact: none.
- Dependency, external network, signing, credential, deployment, mainnet, or
  real-funds change: none.

V9-005 is not authorized and remains `NOT_STARTED`.
