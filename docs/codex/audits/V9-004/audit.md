# V9-004 implementation audit

Recorded: 2026-07-24  
Completed at: 2026-07-24T10:44:55.332Z  
Owner: IPO.ONE Founder  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `ACCEPTED_BY_IPO_ONE_FOUNDER`  
Accepted at: `2026-07-24T12:11:23.997Z`  
Next gate: satisfied by IPO.ONE Founder review  
V9-005: `AUTHORIZED`

V9-004 implements one private, temporary, same-Tenant Credit Passport
artifact over the existing shared Human/Agent Decision and Evidence kernel.
It does not add a score, second Decision engine, second Evidence store, public
credential, bearer link, external verifier, production underwriting
authority, real funds, or a later V9 task.

## Human approval and immutable scope

The implementation is authorized by
`V9-004-PASSPORT-PRIVACY-001`.

- approver: IPO.ONE Founder;
- approval timestamp: `2026-07-24T10:00:39.987Z`;
- approval expiry: `2026-09-22T23:59:59.999Z`;
- approved decision pack:
  `docs/security/V9_004_CREDIT_PASSPORT_PRIVACY_DECISION_PACK_v0.1.md`;
- confirmed decision-pack SHA-256:
  `427f0a95d52b78e463a50d20c377a36d8893d68f8301fb98b52a5164741bad30`;
- Privacy owner: IPO.ONE Founder;
- Evidence custodian: IPO.ONE Founder;
- Rollback owner: IPO.ONE Founder.

The immutable approval record is
`docs/security/V9_004_CREDIT_PASSPORT_PRIVACY_APPROVAL_001.md`.
No implementation choice exceeds that record.

## Implemented product contract

### Artifact and disclosure model

`credit_passport_artifact.v1` is a versioned point-in-time projection derived
from the exact canonical `risk_decision.v3`,
`risk_decision_passport.v1`, feature snapshot, authority, and finalized
Evidence lineage.

The artifact:

- binds one issuer type and version;
- binds one Tenant, Subject, controller, exact verifier Actor, source Decision
  Passport, purpose, issue time, expiry, artifact hash, and artifact version;
- accepts only purpose `private_credit_review`;
- defaults to 15 minutes and cannot exceed 24 hours;
- permits only the approved nine selective-disclosure claims;
- discloses factor grades, canonical reason codes, reason-to-feature lineage,
  and hash-only Evidence lineage only when evidenced;
- contains no numeric score;
- requires `onlineVerificationRequired=true`, `sameTenantOnly=true`,
  `pointInTime=true`, `nonAuthorizing=true`, `sandboxOnly=true`,
  `productionAuthority=false`, `piiIncluded=false`,
  `rawTransactionDataIncluded=false`, and `scoreAuthoritative=false`;
- rejects unknown, duplicate, unevidenced, unsafe, raw-PII, raw-transaction,
  production-authority, and score-authority input.

Human Consent and Agent Mandate entry modes use the same artifact and Evidence
contract. They do not fork the obligation kernel.

### Four authenticated operations

The Tenant protocol now contains exactly these V9-004 operations:

- `pilotCreateCreditPassportArtifact`;
- `pilotReadOwnCreditPassportArtifact`;
- `pilotVerifyCreditPassportArtifact`;
- `pilotRevokeCreditPassportArtifact`.

The matching capabilities are:

- `credit_passport.create.self`;
- `credit_passport.read.self`;
- `credit_passport.verify.bound`;
- `credit_passport.revoke.self`.

Creation requires an exact owned Subject and an existing canonical Decision
Passport. Verification requires the exact same-Tenant bound verifier,
purpose, current artifact ID, hash, version, active source, trusted server
time, and active authorization resource. Wrong Actor, Tenant, purpose, hash,
version, source, or terminal state returns the same non-enumerating denial
boundary.

Issuing a replacement for the same source, verifier, and purpose atomically:

- writes the next artifact version;
- binds the new hash to the prior hash and version;
- advances the authorization-resource version;
- emits the supersession Event and hash-only Evidence;
- makes the prior hash/version unverifiable.

Revocation is terminal and idempotent. It increments the artifact version,
closes the authorization resource, records the reason code, and leaves the
append-only Event/Evidence lineage intact. It cannot reactivate the artifact.

### Persistence, privacy, and reconciliation

Migration `0027_credit_passport_artifacts` adds one forced-RLS projection with
Tenant isolation, exact source Decision foreign keys, bounded lifetime,
immutable-field guards, controlled replacement/revocation transitions, unique
source/verifier/purpose identity, and abuse-capacity classification.

The existing serializable Tenant Gateway transaction remains authoritative
for projection, aggregate Event, Credit Event, Evidence, outbox,
authorization state, idempotency result, and capacity accounting.

Credit Events retain only bounded identifiers and hashes. Verifier and
controller Actor references are HMAC-derived; no raw Actor, credential,
wallet, KYC, PII, transaction history, or reusable signature is stored in the
artifact. PostgreSQL reconciliation now covers the new projection table and
its canonical snapshot hash.

The authorization-resource transition guard permits an active-to-active
version advance only for `credit_passport_artifact`. Existing resource types
retain their previous transition constraints.

### Product surfaces

The authenticated V9 Credit Passport page now provides:

- exact Subject, Credit Intent, verifier Actor, lifetime, and disclosure
  selectors;
- issue, owner read, exact online verify, and terminal revoke controls;
- server-derived issuer, purpose, lifetime, source Passport, hash, version,
  selected disclosure, and effective status;
- explicit no-score, no-bearer, no-public-link, no-QR, no-download,
  no-credential, no-cross-Tenant, and no-production-authority boundaries.

Credit Track Record now reports exact server-loaded Decision and Evidence
finality counts without manufacturing a score or performance report.

The browser presentation independently fails closed on missing mandatory
safety flags, unselected claims, duplicate/unknown claims, unsupported grades,
numeric scores, unevidenced claims, and output mass assignment.

## Primary implementation scope

Task-specific implementation is concentrated in:

- `packages/domain/src/credit-passport-artifact.js`;
- `packages/domain/src/enums.js`;
- `db/migrations/0027_credit_passport_artifacts.up.sql`;
- `db/migrations/0027_credit_passport_artifacts.down.sql`;
- `modules/persistence/src/postgres-core-repository.js`;
- `modules/persistence/src/postgres-reconciliation-service.js`;
- `modules/authorization/src/authorization-constants.js`;
- `modules/authorization/src/authorization-policy.js`;
- `modules/authorization/src/postgres-authorization-directory.js`;
- `modules/tenant-command-gateway/src/credit-passport-handlers.js`;
- `modules/tenant-command-gateway/src/postgres-live-policy-adapter.js`;
- `modules/tenant-command-gateway/src/tenant-command-clients.js`;
- `modules/tenant-command-gateway/src/tenant-command-gateway.js`;
- `schemas/v2/credit-passport-artifact.schema.json`;
- `schemas/v2/tenant-protocol-request.schema.json`;
- `schemas/v2/tenant-protocol-result.schema.json`;
- `api/tenant-protocol/ipo-one.tenant-protocol.v1.json`;
- `api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json`;
- `packages/api-contract/src/tenant-protocol.js`;
- `packages/api-contract/index.d.ts`;
- `apps/web/src/credit-passport-presentation.js`;
- `apps/web/src/app.js`;
- `apps/web/src/index.html`;
- `apps/web/src/styles.css`;
- `apps/tenant-api/src/tenant-web-assets.js`;
- V9-004 domain, presentation, protocol, authorization, transport, security,
  and PostgreSQL tests;
- `product/v9-product-traceability.json`;
- `docs/product/V9_PRODUCT_TRACEABILITY.md`;
- `docs/codex/audits/V9-004/pre-change-mapping.md`;
- this audit.

The test-only authenticated browser host uses the reviewed protocol
conformance fixtures to exercise all four controls. It does not create a demo
route or production fallback.

## Automated acceptance and negative proof

Exact repository gate:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

Result: PASS.

- runtime: exact Node `v24.18.0`, pnpm `11.1.3`;
- boundary lint: PASS;
- schemas: 52 contracts;
- OpenAPI: 21 paths / 21 operations;
- migrations: 27 ordered up/down pairs;
- approval policy: 9 high-impact operations and 5 protective break-glass
  actions;
- abuse policy: 59 Tenant operations;
- Tenant protocol: 42 operations, 58 request fixtures, 50 result fixtures,
  8 handoff fixtures, and 5 workflow receipt fixtures;
- product traceability: 13 destinations, 60 actions, 42 bound operations;
- local JavaScript tests: 395 passed, 0 failed.

The host system currently exposes Node 26. The unqualified `pnpm check`
correctly failed its runtime guard before tests; the exact repository-required
Node 24.18.0 command above passed. No runtime check was bypassed.

Affected transport and security suites:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:transport
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security
```

Results:

- transport: 49 passed, 0 failed;
- security: 24 passed, 0 failed.

Focused Credit Passport domain and browser-presentation tests prove:

- only selected and evidenced allowlisted claims are disclosed;
- Human Consent and Agent Mandate artifacts share one contract;
- replacement binds the prior exact hash/version;
- expiry and revocation fail verification closed;
- unknown or duplicated selectors fail closed;
- unsafe browser output and mass assignment fail closed.

`git diff --check` and JavaScript syntax checks pass.

## PostgreSQL restart, RLS, and reconciliation evidence

PostgreSQL `17.10` ran in the Founder-approved isolated temporary cluster at
`/private/tmp/ipo-one-v9004-pg.R24ZGC`, port `55437`.

Full suite:

```text
DATABASE_URL=postgresql://cptmao@127.0.0.1:55437/ipo_one_v9004_test \
  pnpm test:postgres
```

Result: 70 passed, 0 failed.

The V9-004 Gateway flow inside that suite proves:

- concurrent duplicate create commits one artifact and replays the exact
  idempotent response;
- the projection survives the durable PostgreSQL path;
- wrong verifier, wrong Tenant, wrong version, superseded version, and revoked
  version fail non-enumerating;
- replacement advances artifact and authorization versions;
- revoke is terminal and idempotent;
- three append-only lifecycle events are hash-only;
- forced RLS and application-role grants allow only the reviewed data path;
- full projection/snapshot/Event/Evidence/Ledger reconciliation remains clean.

The focused Tenant Gateway PostgreSQL suite passed 37/37 before the complete
70-test PostgreSQL run.

## Real-browser evidence

Playwright drove a headed Chromium session against the authenticated,
same-origin Tenant shell and exercised:

1. issue private proof;
2. read owned proof;
3. verify the exact current hash/version online;
4. terminally revoke the artifact.

Observed:

- active artifact `credit_passport_artifact_fixture` v1;
- exact issuer, purpose, source Passport hash, artifact hash, lifetime, and
  selected disclosure;
- `Verified active` only after online verification;
- terminal `Revoked` v2 state after owner revocation;
- verification UI reset to not verified with explicit no-reactivation text;
- no public, bearer, QR, download, credential, score, or production control;
- desktop viewport: 1600 x 1100;
- mobile viewport: 390 x 844;
- browser console: 0 errors, 0 warnings.

Local browser evidence:

- `output/playwright/v9-004/credit-passport-desktop-verified.png`
  (`9085c42ba18712346aac735eb19735c1ee76b1d4ebfde780484620646a90adbc`);
- `output/playwright/v9-004/credit-passport-mobile-verified.png`
  (`220c8efdaff6b97ae8dee90f8ac4d51aeb26757ed31a9fdf64710bae7660ed47`);
- `output/playwright/v9-004/credit-passport-mobile-revoked.png`
  (`240e1c4826d731416086883ed8a48b5d7a05e96b1509bdc09d27a4c1bc8ade2c`).

The browser fixture proves UI composition and transport behavior. The separate
PostgreSQL suite above proves the actual durable, RLS-isolated server path.

## Explicit non-goals and remaining gate

V9-004 does not authorize or implement:

- a public, anonymous, bearer, cross-Tenant, or external Passport;
- a URL, QR code, download, VC, DID, JWT, transferable credential, or reusable
  signature;
- raw PII/KYC, wallet history, raw transactions, or a numeric score;
- production underwriting authority, production Human lending, real funds,
  capital, custody, contracts, chain writes, mainnet, withdrawals, deployment,
  or launch-policy changes;
- V9-005 or any later task.

The implementation was accepted by the IPO.ONE Founder at
`2026-07-24T12:11:23.997Z`. That acceptance unlocks V9-005 only. It does not
approve V9-006, production readiness, real funds, deployment, or any later
task.
