# V9-002 implementation audit

Recorded: 2026-07-24  
Completed at: 2026-07-24T04:59:39Z  
Owner: IPO.ONE Founder  
Branch: `codex/commercial-access-release`  
Source `HEAD`: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Status: `IMPLEMENTED_UNVERIFIED`  
Review gate: `ACCEPTED_BY_IPO_ONE_FOUNDER`  
Accepted at: `2026-07-24T08:13:35Z`

V9-002 productizes the Human and Agent Request Credit journey over the
existing shared no-real-funds protocol. It does not approve production
underwriting, pricing, a lender, a facility, real disbursement, deployment,
mainnet use, credentials, or the successor task.

## Source and prerequisite disposition

- The package source identity matched the current branch and `HEAD` before
  work began.
- The accepted, uncommitted AUDIT-001 through V9-001 worktree was preserved.
- V9-001 was accepted by the IPO.ONE Founder at
  `2026-07-24T04:32:54Z`; that acceptance is recorded in its audit.
- The existing Intent, Decision, Offer, acceptance, execution, authority,
  authorization, accounting, Event, Evidence, and reconciliation boundaries
  are mapped in `pre-change-mapping.md`.
- No commit was created by this task. The exact review base remains the source
  `HEAD` above plus the accepted stacked worktree.

## Implemented task delta

### Versioned review binding

`apps/web/src/request-credit-review-binding.js` adds the closed
`request_credit_review_binding.v1` browser contract.

It accepts only an already-validated Human or Agent Offer workflow receipt and
derives an immutable review containing:

- exact entry mode, Subject, and Consent/Mandate authority;
- requested asset, principal, purpose, term, repayment frequency, and
  installment count;
- Decision ID, policy version, Decision hash, and Decision Passport hash;
- Offer ID, principal, APR, origination fee, schedule, disclosure, validity,
  Offer hash, and terms hash;
- one bounded server receipt record for each completed pre-acceptance step;
- explicit `sandboxOnly=true`, `productionFundsApproved=false`,
  `fundsAuthority=false`, and `credentialsIncluded=false`.

Unknown fields, accessors, symbols, malformed values, unsafe receipt flags,
authority/provenance drift, or economic drift fail closed. The contract is
in-memory only and carries no credential, signature, CSRF value, private key,
or funds authority.

### Human Request Credit

The authenticated Human surface now:

- shows `—` instead of manufacturing a `$0.00` Offer before evaluation;
- renders the exact returned principal, APR, fee, repayment frequency,
  installment count, maturity, validity, disclosure, Consent, Offer hash, and
  terms hash;
- continues to render canonical reason codes and finalized Evidence
  provenance through the existing Decision Passport;
- binds acknowledgement and acceptance to the visible Subject, Consent, and
  request economics;
- unchecks and disables acknowledgement immediately when any visible
  authority or economic input changes;
- offers a fresh evaluation instead of accepting a stale visible review;
- reasserts the exact binding immediately before sending acceptance;
- keeps all six server result receipts visible after Offer acceptance and
  no-funds execution.

The six visible receipt stages are:

1. `pilotReadHumanSelf` /
   `tenant_human_subject_view.v1`;
2. `pilotRequestCredit` /
   `tenant_credit_intent_created.v1`;
3. `pilotReadCreditApplication` /
   `tenant_credit_application_view.v1`;
4. `pilotEvaluateCreditApplication` /
   `tenant_credit_application_evaluated.v2`;
5. `pilotAcceptCreditOffer` /
   `tenant_credit_offer_accepted.v1`;
6. `pilotExecuteSandboxObligation` /
   `tenant_sandbox_obligation_executed.v1`.

Each row is derived from the authenticated server protocol result and exposes
only operation, response schema, request ID metadata, and committed/replayed
state.

### Agent Request Credit

Request Credit now preserves the selected Agent mode and presents a dedicated
machine journey:

- Principal-controlled Subject and Mandate setup;
- Intent and deterministic Decision/Offer readiness;
- exact Offer/terms-hash acceptance readiness;
- signed non-withdrawable no-funds execution readiness;
- versioned Agent Offer and Obligation workflow receipts;
- explicit economic parity dimensions and intentionally different authority
  and transport dimensions.

The browser does not load Agent credentials or execute as an Agent. It routes
to the existing Principal setup and authenticated Agent API handoff. The
surface explicitly says `No lender or facility is live` and excludes a
capital provider, real disbursement, withdrawable balance, mainnet action, and
production underwriting.

## Files in the V9-002 review scope

Task-specific implementation and tests:

- `apps/web/src/request-credit-review-binding.js`
- `apps/web/src/app.js`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/request-credit-review-binding.test.js`
- `apps/web/test/static-ui.test.js`
- `apps/tenant-api/src/tenant-web-assets.js`
- `apps/tenant-api/test/transport-conformance.test.mjs`
- `modules/tenant-command-gateway/test/credit-acceptance-handlers.test.js`
- `packages/sdk/test/agent-sandbox-obligation-client.test.js`
- `docs/codex/audits/V9-002/pre-change-mapping.md`
- `docs/codex/audits/V9-002/audit.md`

Prerequisite record correction:

- `docs/codex/audits/V9-001/audit.md` now states that its review gate was
  accepted before V9-002, while preserving all production and later-task
  denials.

Local browser evidence, ignored by release source control:

- `output/playwright/v9-002/human-server-receipts.png`
- `output/playwright/v9-002/human-executed-journey.png`
- `output/playwright/v9-002/agent-request-credit.png`

## Contract, migration, catalog, and policy disposition

- Database migrations: unchanged; still 26 ordered up/down pairs.
- Tenant protocol catalog: unchanged; still 38 operations.
- OpenAPI: unchanged; still 21 paths and 21 operations.
- Tenant request/result schemas: unchanged.
- AuthZ capabilities, roles, policies, object ownership, and MFA rules:
  unchanged.
- Admission quotas and classifications: unchanged.
- Pricing and origination fee policy: unchanged. The UI renders the
  server-returned historical no-funds fee and does not calculate or approve a
  new fee.
- Ledger, Event, Evidence, outbox, versioning, and reconciliation:
  unchanged.
- Dependencies and lockfile: unchanged by V9-002.
- External networks, chain writes, deployment, signer, custody, credentials,
  and funds paths: none added or used.

The new browser module was added to the fixed same-origin web asset allowlist.
It is covered by transport conformance and the existing restrictive CSP.

## Acceptance and negative security proof

### Economic parity

The checked-in Human HTTP and Agent MCP Offer receipts continue to compare the
same principal, purpose, term, policy, approved amount, APR, origination fee,
repayment frequency, installment count, disclosure, and schedule offsets.
The shared Obligation, Ledger, execution, and repayment parity fixtures also
pass.

### Acceptance drift

Focused Gateway tests prove, for both Human and Agent entry modes:

- stale Offer hash rejects with `offer_terms_mismatch`;
- stale terms hash rejects with `offer_terms_mismatch`;
- revoked Human Consent rejects with `authority_not_current`;
- revoked Agent Mandate rejects with `authority_not_current`;
- no acceptance plan or write is produced after those failures.

Browser binding tests prove Subject, Consent/Mandate, entry mode, visible
principal, purpose, term, frequency, installment, receipt safety, and fee
drift all fail closed.

Agent SDK tests additionally prove:

- caller authority fields are rejected;
- Subject or Mandate mismatch is rejected before any command;
- an Offer above the active Mandate per-action limit is rejected before any
  command;
- operation/result drift is rejected;
- exact replay remains idempotent.

The Gateway still locks and revalidates Offer, Intent, Decision, Subject,
Principal, Consent/Mandate, identity Evidence, risk state, capacity, and
duplicate acceptance state inside the existing serializable transaction.

## Browser evidence

The browser fixture served the production shell assets and authenticated
Tenant protocol results on loopback only. No browser-only financial success
result was introduced.

Verified Human path:

- create pseudonymous sandbox Human Subject;
- create purpose-limited Consent and synthetic no-PII identity reference;
- request and evaluate `$120.00` of no-funds credit;
- inspect approved principal, 9% APR, `$0.00` returned fee, two monthly
  installments, validity, disclosure, Consent, Offer hash, terms hash,
  reason codes, and Decision Passport;
- change the visible amount to `$121.00`;
- observe acknowledgement disabled, acceptance disabled, and a fresh-Offer
  requirement while the reviewed Offer remains `$120.00`;
- restore the exact visible economics;
- acknowledge and accept the exact Offer;
- execute the signed non-withdrawable sandbox Obligation;
- observe all six authenticated server receipts, including acceptance and
  execution, after the UI changes to the Obligation view.

Verified Agent path:

- select Agent mode;
- navigate to Request Credit without being forced back to Human;
- observe `Agent entry · shared kernel`;
- observe bounded Principal/Mandate readiness and versioned Agent receipts;
- observe `No lender or facility is live`;
- observe no credential, private key, reusable signature, funds authority, or
  Agent execution in the browser.

Browser console result: 0 errors, 0 warnings.

The first visual pass exposed that the receipt timeline became hidden after
acceptance. It was moved outside the conditional Offer/Obligation cards. A
second screenshot exposed insufficient contrast after that move; the
component now owns its dark background. Agent navigation also exposed a stale
Human eyebrow; Request Credit now derives that label from the selected entry
mode. All three issues were fixed and reverified before the final evidence was
captured.

## Automated gates

Exact repository gate:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm check
```

Result: PASS.

- runtime: Node `v24.18.0`, pnpm `11.1.3`;
- boundary lint: pass;
- schemas: 51 contracts;
- OpenAPI: 21 paths / 21 operations;
- migrations: 26 ordered up/down pairs;
- Tenant protocol: 38 operations;
- product traceability: 13 destinations / 60 actions / 38 bound operations;
- local JavaScript tests: 382 passed, 0 failed.

Affected transport and security gates:

```text
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:transport
npx -y node@24.18.0 /opt/homebrew/bin/pnpm test:security
```

Results:

- transport: 49 passed, 0 failed;
- security: 24 passed, 0 failed.

Focused syntax, UI binding, static UI, fixed-asset, acceptance handler, and
Agent SDK tests also passed. The final HTML contains 470 unique static IDs and
`git diff --check` passes.

## PostgreSQL process-restart evidence

PostgreSQL 17.10 ran in a new isolated temporary cluster:

```text
/private/tmp/ipo-one-v9002-pg.OW2h3j
```

It used Unix socket
`/private/tmp/ipo-one-v9002-pg.OW2h3j/socket`, port identifier `55438`, an
empty listen address, local trust inside the mode-restricted temporary
directory, and rejected host authentication. No Homebrew service or TCP
listener was used.

The authority-preserving test connection was:

```text
postgresql://cptmao@localhost:55438/ipo_one_v9002_test?host=%2Fprivate%2Ftmp%2Fipo-one-v9002-pg.OW2h3j%2Fsocket
```

Full PostgreSQL result:

```text
pnpm run test:postgres
```

- tests: 70;
- passed: 70;
- failed: 0;
- durable Human/Wallet authentication, Tenant isolation, Event recovery,
  replay, Gateway restart, and reconciliation: pass.

The actual PostgreSQL process was stopped with fast shutdown and restarted
from the same data directory and Unix socket. A read-only query returned:

```text
26|0001_mvp_foundation|0026_idempotent_wallet_session_invalidation
```

The focused durable Human authentication suite then passed 5/5 after that
physical restart.

One diagnostic query initially used the nonexistent column name
`migration_id`; PostgreSQL rejected it. The table definition was inspected,
the read-only query was corrected to the actual `name` column, and the
persistence check passed. No product code, schema, privilege, or data was
changed to resolve that diagnostic error.

## Security boundaries

- Exact object authorization remains server-side and non-enumerating.
- Human acceptance requires current Consent and identity Evidence.
- Agent acceptance requires a current active Principal-approved Mandate.
- No browser field supplies Tenant, Actor, role, authority, or authorization
  context.
- No self-reported positive underwriting Evidence is introduced.
- No raw KYC/PII, credential, private key, reusable signature, or secret is
  persisted, logged, rendered, or placed in a fixture by V9-002.
- Acceptance and execution remain idempotent and return versioned protocol
  results.
- No real funds, withdrawable value, mainnet action, lender, facility,
  production underwriting, or production readiness claim exists.

## Rollback and known limitations

Rollback is limited to the V9-002 task-specific files listed above, removal of
the new review-binding module/tests, and restoration of the fixed asset list.
No database or onchain rollback is required because V9-002 introduced no
migration, deployment, or chain mutation.

Known limitations:

- Agent financial commands remain outside the browser and require the
  approved authenticated local Agent runtime.
- A page reload can recover durable Subject, Consent/Mandate, Offer, and
  Obligation state through existing server reads, but in-memory per-command
  transport metadata is not reconstructed as a historical receipt list.
  Durable business Evidence remains server authoritative.
- The displayed origination fee is the exact current no-funds policy result;
  V9-002 does not approve production pricing.
- Catalog availability is not object authorization or production readiness.

## Next task

`V9-003`: `AUTHORIZED_BY_ACCEPTANCE`.

The IPO.ONE Founder accepted the V9-002 review gate at
`2026-07-24T08:13:35Z` and instructed Codex to continue. That acceptance
satisfies the V9-003 prerequisite only. It does not approve V9-003, V9-004,
production readiness, deployment, real funds, pricing, permissions, or any
later human gate.
