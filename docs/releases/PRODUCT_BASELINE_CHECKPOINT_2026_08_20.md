# IPO.ONE Product Baseline Checkpoint — 2026-08-20

Verdict: **PASS — DEPLOYED AND USER-VERIFIED**

This record checkpoints the first fully closed Human-Agent Credit Loop
baseline. It binds the canonical public product definition, the deployed
no-real-funds product, the accepted Human and Agent lifecycle, and the exact
release evidence from which `v0.1.0` is frozen.

## Checkpoint identity

| Field | Exact value |
|---|---|
| Product checkpoint SHA | `4356680ae8c9ace64d8029de943aa2a16ecf81ef` |
| Canonicalization candidate SHA | `2aec35b59b107fe86a9411187ab69f70e7273613` |
| Parent/base SHA | `a670e59eb15360ab0e4901b58fc724312445e0d0` |
| Candidate tree | `2fea1629bdcb7a1bf71b30e7e64711e92df188cb` |
| Production deployment | `dpl_8iBxcDq1fHWZzy52mgzWiPmmiHp8` |
| Production domain | [https://ipo.one](https://ipo.one) |
| Database migration level | `0063_selected_human_role_enrollment` |
| Rollback deployment | `dpl_B7VcAfv5CHrHrermwr8K71aswDNp` |
| Rollback release | `f8bc87c034ad0257cd2b4fdbdb3898dc8cbea194` |

The candidate and product-checkpoint commits have the same product tree. The
product checkpoint SHA is the merge commit on `main`; the candidate SHA is the
exact release identifier reported by the verified deployment. The final
annotated tag and GitHub Release point to the subsequent `main` commit that
contains this record. This explicit two-identity construction avoids an
impossible self-referential commit hash and does not change product code.

## Canonical public product

- `README.md` is the authoritative public product document for **IPO.ONE —
  Verifiable Credit Infrastructure for Humans and Agents**.
- The signed-out website presents `BORROW. BUILD. PROVE.`, one shared Human and
  Agent Credit Loop, Principal-controlled Agent authority, Capital Providers,
  Evidence, Credit State, Passport, interfaces, and adapter architecture.
- The Human product entry and Agent API are visible and operable from the
  public surface. Capital Provider and developer roles are truthfully
  described without representing disabled real-value capability as active.
- GitHub repository description is `Verifiable credit and obligation
  infrastructure for Humans and AI Agents.` and the homepage is
  [https://ipo.one](https://ipo.one).
- No historical release, audit, security, Evidence, or checkpoint record was
  removed or rewritten.

## CI and verification

| Evidence | Result |
|---|---|
| Candidate Quality Gate run `32354952070` | PASS |
| Candidate Quality Gate run `32354930973` | PASS |
| Product checkpoint `main` Quality Gate run `32355841411` | PASS |
| Local aggregate tests | PASS — 1,097/1,097 |
| Fresh isolated PostgreSQL 17 integration | PASS — 88/88 |
| Security suite | PASS — 34/34 |
| Transport suite | PASS — 82/82 |
| Real-browser click-path | PASS — 4/4 |
| Agent credit suite | PASS — 41/41 |
| Focused Agent positive, negative, and restart paths | PASS |
| Production dependency audit | PASS — no known production vulnerabilities |

The canonicalization changed public presentation and documentation only. It
introduced no schema, migration, dependency, protocol, authentication,
authorization, persistence, execution, risk, or infrastructure-topology
change. The full exact-candidate regression therefore verifies the accepted
Human-Agent implementation while the deployed checks below prove production
reachability at the new release.

## Production verification

- Vercel inspection reported the exact candidate as `READY`, production
  target, Node.js 24 runtime, with no untracked build input.
- `https://ipo.one/livez` returned `alive` and release
  `2aec35b59b107fe86a9411187ab69f70e7273613`.
- `https://ipo.one/readyz` returned `ready`, deployment role `primary`, profile
  `closed_non_funds_pilot`, and `realFundsEnabled: false` for the same release.
- `https://ipo.one/.well-known/ipo-one.json` returned the same release and
  advertised the Human console, Agent API, and OpenAPI surfaces. Current-user
  chain writes, external Provider execution, production signers, withdrawals,
  venue writes, and real funds remained disabled.
- Real Chromium loaded the deployed desktop and 390 x 844 mobile surfaces with
  no horizontal overflow, console error, or warning. The visible primary
  action opened the sign-in flow. Human, Agent, Capital Provider, and Developer
  entry-mode copy was present.
- `/auth/v1/options` exposed the bounded Human wallet sign-in methods and role
  choices. A credential-free call to `/tenant/v1/operations` failed closed
  with `authentication_required`.

## Human acceptance

Status: **PASS**

The accepted production Human lifecycle remains the H-01 through H-14 journey
recorded in `docs/releases/FINAL_CREDIT_LOOP_001_COMPLETION.md`: selected-role
SIWE, Human Subject, Consent, Credit Intent, explainable Decision and Offer,
accepted shared Obligation, controlled no-funds execution, repayment, terminal
Credit Outcome, durable Credit State, Credit Track Record, Decision Passport,
Evidence, logout/login, refresh, and server-derived recovery.

The exact canonicalization candidate reran the Human-critical repository,
PostgreSQL, security, authentication, recovery, and visible browser regression
paths. Production Chromium then verified the new public entry and sign-in
control against the exact deployed release. No new production credit mutation
was created merely to re-prove an unchanged durable lifecycle.

## Agent acceptance

Status: **PASS**

The accepted production Agent lifecycle remains the A-01 through A-09 journey
recorded in `docs/releases/FINAL_CREDIT_LOOP_001_COMPLETION.md`: accountable
Principal, registered workload identity, sender-constrained DPoP, bounded
Mandate, Credit Intent, deterministic Decision and Offer, shared
`obligation.v2`, controlled execution, idempotent repayment, terminal Credit
Outcome, durable Credit State, Passport, Evidence, and separate-process
recovery.

The exact candidate reran the Agent credit, transport, negative, restart,
replay, revocation, and PostgreSQL integration paths. Production discovery and
the machine-readable Agent OpenAPI remained reachable. The previously used
production acceptance credential is revoked and its private material was
destroyed; it was not reused or re-created for this presentation-only release.

## Durable state and authentication

- Migration `0063` remains the production schema ceiling. This release adds no
  migration and does not transform or delete any durable row or Event.
- Accepted Human and Agent Obligations, repayments, Outcomes, Credit State,
  Track Record, Passport, Evidence, role enrollment, and credential-revocation
  history remain server-derived durable truth.
- Fresh PostgreSQL integration reverified refresh, logout/login, worker replay,
  duplicate command idempotency, process restart, DPoP replay denial, selected
  Human role isolation, stale/revoked credential denial, RLS, and cross-Tenant
  object authorization.
- Production readiness verified the durable runtime dependency. The public
  browser never became canonical truth, and unauthenticated Agent access
  remained fail closed.

## Security and authority boundary

This baseline is a hosted, durable, closed **no-real-funds** product. It does
not authorize or activate real capital, mainnet, Human cash loans, custody,
withdrawals, arbitrary spend, external transfers, public LP/vaults, tokens,
DAO governance, production signers, provider execution, venue writes, raw KYC
or PII on-chain, or current-user chain transactions. Sensitive Human data stays
offchain. Credit Passport remains permissioned and evidence-based, not a
universal score. No secrets, credentials, private keys, tokens, signatures, or
sensitive environment values are contained in this record.

## Rollback and preservation

If the public release must be rolled back, restore the production alias to
`dpl_B7VcAfv5CHrHrermwr8K71aswDNp` at
`f8bc87c034ad0257cd2b4fdbdb3898dc8cbea194`. Preserve migration `0063` and all
authentication, Obligation, repayment, Outcome, Credit State, Evidence,
outbox, and revocation history. Do not destructively downgrade the database,
rewrite this checkpoint, or reuse destroyed credentials. Repair forward from a
new branch and subsequent version.

## Canonicalization change chain

| Change | PR | Candidate | Merge SHA |
|---|---|---|---|
| Public README, website, tests, issue contract, and GitHub metadata | [#29](https://github.com/CPTM511/IPO.ONE/pull/29) | `2aec35b59b107fe86a9411187ab69f70e7273613` | `4356680ae8c9ace64d8029de943aa2a16ecf81ef` |

The checkpoint-record PR and merge SHA are represented by the Git history that
contains this file and by the immutable `v0.1.0` tag/GitHub Release. No later
edit is required or permitted to make this document self-reference its own
commit.

## Freeze statement

This checkpoint represents the **first fully closed Human-Agent Credit Loop
baseline** for IPO.ONE. Once `v0.1.0` is created, the tag is immutable;
historical checkpoint Evidence is not mutated; future work starts from a new
branch and is represented by a subsequent release while preserving schema,
Evidence, and required recovery compatibility.
