# PRODUCT-BASELINE-FREEZE-001 — Public Canonicalization and v0.1.0 Freeze

Status: Public baseline deployed and checkpoint recorded; final tag/Release pending

Owner: IPO.ONE Founder / Codex implementation

Date: 2026-08-20

## Context and current baseline

The Founder has authorized the repository's first durable Human-Agent Credit
Loop product-baseline release. The exact remote `main` baseline is
`a670e59eb15360ab0e4901b58fc724312445e0d0`. The currently accepted production
deployment is `dpl_B7VcAfv5CHrHrermwr8K71aswDNp` at ancestor
`f8bc87c034ad0257cd2b4fdbdb3898dc8cbea194`; H-01 through H-14, A-01 through
A-09, FINAL-CREDIT-LOOP-001, and the final Quality Gate are recorded PASS.

The public README still contains engineering-status and local setup material.
The signed-out website does not yet present the complete canonical product
thesis. GitHub describes IPO.ONE using the older Agent-economy wording and has
no homepage URL or durable GitHub Release. Existing tags use checkpoint names
but do not establish a semantic product-release convention.

The checkout also contains unrelated untracked local artifacts, including
`.vercel/`, audit outputs, marketing work, prototypes, and recovery evidence.
They are explicitly outside this issue and must not be staged or modified.

## Scope

- Rebuild `README.md` as the authoritative public product definition:
  **IPO.ONE — Verifiable Credit Infrastructure for Humans and Agents**.
- Align the signed-out public website with `BORROW. BUILD. PROVE.`, the shared
  Credit Loop, Human/Agent entry modes, Principal/Mandate authority, Capital
  Provider role, Evidence, Credit State, Passport, architecture, and ecosystem.
- Preserve direct, visible entry into the accepted interactive product.
- Add or update presentation/static/browser regression coverage for the public
  surface without changing protocol, economic, authentication, authorization,
  persistence, or execution semantics.
- Update GitHub repository description and homepage after the public files are
  accepted.
- Run the repository quality, PostgreSQL, security, browser, Human/Agent,
  persistence/recovery, authentication, revocation, production-dependency, and
  deployment discovery gates applicable to this release.
- Deploy and verify the exact candidate and final `main` SHA.
- Add `docs/releases/PRODUCT_BASELINE_CHECKPOINT_2026_08_20.md`, then create
  annotated tag `v0.1.0` and the GitHub Release at the final checkpointed
  `main` SHA.

## Non-goals

- No new credit, capital, trading, chain, wallet, Provider, KYC, custody,
  payment, signer, risk, authentication, or authorization capability.
- No real funds, mainnet, Human cash lending, public LP/vault, token/DAO,
  arbitrary withdrawal, external transfer, or production signer activation.
- No schema, migration, contract, dependency, infrastructure-topology, or
  private-data change.
- No deletion or rewriting of historical release, audit, security, Evidence,
  deployment, tag, or checkpoint records.
- No redesign of authenticated Human or Agent workflows beyond the minimum
  public-entry presentation needed for semantic alignment.

## Likely files

- `README.md`
- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/test/static-ui.test.js`
- focused browser/static presentation tests if required
- `docs/codex/tasks/PRODUCT_BASELINE_FREEZE_001_PUBLIC_CANONICALIZATION.md`
- `docs/releases/PRODUCT_BASELINE_CHECKPOINT_2026_08_20.md`
- GitHub repository metadata and GitHub Release (external public metadata)

## Acceptance criteria

### Public product

- Given a founder, Agent developer, Capital Provider, fintech/protocol team, or
  ecosystem partner opens the README, when they read the document, then they
  can understand the problem, Credit Loop, shared kernel, Agent authority
  chain, primitives, Capital Provider boundary, Evidence/Credit State,
  architecture, interfaces, use cases, compounding loop, principles, FAQ, and
  closing thesis without internal release-history narrative.
- Given a signed-out visitor opens the deployed website, when the home surface
  loads, then the canonical positioning and major product concepts are visible
  and the actual product sign-in/entry remains a primary operable action.
- Given broader architecture or ecosystem capability is described, when the
  copy is reviewed against current product truth, then it uses bounded language
  and does not claim mainnet, real-value lending, custody, unrestricted Agent
  control, or universal scoring.

### Regression and safety

- Given the public presentation changes, when the full quality and real-browser
  suites run, then existing Human and Agent paths remain reachable and pass.
- Given an expired or revoked credential, when it is used after deployment,
  then authentication fails closed with no authority expansion.
- Given durable Human/Agent state, when the accepted recovery checks run across
  refresh, session restart, and process/deployment recovery as applicable, then
  canonical server truth is restored without duplication.
- Given production discovery, when `/livez`, `/readyz`, and
  `/.well-known/ipo-one.json` are queried, then they identify the exact expected
  release and keep real funds, withdrawal, signer, external execution, and
  current-user chain writes disabled.

### Checkpoint and freeze

- Given README, website, metadata, CI, and production verification pass, when
  the checkpoint is recorded, then it contains the exact candidate/final
  identities, deployment, CI, migration, Human/Agent, durability,
  authentication, security, rollback, exclusions, and PR evidence without
  secrets.
- Given final checkpointed `main` is green and deployed, when the release is
  frozen, then annotated tag `v0.1.0` and GitHub Release
  `IPO.ONE v0.1.0 — Human-Agent Credit Loop Baseline` point to the exact same
  immutable final `main` SHA.

## Test commands

At minimum, select the current repository equivalents of:

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run test:browser:click-path
pnpm run test:transport
pnpm run test:agent-credit
pnpm run test:e2e:agent-credit
pnpm run test:e2e:agent-credit:negative
pnpm run test:e2e:agent-credit:restart
pnpm audit --prod
git diff --check
```

Use the exact pushed SHA's GitHub Quality Gate as CI Evidence. Run deployed
health/discovery, visible Human click-path, Agent DPoP/SDK/MCP, credential
revocation, and durable recovery verification against the actual deployed SHA.

## Security checklist

- [ ] No secret, token, credential, private key, raw signature, PII, KYC data,
      lender-private policy, raw transaction, or full credit history is added.
- [ ] Principal, Subject, Consent, Mandate, DPoP, replay, idempotency, Tenant,
      role, object authorization, and fail-closed boundaries are unchanged.
- [ ] Public copy distinguishes payment from obligation truth and transaction
      history from Credit State.
- [ ] Credit Passport remains permissioned, evidence-based, and non-universal.
- [ ] Disabled real-value, chain-write, withdrawal, signer, and Provider
      capabilities remain truthfully discoverable.
- [ ] Existing historical Evidence and release records remain unchanged.
- [ ] Only named files are staged; unrelated untracked files remain untouched.

## Permission boundary

The Founder request authorizes this public-sandbox copy/website change,
deployment of the resulting no-real-funds candidate, GitHub metadata update,
branch/commit/push/PR/merge operations required for the checkpoint, and
creation of the annotated tag and GitHub Release after all gates pass. It does
not authorize any real-value, private-data, signer, contract, custody, KYC,
risk-policy, pricing, mainnet, funds-movement, or permission expansion.

## Data, dependency, and migration impact

No domain data, database schema, migration, dependency, contract, environment
variable, infrastructure topology, or release profile change is intended.
Production deployment reuses the accepted runtime and durable database.

## Rollback plan

Before promotion, record the active deployment and exact schema-compatible
rollback candidate. If public-surface or regression verification fails, do not
tag or release. Restore the previous production alias/artifact, preserve all
database and Evidence history, repair forward on the issue branch, and rerun
the failed gate plus aggregate acceptance.

## Required Evidence

- exact base, candidate, merge, checkpoint, and tagged SHA;
- PR and CI URLs/identities;
- production deployment ID, URL, runtime status, and release discovery;
- README/website semantic consistency review;
- local and CI quality/security/PostgreSQL/browser results;
- visible deployed Human journey and authorized Agent journey;
- refresh/re-login/restart recovery and revoked-credential denial;
- production dependency audit and no-authority-expansion review;
- GitHub metadata, annotated tag, Release, and checkpoint document.

## Dependencies and sequencing

1. Public README and website alignment.
2. Local verification and one canonicalization PR.
3. Exact candidate preview/deployment verification and CI.
4. Merge and exact final-production verification.
5. Checkpoint evidence PR/merge and final green `main`.
6. Annotated tag and GitHub Release at the final checkpointed SHA.

The self-referential commit-hash constraint is handled explicitly: the
checkpoint record binds the deployed canonicalization candidate and its merge
identity; the immutable annotated tag and GitHub Release bind the subsequent
final `main` commit that contains that checkpoint record. Both identities are
reported, and no document is amended after tagging.

## Completion Evidence

Local candidate Evidence on 2026-08-20:

- public README: 2,807 words, five explanatory Mermaid diagrams, no release
  status, local setup, historical SHA, rollback log, or acceptance-count
  section;
- public signed-out website: canonical product hero, Credit Loop, Human/Agent
  modes, Capital Provider, Principal/Mandate authority chain, Evidence/Credit
  State, architecture, ecosystem links, and direct product/API entry;
- real Chromium: desktop and 390 x 844 mobile render, no horizontal overflow,
  no console errors or warnings, and visible product/API controls;
- runtime, lint, boundaries, type surfaces, 136 schemas, 21-operation OpenAPI,
  63 migrations, and 103-operation Tenant protocol: PASS;
- security: 34/34 PASS; transport: 82/82 PASS;
- fresh isolated PostgreSQL 17 integration: 88/88 PASS, including RLS,
  migrations, logout/login, revocation, replay, persistence, restart, Capital
  Partner marketplace, and reconciliation;
- aggregate repository tests: 1,097/1,097 PASS;
- real-browser click-path: 4/4 PASS;
- Agent credit suite: 41/41 PASS; focused positive, negative, and restart paths
  PASS;
- production dependency audit: no known vulnerabilities;
- `git diff --check`: PASS.

Remote Evidence on 2026-08-20:

- canonicalization PR #29: candidate
  `2aec35b59b107fe86a9411187ab69f70e7273613`, merged as
  `4356680ae8c9ace64d8029de943aa2a16ecf81ef`;
- candidate Quality Gate runs `32354952070` and `32354930973`: PASS;
- product-checkpoint `main` Quality Gate run `32355841411`: PASS;
- production deployment `dpl_8iBxcDq1fHWZzy52mgzWiPmmiHp8`: READY and
  promoted to [https://ipo.one](https://ipo.one);
- production liveness, readiness, and capability discovery identify exact
  release `2aec35b59b107fe86a9411187ab69f70e7273613`, with real funds and all
  unapproved authority disabled;
- deployed Chromium desktop/mobile public surface and visible product-entry
  click: PASS, with no overflow or console issue;
- bounded Human authentication discovery is reachable and unauthenticated
  Agent access fails closed;
- checkpoint record:
  `docs/releases/PRODUCT_BASELINE_CHECKPOINT_2026_08_20.md`.

The annotated `v0.1.0` tag and GitHub Release remain intentionally pending
until the checkpoint PR is merged and the resulting exact `main` SHA is green
and deployed.
