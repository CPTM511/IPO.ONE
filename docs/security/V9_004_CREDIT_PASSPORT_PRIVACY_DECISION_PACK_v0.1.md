# V9-004 Credit Passport privacy decision pack v0.1

Status: `AWAITING_SEPARATE_HUMAN_APPROVAL`  
Prepared: 2026-07-24  
Decision ID: `V9-004-PASSPORT-PRIVACY-001`  
Current official-artifact authority: **none**

This is a decision package, not an approval. Starting V9-004 satisfied its
V9-003 prerequisite but did not choose or approve an official issuer,
verifier, retention rule, privacy boundary, revocation policy, permission, or
shareable artifact. No new Passport success operation may be implemented until
the Founder approves the exact bounded decision below.

## Recommended product boundary

Implement one private, authenticated, same-Tenant, no-real-funds
`credit_passport_artifact.v1`.

It is a point-in-time Evidence proof. It is not:

- a universal credit score;
- a current promise of eligibility or an authorization to borrow;
- a credit-bureau report, legal adverse-action notice, KYC credential, or
  production underwriting artifact;
- a public link, QR code, DID/VC, JWT, externally signed credential, or
  downloadable official report;
- valid across Tenants, verifier Actors, purposes, or expired versions.

The v1 artifact omits a 0-1000 score. Factor grades and canonical reason codes
are the only explanatory product layer.

## Proposed issuer

- issuer type: `ipo_one_tenant_gateway`
- issuer version: `ipo-one-credit-passport-local-no-funds.v1`
- issuer scope: the exact authenticated Tenant that owns the source Decision
- issuer authority: local private-pilot Evidence attestation only
- production, regulated, bureau, legal, lending, and external trust authority:
  none
- signing key, DID, certificate, external credential provider, and network:
  none

The browser cannot issue an artifact. The Tenant Gateway creates and verifies
it from locked durable state in one serializable PostgreSQL transaction.

## Proposed subject controllers

- Human artifact: the exact Human Borrower who owns the Consent-bound source
  application may create, read, and revoke it.
- Agent artifact: the exact Principal Controller bound to the Agent Subject may
  create, read, and revoke it.
- An Agent may read its own artifact through the existing authenticated Agent
  boundary only after a separately mapped exact read capability; it cannot
  nominate a verifier or broaden disclosure.
- Risk, Operations, Auditor, Provider, Developer, or another Human receives no
  implicit create/revoke authority.

Every operation continues to derive Tenant, Actor, role, Credential, and
policy version from Authentication Context. Request JSON cannot assert them.

## Proposed verifier and purpose

- verifier: one exact active Actor in the same Tenant, selected by an opaque
  server-known Actor reference;
- public, anonymous, cross-Tenant, URL-holder, wallet-holder, and
  bearer verification: prohibited;
- allowed purpose: exactly `private_credit_review`;
- one artifact binds exactly one verifier Actor and one purpose;
- verification requires fresh authentication and current Tenant Membership;
- wrong Actor, Tenant, purpose, artifact version, or source reference returns
  the same non-enumerating denial as missing or foreign state.

The verifier reads only the approved disclosure set. Verification grants no
new access to the underlying application, Subject, Consent, Mandate,
Obligation, Event payload, or raw Evidence.

## Proposed artifact lifetime and retention interpretation

- default lifetime: 15 minutes;
- maximum lifetime: 24 hours;
- trusted time: server UTC only;
- `expiresAt` must be after `issuedAt` and no later than 24 hours after it;
- online verification fails at or after `expiresAt`;
- no refresh or extension; a new artifact must supersede the old one;
- no full disclosed artifact body is retained separately after expiry;
- the durable projection retains only the bounded artifact fields needed for
  verification and audit;
- immutable Event/Evidence retains hashes, status, claim selectors, issuer
  version, purpose, verifier HMAC reference, and timestamps under the existing
  Tenant legal-retention owner;
- no raw KYC/PII, transaction history, wallet address, external identity,
  free text, raw verifier identifier, credential, or signature enters
  Event/Evidence.

V9-004 does not invent a production deletion schedule or override the existing
append-only Evidence model. A production retention/deletion/data-subject policy
remains a separate Legal/Privacy launch gate.

## Proposed selective-disclosure contract

The requester chooses a subset from this fixed allowlist:

- `decision_outcome`
- `factor_authority`
- `factor_subject_principal`
- `factor_identity_or_principal_binding`
- `factor_adverse_obligation`
- `factor_sandbox_policy_fit`
- `canonical_reason_codes`
- `reason_to_feature_lineage`
- `source_evidence_lineage`

The following fields are mandatory and cannot be redacted:

- schema and artifact version;
- artifact ID/hash;
- issuer type/version;
- source Decision Passport hash;
- exact purpose;
- verifier HMAC reference;
- issued, expiry, status, and verification times;
- `pointInTime=true`;
- `nonAuthorizing=true`;
- `sandboxOnly=true`;
- `productionAuthority=false`;
- `piiIncluded=false`;
- `rawTransactionDataIncluded=false`;
- `scoreAuthoritative=false`;
- selected-claim manifest and hash.

Rules:

- each disclosed factor must retain its canonical reason code and the exact
  source Evidence hashes/roles needed for that claim;
- removing a claim removes its factor value and claim-specific lineage;
- redaction can reduce disclosure only; it cannot add an unselected claim,
  hide mandatory safety fields, change purpose, or weaken verification;
- an absent factor is `not_disclosed`, never inferred as positive, negative,
  zero, or unknown;
- Human Consent and Agent Mandate proofs use the same artifact and Evidence
  semantics while keeping their authority roles explicit;
- no raw Event payload, account transaction, repayment detail, KYC/identity
  document, Subject display name, wallet address, or direct personal
  identifier is eligible for disclosure.

## Proposed factor presentation

Factors are closed, explainable grades:

- `verified`
- `not_verified`
- `not_applicable`
- `not_disclosed`

Grades are derived only from the source Decision's canonical reason codes and
reason lineage. The artifact cannot infer a positive grade from an absent
reason. Denied Decisions disclose only the selected, evidenced denial factor;
all other undisclosed factors remain `not_disclosed`.

No numeric composite score is included in v1. Any future 0-1000 presentation
requires a separate version and must remain explicitly non-authoritative.

## Proposed revocation and supersession

- status values: `active`, `revoked`, `superseded`, `expired`;
- `revoked` and `superseded` are terminal;
- owner/controller revocation is idempotent and requires an approved closed
  reason code;
- issuing a replacement for the same source Passport, verifier, and purpose
  atomically supersedes the previous active artifact;
- expiry is derived from trusted server time and does not require a mutable
  browser timer;
- verification fails closed for revoked, superseded, or expired artifacts;
- revocation/supersession commits projection, Event, Evidence, outbox,
  authorization-resource version, audit, admission completion, and idempotent
  response atomically;
- no reactivation, status rollback, or browser-only revocation exists.

Closed revocation reasons:

- `owner_withdrawal`
- `verifier_access_no_longer_required`
- `source_disclosure_error`
- `security_concern`

## Proposed versioned Tenant operations

After approval, V9-004 may add only:

1. `pilotCreateCreditPassportArtifact`
2. `pilotReadOwnCreditPassportArtifact`
3. `pilotVerifyCreditPassportArtifact`
4. `pilotRevokeCreditPassportArtifact`

Proposed capabilities:

- `credit_passport.create.self`
- `credit_passport.read.self`
- `credit_passport.verify.bound`
- `credit_passport.revoke.self`

All four operations require closed request/result schemas, exact resource
binding, pre-lookup admission, deny-by-default AuthZ, non-enumerating errors,
current version checks, bounded inputs, and protocol/catalog/fixture parity.
Commands require idempotency; queries reject it.

No operation lists, searches, exports, downloads, signs, publishes, refreshes,
extends, transfers, or verifies a public/cross-Tenant artifact.

## Proposed durable implementation

One ordered migration may add:

- a Tenant-owned forced-RLS `credit_passport_artifacts` projection;
- immutable source Passport hash, issuer version, subject/controller
  references, verifier HMAC reference, purpose, claim selector/hash, lifetime,
  status, version, and safety flags;
- Tenant-aware foreign keys and write guards;
- terminal-status and immutable-field triggers;
- exact active-artifact uniqueness for source/verifier/purpose;
- typed repository and reconciliation coverage.

Artifact creation/revocation uses the existing Tenant Gateway transaction:

- admission;
- authorization and same-transaction revalidation;
- source Decision/Application lock;
- typed projection write;
- immutable snapshot and registry;
- Event and Evidence;
- outbox;
- command authority and audit;
- stored idempotent response;
- admission completion.

Verification is read-only and performs current status, version, Tenant,
verifier, purpose, time, claim-manifest, source Passport, and safety checks.

## Proposed UI and Agent behavior

Credit Passport:

- presents the exact point-in-time Decision, factor grades, reason codes,
  policy, and source Evidence lineage;
- labels the artifact as private, temporary, same-Tenant, and
  non-authorizing;
- lets an eligible Human choose only the fixed disclosure fields, exact
  verifier, and lifetime within the approved cap;
- displays active, revoked, superseded, and expired states from server truth;
- never presents a browser-generated success.

Credit Track Record:

- summarizes only the exact Decision Passport and owned Obligation Evidence;
- labels non-final or invalidated Evidence explicitly;
- never imports browser or wallet history as truth;
- never generates a score or official report.

Agent:

- uses the same artifact/result semantics and stable failure codes;
- receives no browser session, Human identity detail, verifier discovery, or
  new remote transport;
- no new public/remote MCP endpoint is approved by this package.

## Evidence required

- artifact schema and valid Human/Agent conformance fixtures;
- unknown-field, mass-assignment, and unsafe-output rejection;
- every disclosed claim mapped to exact source Evidence lineage;
- selective disclosure proves subset-only behavior;
- wrong Tenant/Actor/purpose/version/source denial without enumeration;
- expired, revoked, and superseded verification failure;
- trusted-clock boundary tests;
- idempotent create/revoke and conflicting replay;
- PostgreSQL RLS, transaction rollback, restart, and reconciliation;
- Human and Agent parity on canonical Evidence semantics;
- desktop/mobile browser evidence and zero diagnostics;
- exact runtime, transport, security, schema, catalog, migration, and
  PostgreSQL gates.

## Rollback

- disable the four artifact operations in catalog and deployment capability;
- remove the UI actions while retaining the existing Decision Passport read;
- run the reviewed down migration only in the local test environment before
  any retained artifact exists;
- in a retained environment, terminally revoke active artifacts and preserve
  Event/Evidence audit history rather than deleting it;
- no source Decision, Offer, Obligation, Ledger, repayment, or existing
  Evidence state is rewritten.

Rollback cannot convert an artifact into a public credential, remove immutable
audit Evidence, or authorize V9-005.

## Explicitly excluded

- public or cross-Tenant sharing;
- bearer links, QR codes, downloads, reports, VC/DID/JWT, or signatures;
- external issuer, verifier, storage, KYC, bureau, scoring, or identity
  provider;
- raw transaction/KYC/PII export;
- numeric score;
- production underwriting, real Human lending, pricing, lender, facility,
  capital, custody, funds, chain write, mainnet, deployment, or launch-policy
  change;
- V9-005 or any later task.

## Required approval fields

Every field must be completed in one explicit Founder decision:

```text
Decision ID: V9-004-PASSPORT-PRIVACY-001
Decision: APPROVE or REJECT
Approver and role:
Approval timestamp (exact UTC):
Approval expiry (exact UTC):
Decision-pack SHA-256:
Issuer type approved: yes/no
Issuer version approved: yes/no
Same-Tenant exact-Actor verifier only: yes/no
Purpose private_credit_review only: yes/no
Human and Agent subject controllers approved: yes/no
15-minute default lifetime approved: yes/no
24-hour maximum lifetime approved: yes/no
Existing append-only hash-only Evidence retention interpretation approved: yes/no
Selective-disclosure allowlist approved: yes/no
Mandatory safety fields approved: yes/no
No numeric score in v1 approved: yes/no
Terminal revoke/supersede behavior approved: yes/no
Four Tenant operations approved: yes/no
Four AuthZ capabilities approved: yes/no
One forced-RLS migration approved: yes/no
No public/cross-Tenant/external artifact confirmed: yes/no
Privacy owner:
Evidence custodian:
Rollback owner:
V9-004 implementation unlocked: yes/no
```

An approval missing any field, changing issuer, verifier, purpose, lifetime,
retention, disclosure, permission, migration, operation, rollback, or merely
saying “continue” is insufficient.
