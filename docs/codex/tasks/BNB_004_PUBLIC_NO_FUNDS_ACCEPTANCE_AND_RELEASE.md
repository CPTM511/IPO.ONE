# BNB-004 — Complete no-funds acceptance and conditionally release

Founder instruction on 2026-09-11: complete all remaining acceptance and, if
there are no problems, deploy publicly. Baseline `d4a2204`; currently served
local code `15fe24c`, public code `2327b8c`, both ancestors of this candidate.
This authorizes necessary reversible release preparation and a reviewed
candidate environment for device acceptance, then public promotion only after
required checks pass. It does not authorize real funds or chain writes.

Scope (corrected following Founder feedback on 2026-09-11): complete direct
Binance Wallet and existing OKX browser-provider access on BNB 56/97, and all
applicable no-funds shared-kernel workflows. Reown registration and a
WalletConnect Project ID are not prerequisites for this scope or its release.
The optional phone QR connector remains visibly unconfigured and must not be
claimed as verified. Its device acceptance is deferred unless that optional
connection method is requested. Preserve Precision Terminal, existing OKX/Base
paths, exact role policy, expiry and revocation, independent approvers, shared
kernel and immutable financial data. Verify applicable dual-controlled servicing
Evidence, the hosted BNB migration profile and actual hosted role capabilities
before changing the public release.

Likely files: web mobile adapter/access UI/config rendering, hosted runtime and
migration profile, existing web/auth/transport and PostgreSQL tests, deployment
artifact and this acceptance record. No local invitation, local Passkey origin,
test signer or local runtime credentials may enter the public bundle/profile.
Any missing production role facility must remain visible and block its claimed
acceptance rather than being silently replaced with a local implementation.

Acceptance: visible real-provider connect, selected chain, signature login,
rejection/retry, reconnect and return-to-app on both BNB networks; all enabled
role-allowed no-funds workflows call authenticated durable services; servicing
retains independent MFA approvals, original schedules and distinct repayment,
repurchase and write-off truth; old UI never renders. A browser mock or old
servicing artifact alone cannot establish current hosted acceptance. Bind CODE,
RUNTIME, DEPLOYED, REACHABLE and VERIFIED to exact source/configuration.
Unavailable required real-provider verification remains a gate. Missing Reown
configuration gates only the optional phone QR feature, not direct wallet access
or the release of independently accepted capabilities.

Checks: affected unit/browser/auth/transport tests, contract/schema/OpenAPI,
PostgreSQL/RLS/migration tests, full release gates and exact-source bundle
checks; candidate browser/device journeys; post-promotion health, authenticated
journeys and release identity. Existing evidence may be reused only where the
relevant implementation and dependencies are unchanged and its scope fits.

Security and permission boundary: no credentials printed or committed, no
ordinary privileged self-enrollment, no CSP wildcard or browser storage of
wallet pairing keys, no sendTransaction/sendCalls, no fabricated trusted time,
no real Provider/venue enablement and no paid infrastructure. Public promotion
is conditional on acceptance, not on build success alone.

Migration impact: inspect and back up the exact hosted database, retain applied
checksums and financial history, apply only reviewed additive/bounded changes.
Never promote with a mismatched migration manifest. Rollback withdraws the
candidate or restores the recorded compatible public release, preserving
expanded schema, revocations, outbox and Evidence; do not delete user records
or reactivate credentials to make an old release run.

Initial findings: current Primary Vercel project and credentials are available.
Mobile adapter is not wired into a user control, and no owner-managed Project
ID is configured. Current hosted profile explicitly excludes BNB migration
0074 as well as all local access/Passkey facilities. WEB-027N's exact servicing
flows were verified on 2026-09-08 in a different local database; they cannot be
relabeled as current BNB or hosted execution without checking applicability.


## Verified preparation on 2026-09-11

Implementation commit `5f69170a20c396c8b15f5e7d1c069a94b163a24b`:

- Visible phone pairing uses the existing Provider registry, selected BNB/Base/X
  Layer network and SIWE flow. The same-origin pinned bundle generates the QR;
  cancellation clears it, disposes its in-memory connector and rejects pending
  initialization/connection. Late callbacks cannot restore authority. Script,
  registration and QR failures retain retry/cancel paths. No transaction methods
  or additional network origins were enabled.
- The public, non-secret `IPO_ONE_WALLETCONNECT_PROJECT_ID` is validated end to
  end and injected into one HTML meta field. It is absent from current Vercel
  configuration. Exact `https://ipo.one` origin and the existing 2026-09-22
  approval expiry remain enforced; missing configuration is visibly disabled.
- Current local login was opened with visible browser controls and visually
  checked in Precision Terminal. No browser console errors were observed.
  This browser has no injected wallet, so it is UI reachability evidence only.
- Full unit suite: 1,379 passed. PostgreSQL suite: 102 passed against disposable
  `ipo_one_bnb_test`, including forced RLS, migration up/down/up, atomicity,
  replay, role isolation and servicing controls. Production-runtime EIP-191
  lifecycle tests passed for networks 84532, 97 and 56. Mobile cancellation,
  QR generation, failure/retry, origin/configuration and bundle regressions pass.
  Contract types, 147 schemas, OpenAPI, migration checks and web bundle checks
  pass. These automated cases do not prove real phone WalletConnect pairing.

Hosted preparation used the existing Vercel/Neon accounts; no new service,
spend, role grants, public DB mutation or public deployment occurred.
The live database exactly matches the prior 76-migration manifest. A private,
verified TLS backup was restored into isolated local `ipo_one_bnb004_cutover_test`.
The attempted plan of including older local migration 0074 was rejected during
review because the deployed 0084 history must remain a contiguous prefix.
Migration **0087_hosted_bnb_no_funds_wallet_networks** now appends the exact
8 offchain constraint expansions. Original 0074 and all local-only access,
invitation and Passkey migrations stay excluded from the hosted bundle.

The corrected hosted manifest has 77 migrations and set SHA-256
`9449c310a601f0be115c36ee99f0b39a2ac5b41a48ce1f18811b8342d4943c77`.
On the restored copy, all 159 business-table fingerprints (62,469 rows) were
unchanged; only 0087 was applied; a second migration run was a no-op. A rolled-back
synthetic SQL fixture also proved that hosted narrowing rejects BNB rows and
retains identity. No production clock, data, auth record or policy was altered.

Clean tracked-source release artifacts (not deployed):

- Candidate: `/private/tmp/ipo-one-m1-b-vercel-bundle-bnb004`, source
  `5f69170a20c396c8b15f5e7d1c069a94b163a24b`.
- Compatible rollback: `/private/tmp/ipo-one-m1-b-vercel-bundle-bnb004-rollback`,
  source `2e27bf1029b18a136018c34bc0a8c65e42bb92ef`, derived from the current
  public `2327b8c` plus the same expanded hosted schema. This restores the prior
  product behavior without deleting BNB records or downgrading the database.
  Withdraw the obsolete pre-0087 artifacts; only these source-bound manifests
  describe the current preparation.

Both artifacts were rebuilt from clean Git archives without untracked input.
The live public service remains `2327b8cb6400c2ec587247f8aef1eae0a696d446`.
A direct rollback to that old deployment after schema expansion would fail its
exact migration gate; use the compatible artifact and a coordinated cutover.
A migration backup must be refreshed immediately before any eventual cutover.
Private backup, fingerprint, migration and narrowing reports remain under
`.ipo-one/bnb-001`; never publish that directory or its credentials.

## Remaining acceptance — BLOCKED — NOT COMPLETE

1. Complete the remaining real Binance browser-provider acceptance on 56 and
   97, particularly rejection/retry, reconnect and return-to-app. Preserve the
   earlier recorded desktop login checkpoints without inferring unobserved
   behavior. Check current device accessibility when needed; previous locked
   or unavailable automation states are historical, not evidence of a current
   device blocker. No Reown account or Project ID is required for these checks.
2. Exact-source hosted candidate acceptance, including role-allowed durable
   workflows and currently unverified special-role servicing availability.
   WEB-027N local servicing evidence was inspected: servicing/operations-control
   modules are unchanged, but browser and gateway dependencies have changed.
   Keep that evidence qualified as historical local coverage, not current BNB
   or hosted verification. No maturity timestamps or role policy may be faked.
3. Only after those gates pass: coordinated hosted migration and public promotion,
   then visible Human journeys and authenticated Agent API checks against the
   actual deployed SHA. A successful local build cannot substitute for this acceptance.
   An unconfigured optional phone QR entry is not a whole-product release gate. Founder has already authorized this conditional
   public release; do not ask again merely because work resumes.

Experience remains available at <http://127.0.0.1:8955/#request-credit>.

## Scope correction — 2026-09-11

The earlier request to register/sign in to Reown incorrectly elevated optional
phone QR pairing into a mandatory project dependency. Founder challenged that
requirement; it is withdrawn. Direct injected-provider discovery and connection
are implemented independently of the Project ID. The optional bundle is loaded
only when its configured phone connection is explicitly selected. Existing QR
implementation and test records above remain historical facts, not requirements
to activate that feature or proof of real-device acceptance. This correction
supersedes the mobile WalletConnect release gate in BNB-003's Remaining paragraph
and earlier BNB-004 instructions. All required direct-wallet, durable workflow,
current UI and deployed-source acceptance requirements remain in force.

## Hosted composition follow-up — 2026-09-11

- Production now explicitly composes all four approved signature-only account
  proof profiles with the reviewed wallet verifier. Previously its two-profile
  configuration was extended by the handlers with EOA-only BNB adapters; ordinary
  BNB EOA proof was already available. The change removes that reliance and
  preserves the verifier for contract-wallet proofs on BNB. It adds no network,
  transaction submission, funds authority or profile permission.
- Fixed a confirmed Risk cold-start failure: the global metered feature flag
  incorrectly required a Primary-only provider on Risk. Required provider
  presence now follows both policy and deployment role. A provider on Risk is
  still rejected, and its capability document reports that service unavailable.
  This is a compatibility repair, not activation of a Risk deployment or role.
- 27 environment/serverless tests passed. The production HTTP/PostgreSQL
  regression covers EIP-191 login, durable Human command, logout/re-login for
  84532/97/56, then actual Risk composition/cold-start HTTP and rejection of an
  extra metered signer. Full suite: 1,379 passed; full disposable PostgreSQL
  suite: 102 passed. Precision Terminal baseline, source and boundary checks
  passed. Logs: `/tmp/bnb004-postfix-unit.log`,
  `/tmp/bnb004-postfix-postgres.log`, `/tmp/bnb004-postfix-lint.log`.
- All four local role services respond with real funds disabled. The apparent
  localhost Risk timeout was a proxy-path issue; direct no-proxy HTTP succeeds.
- Fresh read-only hosted inventory: 76 migrations; active memberships include
  Human, Principal, Agent, Risk and System, but no Capital Partner, Operations
  or Auditor. Approval tables exist; Passkey and Passkey Evidence tables do not.
  Production composition does not install the local MFA/independent-approval
  adapters. Do not claim that the historical local full-role servicing acceptance
  proves public availability, or copy local invited identities into production.
  This pre-existing hosted gap remains unresolved for the requested full-product
  acceptance; no privilege, MFA rule or release criterion was weakened.
- Native Chrome still exposes a verified session and Binance/OKX choices, but
  page clicks/keyboard actions could not be verified, captured screenshots were
  blank, and the extension control channel timed out. Asked the user whether
  the visible Chrome page is operable; no new rejection/reconnect/device PASS
  is inferred. Reown remains optional. No hosted DB write or public promotion
  was performed.

## Actual Binance Wallet acceptance checkpoint — 2026-09-11 12:18 UTC

This supersedes the prior native-device blocker for the checks listed here.
Founder authorized macOS native automation. Actions targeted the already signed-in
Chrome process by PID and visible accessibility controls; other Playwright Chrome
instances were not used as a substitute. Served source remained
`e061d313e903c96f1f7374b0a3e9290bec275d8a` on local port 8955.

- Actual `com.binance.wallet`, the Founder-provided address ending `d458`, and
  connected BNB Smart Chain were observed in the access UI and wallet popup.
- Visible Human journey completed: Subject, scoped Consent, synthetic profile
  activation, deterministic USD 120 Offer, exact Offer acceptance, sandbox
  execution and two USD 60 early repayments. The wallet rejected the first
  acceptance signature; the UI reported nothing submitted. Retrying and explicitly
  confirming in Binance Wallet created the Obligation. Subsequent signatures
  explicitly named execution/repayment, not blockchain transactions.
- Obligation `obligation_483fda20-4983-4150-b9ae-541b347f8988` reached
  `fully_repaid`. Read-only PostgreSQL cross-check confirmed principal 12000,
  outstanding 0, repaid 12000 (minor units), two paid installments,
  `sandbox_only=true`, `production_funds_moved=false`.
- Visible browser reload recovered the completed Obligation. Verify Evidence →
  Open owner timeline reauthorized and loaded 12 finalized offchain events.
  No historical chain artifact was represented as a current-user transaction.
- Switching to BSC Testnet invalidated the old session and cleared private
  browser state. Actual Binance SIWE popup explicitly showed Chain ID 97.
  Login succeeded at 12:14:06 UTC; Subject and Consent were created through
  visible controls. The chain-scoped identity is separate, as required by
  DEC-BNB-NO-FUNDS-001; no silent cross-chain merge occurred.
- Before the testnet credit request, macOS began returning zero Chrome windows.
  CUA retained stale page text; it is not proof of an operable current window.
  Asked Founder to restore the window without requesting another login. The
  testnet session remains active in PostgreSQL. Its actual-wallet lifecycle
  and rejection/retry remain incomplete.

The earlier local runtime had stopped, causing a network fetch failure. It was
restarted as a detached process; original durable state was recovered. Keep this
runtime available for Founder review. Private evidence is
`.ipo-one/bnb-001/bnb004-real-binance-device-checkpoint.json` (not a deploy asset).
This is current local acceptance only. The hosted role/MFA gap described above,
exact deployed-source acceptance, and public release remain outstanding.
No public database mutation or deployment occurred at this checkpoint.


## BSC lifecycle and focus-style follow-up — 2026-09-11 12:37 UTC

- Actual BSC Testnet wallet connection resumed the existing Subject and Consent.
  Synthetic profile activation, USD 120 Offer, acceptance, execution and two
  USD 60 repayments completed through visible controls. Obligation
  `obligation_0f97c3c6-0979-4638-98cc-e247ca1bec50` is fully repaid. Read-only
  PostgreSQL confirmed outstanding 0, repaid 12000 minor units, two paid
  installments, sandbox-only and no production funds moved.
- Sign-out cleared private UI. Subsequent SIWE sessions restored that same
  completed Obligation; visible Load timeline reauthorized and loaded 12
  finalized offchain events. The prior window-unavailable condition is resolved
  for these checks. Private checkpoint: `bnb004-real-binance-testnet-completion.json`.
- BSC signatures completed before the rejection attempt could operate on the
  wallet popup. A successful signature does not prove the rejected path. Asked
  whether Founder was confirming manually; BSC rejection/retry remains unverified.
  Do not repeat successful economic commands to manufacture rejection evidence.
- Visual inspection exposed legacy purple programmatic-focus outlines on the
  otherwise current Precision Terminal Obligation card. The current workspace
  stylesheet now applies its theme accent to all six legacy focused workbench
  classes, retaining a visible focus indicator and the public-page baseline.
  Four rendered regressions pass at 1440/390 pixels in Light/Dark, explicitly
  exercising mouse focus with `:focus-visible=false`. UI baseline passes.
- Public complete servicing remains blocked on the hosted strong-authentication
  composition and exact privileged identity bindings. Requested role mapping for
  independent Risk/Operations approvers and executor. Do not elevate the current
  ordinary wallet, clone local credentials, weaken MFA, or claim public all-role
  acceptance. Public deployment remains conditional and has not occurred.


## Founder-confirmed public scope and device gate closure — 2026-09-11

Founder explicitly selected: publish ordinary Human and Principal/Agent BNB
support first; management remains in its existing private scope. The request for
public administrator identities applies only to a future management release and
is withdrawn as a prerequisite for this release. This supersedes the public
special-role/MFA blocker above for this bounded release, without claiming those
roles publicly available or reducing their private authorization requirements.

At 12:46 UTC, actual Binance Wallet on BSC Testnet displayed a fresh SIWE
request. A visible Cancel click returned “Wallet request cancelled. Nothing was
signed or submitted.” Retry displayed a new Chain ID 97 challenge; Confirm
restored the same fully repaid Obligation. This closes the prior BSC real-wallet
rejection/retry gap. Current local browser also displayed release `c5832e5277dd`
after a native refresh, preserving the original fully repaid state after restart.

Frozen reviewed release artifact: source
`c5832e5277ddbc7912b275b55dc9f25e7e8f08fa`, tree
`6633d62027c4687e34058242f46b3f8073375891`, 221 artifacts, clean tracked archive,
`/private/tmp/ipo-one-m1-b-vercel-bundle-bnb004-focus`. Application changes since
functional Evidence at e061d31 are limited to the verified focus CSS fix. The
following documentation updates do not replace or relabel this frozen source.
Public promotion and actual deployed-source ordinary-role acceptance remain next.

## Hosted cutover and compiled-UI repair — 2026-09-11 13:11 UTC

- Fresh backup completed over verified-TLS IPv4 after a read-only transport
  comparison identified a slow IPv6 path. Archive: 9,955,250 bytes, 2,303 TOC
  entries, complete decompression verified; SHA-256
  `fb53272b1283e9e7c792f5bc5cdadc3d9db41839b9307d4529f463ebf583842c`.
- Only 0087 was applied to the public database. The exact 77-migration manifest
  matches the reviewed profile; no business data migration or narrowing ran.
- Candidate `dpl_9ayZASv3XBQF3MGKefhhWqivMVmx` was promoted, but actual public
  cold start returned `product_ui_baseline_mismatch`. The compatible rollback
  `dpl_5GmyGVRQ3t2aUFBjJveVUw3cWQgg` / source `2e27bf1` was immediately
  promoted. Public liveness, readiness, wallet options and unauthenticated Cron
  rejection passed. Expanded schema and all history remain intact.
- Root cause: server bundling relocates `import.meta.url`, while browser
  compilation removes source import declarations. Source-relative paths and
  literal-import checks cannot be applied unchanged to that artifact. The
  repair uses the compiled entry's own directory, validates the source UI
  before compilation, includes the existing release artifact manifest in the
  Function, and verifies the five UI baseline files against its exact release
  hashes at cold start. Missing, stale and modified artifacts fail closed.
- A real esbuild server/browser regression serves current CSS from an unrelated
  working directory and rejects stale release, replaced CSS and missing
  manifest. All 97 transport tests pass. The first transport run found a stale
  expected module inventory missing `mobile-wallet-access.js`; the explicit
  inventory was corrected without weakening its equality check. UI baseline,
  source/boundary lint and deployment static gate pass.
- Public BNB acceptance is not yet complete. Rebuild and stage the corrected
  source, verify deployed cold start, then resume actual hosted ordinary-role
  browser acceptance. No management deployment or real-value path is added.

## Public BSC lifecycle and availability repair — 2026-09-11

Repair source `318482ecebabfc1fba76eaa5b8305fb6624322ef` reached real staged
readiness and was promoted as `dpl_327pyPunujTaMiugDDKbnCk2uqKs`. Public smoke
checks and exact served CSS hashes pass. Actual Binance Wallet on `https://ipo.one`
and Chain ID 97 completed cancelled SIWE → fresh retry → Human Subject → scoped
Consent → USD 120 Offer → exact wallet acceptance → synthetic execution → two
USD 60 repayments. Obligation `obligation_cfd18101-7dc3-4458-b52b-21334b6c694b`
is fully repaid with two paid installments and 12 finalized offchain events.
Read-only public PostgreSQL confirms 12000 minor units repaid, zero outstanding,
`sandbox_only=true` and `production_funds_moved=false`. Some repayment wallet
confirmations were completed while Founder was interacting with Chrome; they
are not attributed to an unobserved automated click. Private evidence:
`bnb004-public-bsc-lifecycle.json`. Final-source recovery remains to be checked.

The visible profile activation button exposed a pre-existing local-only action
to public users. Public bootstrap does not grant that capability, and the
handler explicitly requires a reviewed local database/reference. Do not remove
those checks or grant identity permissions to make the button pass. Presentation
now follows the authenticated runtime profile and installed catalog, remains
visibly disabled with its recovery condition on unsupported hosts, and preserves
the public synthetic borrowing flow. Local activation still requires pending
state, Consent and explicit confirmation. This does not claim public execution
account verification or hosted local-Agent self-provisioning.

Actual public screenshot also exposed two hardcoded purple Obligation badges.
Both use the current theme accent now; remaining legacy brand aliases are scoped
to the product theme. Four rendered Light/Dark, 1440/390 checks cover badge text,
background and mouse-focus outlines. Nine availability/compiled-UI checks and
source/boundary lint pass. These UI fixes require a fresh tracked-source bundle
and deployed-source retest; public mainnet and Principal/Agent acceptance remain.

## Public Evidence role visibility repair — 2026-09-11

On deployed source `373d115e023507e3f0bbd5805f66fae7a3f9ace5`, a visible
Human owner-timeline click after refresh recovered the fully repaid USD 120
position and 13 durable events. Activity also exposed a legacy Auditor console:
its display predicate checked only CSRF presence. Display now requires the
existing review workspace classification; Human and Principal keep their owner
Evidence and bounded Registry controls. Server permissions remain authoritative.
The private review hero now uses current Light/Dark tokens. Six rendered role,
reload, badge and focus checks pass; UI baseline and source/boundary lint pass.
Public mainnet and Principal/Agent acceptance are still outstanding.

## Public mainnet Human acceptance and Principal enrollment repair — 2026-09-11

Release `65b47fc245be89508a326fb9dd9bea3f8ea0ce20`, deployment
`dpl_BFJCtA7x3nY4whcDZJeBpaxxKbhA`, passes public smoke. Actual Chain 56
Binance login invalidated the prior Chain 97 session and recovered an independent
Human identity. Subject → scoped Consent → refresh recovery → USD 120/60-day/
two-installment Offer → exact wallet acceptance → synthetic execution → USD 60
+ USD 60 repayment completed. Obligation
`obligation_89e67ea6-4857-49f9-9b89-101c5d4d3937` is fully repaid; public PostgreSQL
confirms zero outstanding and no production funds moved. Refresh and visible
Activity → Open owner timeline recovered all 12 events. Actual deployed Activity
screenshot and accessibility tree confirm the unwanted Auditor console is gone.
Private evidence: `bnb004-public-bnb-lifecycle.json`.

Explicit Chain 56 Principal SIWE succeeded. Its original Human membership remains
canonical; Principal authority lives in `authentication_role_enrollments`. Legacy
Agent provisioning rejected this approved multi-role arrangement. The shared
owner/provisioning authority check now accepts an active, policy/client-bound,
unexpired Principal enrollment and active Human credential while preserving the
original membership. Missing, expired or revoked enrollment fails closed. Real
PostgreSQL tests cover legacy registration/replay, enrolled Principal registration,
restricted-auth-role replay, denial cases and unchanged Human membership. Both
integration tests and UI/source/boundary lint pass; no migration is needed.

The bounded operational setup uses two independent local no-funds Agent keys,
separate from the personal wallet. Owner-side preparation creates only canonical
Agent actors/memberships under the exact authenticated Principal, reusing the
same authority check. Existing protected credential provisioning keeps
`existingIdentityOnly=true`; no public admin endpoint or management role is added.
Credential expiry is 2026-09-18T14:00:00Z. Only public JWKs may enter deployment
configuration; local private keys stay owner-only. Original project environment
values remain intact. Supplemental-key overrides require a fresh check that no
other usable Agent credential is displaced. One-off provisioning configuration
must be removed from the final serving deployment. Rollback restores the prior
compatible deployment and revokes only the newly registered Agent credentials.
Principal-visible account proof/Mandate and actual Agent HTTPS operations still
require acceptance; operational identity preparation alone is not completion.

A live preflight additionally confirmed public self-enrolled credentials use
`expires_at=NULL` (no fixed invitation expiry), unlike invited test identities.
The check now follows that existing lifecycle rule while retaining active-state,
role, client and policy checks. Regression creates a real public Beta identity
through `PostgresCredentialRegistry`, then verifies owner registration and the
restricted hosted replay; it does not rewrite an invited credential's expiry.
The first attempted invited-fixture expiry rewrite was correctly rejected by
the immutable credential guard. That invalid fixture was replaced with the real
public enrollment path; both PostgreSQL tests pass without changing the guard.

## Deployed checkpoint — 2026-09-11, Mac unlock required

Regular public deployment `dpl_AoQGWbMCVRy453aLpT7Dj1zvWcwi` serves source
`daa729543882102e9c645c81140c9f122cb4c436`, tree
`b2365c5e6d7030fbde84759107ea3ce4eeb08efb`. Public smoke passes. The new
`actor_bnb004_public_bnb56` is bound to the actual Chain 56 Principal, and the
protected registration produced credential
`credential_23ffd9df-3594-4784-87f0-5f0fcb079cde` with no funds authority.
The first one-off attempt rejected the incorrectly prefixed invitation before
credential registration; the corrected `invite_` operation completed and
reconciliation passed. Original project environment values were not changed.
Both one-off deployments were deleted after the regular deployment became ready;
its configuration contains neither that operation nor the temporary Cron secret.

Actual Agent HTTPS + DPoP `pilotReadWorkspaceResume` succeeds on `https://ipo.one`
with `serverTruth=true`, `workspaceKind=agent_runtime` and no resources yet.
The configured token audience remains `https://ipo-one-internal.vercel.app`; the
client uses its existing explicit audience option. Using the public API origin
as token audience was correctly rejected first. Private evidence and owner-only
connection configuration are under `bnb-001/public-agents/bnb56/`. Private
wallet/account/workload keys were never uploaded. The separate BSC97 key remains
local and is not a registered credential.

`BLOCKED — NOT COMPLETE`: CUA reported the Mac locked and automatic unlock failed.
Founder was asked to unlock. Remaining: visible Principal56 Agent Subject/account
proof/Mandate, actual Agent application/execution/repayment/recovery; Principal97
SIWE, separate Agent setup and lifecycle; final-source browser review. Earlier
Human lifecycle evidence remains qualified to its actual source, not relabeled
as final-source browser acceptance. Local review listeners remain available.


## Resumed public Principal56 acceptance — 2026-09-11

After unlock, visible Principal controls created Agent Subject
`subject_563b20f9-d426-44cf-99fb-7c4513dc9b57`, requested a Chain 56 account
proof and refreshed its verified binding. A separate Agent process proved its
own account using authenticated HTTPS + DPoP; no private key entered the browser.
The Principal drafted and activated exact Mandate
`mandate_3d07579e-dde5-43f9-97ed-f0e900a9548a` with a six-day validity and
reviewed the persisted $100 synthetic Offer. The Agent application verified replay
and denied out-of-scope work; runtime produced fully repaid Obligation
`obligation_4aec2db5-ea0b-460d-8f98-6da68f042741`, $100 repaid, zero principal
remaining, a $5 synthetic metered charge, and 22 Evidence events. Duplicate
repayment did not duplicate ledger entries. A fresh independent process restored
the terminal state. Principal visible progress and Evidence controls then loaded
23 current owner-authorized events including the finalized credit outcome.
These actual public results are qualified to source `daa7295`.

Acceptance found stale activation helper text and misleading local-only Agent
API wording; both are corrected without changing permissions. Recovered terminal
Obligations also must not label their already completed application as “Not
started” merely because the pending Offer continuation was consumed. The summary
now derives completed/accepted presentation from the durable Obligation; browser
regression covers refresh and current status. BSC97 Agent acceptance and the final
source browser review remain pending. The earlier Mac-lock blocker is resolved.
Private evidence: `public-agents/bnb56/{proof,application,runtime,recovery}-result.json`.


## Final source deployed, browser acceptance still pending — 2026-09-11

Public source `2e2c033e24fd112295684cd27e628ff5f0e7ff87`, tree
`0840b511ca901ebfa8aa99ecc33a1e32bd227ad4`, deployment
`dpl_7EJg9rUjQ6FYkuwNDm68hAh6M1CU` is serving https://ipo.one.
The 221-artifact clean tracked build excludes untracked inputs. UI baseline,
source/boundary lint and five affected rendered browser regressions passed.
Staged readiness and actual public smoke passed, including wallet auth options
and unauthenticated Cron rejection. Both Agent public keys remain configured;
private keys, one-off operation and temporary Cron secret are absent. Original
project environment and private management scope remain unchanged.

Visible Binance Principal97 SIWE succeeded at 15:28:28 UTC for the independent
actor `actor_public_beta_3bf14957be2baf1005464ad30c0ccb4c`; its prior Principal56
session was revoked. Canonical owner preparation and protected one-off credential
registration provisioned `actor_bnb004_public_bsc97`, credential
`credential_4a0343ba-1345-46ab-8b08-bbcb2132bd10`. Cron reconciliation passed.
The one-off deployment was deleted after the regular public deployment passed
readiness; temporary secret files were deleted. Actual protected Agent HTTPS +
DPoP workspace read succeeds on this final source, with serverTruth=true and an
empty Agent workspace. This is authentication evidence, not lifecycle completion.

`BLOCKED — NOT COMPLETE`: the Mac locked again during visible Agent97 Subject
setup; CUA could not automatically unlock it. Founder was asked to unlock and
keep the screen awake. Remaining: visible Agent97 Subject/account proof/Mandate,
Agent application/runtime/recovery and Principal Evidence; final-source visible
Human/Principal recovery and UI review on both chains. The earlier Principal56
runtime and Human results retain their actual source qualifications. Root copies
of the three changed tracked files were backed up and synchronized exactly;
local review listeners remain available.

Final-source independent Agent56 recovery also passed (`terminal_state_recovered`),
using the existing authenticated HTTPS contract and retained $100 fully repaid
Obligation. Evidence: `public-agents/bnb56/recovery-final-release-result.json`.
This confirms API persistence across deployment; final-source visible UI review
remains pending. Local listener 8955 was confirmed alive (PID 37853).


## Agent97 visible acceptance resumed — 2026-09-11

On public source `2e2c033`, visible controls created Subject
`subject_ae0aa568-f071-4c08-bcd9-8710bbebffaa`, requested the Chain 97 signature
for the independent Agent account and restored the verified binding. The actual
Agent API proof and application completed; the Principal reviewed the $100 Offer,
$250 per-action / $1,000 aggregate ceiling, six-day validity, and activated the
exact sandbox Mandate. The corrected activation helper was visible on public UI.
The external Agent completed execution, synthetic metered use and full repayment.
Principal's visible progress check restored $100 repaid, $0 remaining, 22 Evidence
events, Decision completed and Accepted $100; consumed continuation no longer
mislabels its application as not started.

The CLI terminal check ran before the separate 15-minute credit-outcome worker
projection existed and exhausted its short read retry (`tenant_resource_unavailable`).
This does not reverse or repeat repayment. Final recovery will use read-only API
operations after projection; no new economic goal is needed. Keep the failed CLI
log as timing evidence rather than labeling the initial invocation passed.

A public screenshot revealed legacy hardcoded white surfaces and purple borders
in the pending account-proof status/developer request. Their colors now use the
shared current surface/line/ink tokens. A rendered pending-Subject regression
covers both themes at 1440/390 widths, actual text contrast and overflow. It and
UI baseline/source/boundary lint pass. This presentation-only repair preserves
proof, credentials, roles, limits and every action.


## Final acceptance — 2026-09-12 Asia/Shanghai

**PASS — DEPLOYED AND USER-VERIFIED**, scoped to the Founder-approved no-real-funds
Human and Principal/Agent public release. This supersedes the earlier resolved
Mac-lock and pending verification checkpoints; their historical evidence remains.

- CODE: source `59cb6c10694a648d722d683180db9a6203c5a1e6`, tree
  `a2baeeb0afb3ddc12fe2fdf33429bb3c7ffb5a41`. UI baseline, source/boundary lint,
  pending-account proof contrast at 1440/390 in both themes, and the preceding
  five affected role/lifecycle browser regressions passed. Earlier full release
  checks remain qualified to unchanged code/dependencies.
- RUNTIME / DEPLOYED: clean 221-artifact build, deployment
  `dpl_9vcRzUC2ZFLwMvF7ik5YH41TUajf`, actual https://ipo.one readiness and
  public smoke passed. Live `styles.css` and `workspace-experience.css` bytes
  exactly match this build; their SHA256 values are recorded privately.
- REACHABLE / VERIFIED: final-source visible Chrome controls recovered Principal97
  after refresh and Principal56 after fresh Binance SIWE. Both show Decision
  completed, Accepted $100, Fully Repaid, $100 repaid / $0 remaining and 23
  owner-authorized Evidence events ending Credit Outcome Finalized. Human97 and
  Human56 separately signed fresh SIWE, recovered their own $120 fully repaid
  two-installment records, and loaded Evidence via Verify Evidence → Open owner
  timeline. The review-only Auditor console was not exposed in these journeys.
  Actual desktop and narrow Chrome screenshots verified the current terminal UI
  in Light and System/Dark; the original System preference and full-screen
  presentation were restored. New pending proof panels additionally have rendered
  regression coverage and exact public artifact verification.
- Agent97 read-only fresh-process recovery passed after the scheduled credit-outcome
  projection became available. The earlier short terminal-read timeout is retained;
  it is not counted as a successful initial CLI invocation and no repayment was
  repeated to recover. Final Obligation is
  `obligation_2050b965-5103-4563-bb5d-1c0c3f353fe7`; authoritative recovery includes
  the finalized credit outcome and Evidence. Agent56 independent recovery had
  already passed, including recovery across the prior deployment.

Public management scope, original project environment, real-funds prohibitions,
private-key handling and signature-only BNB network profiles remain unchanged.
Both separate Agent credentials retain their reviewed 2026-09-18 expiry. No
one-off registration operation or temporary Cron secret is in the serving release;
all one-off deployments and temporary secret files were removed. QR/phone pairing
remains visibly unconfigured and outside this accepted direct-wallet scope.

Experience: https://ipo.one. Private exact acceptance summary:
`bnb-001/bnb004-final-public-acceptance.json`; asset verification:
`bnb-001/bnb004-final-public-assets.json`. API lifecycle originals retain their
actual source revisions; final-source visible recovery and asset checks supplement
rather than relabel them. The local 8955 review listener remains available.

## Role/MFA unavailable-state continuation — 2026-10-05

Current instruction: continue from this working tree; prepare the smallest
truthful role/MFA correction and exact-source hosted acceptance evidence. Do not
deploy, grant privileges, enable funds or weaken approval requirements without
human review. This continuation does not reuse earlier conditional promotion
permission as permission to deploy now.

Authority: Constitution v1.7, DEC-PUBLIC-NO-FUNDS-BETA-001 and
DEC-BNB-NO-FUNDS-001; the Founder-confirmed ordinary Human and Principal/Agent
public scope above remains distinct from private management. The September 12
PASS remains historical evidence for source `59cb6c1`, not acceptance of these
working-tree changes. No public management identities or MFA adapters are added.

Smallest treatment: `/auth/v1/options` explicitly returns `riskPasskey: false`
when that adapter is absent. The public access dialog explains which workflows
are public and that Capital Partner/Risk/Operations/Auditor workspaces remain
private, with named bindings, strong authentication and a separately reviewed
release required for public management. The existing review workspace shows a
visible unavailable MFA panel, disabled Passkey controls, reason and recovery
condition. Failed/checking discovery cannot reuse earlier Passkey availability.
Reviewed local Passkey composition remains available; server authorization,
independent approval rules, role enrollment and financial operations are unchanged.

Changed scope: four application files (Human access route, access presentation,
web application and HTML), three existing test files and one new rendered test.
Migration impact: none. No dependency, policy, credential or deployment change.
Rollback: revert only this continuation's isolated diff, preserving all earlier
working-tree edits and durable data. Pre-edit copies are retained at
`/private/tmp/bnb004-role-mfa-before`; isolated diff is
`output/playwright/bnb004-role-mfa/continuation.patch`.

Validation:

- 40 focused discovery, Passkey, independent-approval-security and hosted
  migration-profile tests pass. Public privileged-role requests and attempts to
  compose local-only MFA publicly remain rejected.
- Three production-runtime HTTP/PostgreSQL integration cases pass for 84532,
  97 and 56, including EIP-191 authentication, durable Human commands and
  logout/re-login. They ran in newly created loopback database
  `ipo_one_bnb004_mfa_test_20261005`; no hosted database was written.
- Seven rendered tests pass: ordinary Human/Principal Evidence visibility,
  public boundary at 1440/390 in Light/Dark, unavailable MFA and failed capability
  discovery. Initial test-selector failures were corrected to use visible
  “Open IPO.ONE”; they are not product acceptance evidence. Fixture servicing
  queue reads are unsupported and fail closed; these tests establish presentation
  only, not management workflow completion.
- Current UI baseline, source/boundary lint and web-bundle integrity pass.
  Focused diff whitespace check passes. A broad working-tree diff check reports
  pre-existing generated WalletConnect vendor whitespace, left unchanged.
- Full release gates have not been rerun or claimed. This is an unsealed modified
  working tree, not a deployable release candidate. The isolated change does not
  justify reclassifying historical full-suite results as current release results.

Exact-source preparation: `output/playwright/bnb004-role-mfa/` contains test logs,
rendered screenshots, the isolated patch, a 1,314-file source fingerprint,
unchanged 77-entry hosted migration manifest, and read-only live observations.
Base HEAD is `9636ec2d8edcf93dff8b5c73da83d5899b80b988`; modified source-set SHA256
is `82b11dac3ec4c6fb676e784854ecad67e3fe8bc26864402765a690dc11e84dde`.
That digest identifies the enumerated source bytes, not a Git commit or sealed
bundle. Do not build from HEAD and claim it includes these changes.

Live read-only observation at 2026-10-05 19:56 UTC: `https://ipo.one/readyz`
returns source `59cb6c10694a648d722d683180db9a6203c5a1e6`, Primary public no-funds
profile and `realFundsEnabled=false`. Anonymous authentication discovery lists
only Human and Principal wallet entry and networks 84532/1952/97/56. The old
response omits `riskPasskey`; absence is not evidence of installed MFA. No
private membership inventory, privileged login or authenticated hosted acceptance
was performed in this continuation.

Five-state evidence for this correction:

| State | Evidence / remaining gate |
| --- | --- |
| CODE | Enumerated working-tree hashes and isolated regression-tested patch |
| RUNTIME | Local production-composition tests and rendered UI fixture only |
| DEPLOYED | NOT DEPLOYED; live source is the separate historical `59cb6c1` |
| REACHABLE | Local visible UI checks pass; hosted correction remains pending |
| VERIFIED | Local checks pass; exact deployed-source acceptance remains pending |

Hosted acceptance after human review must:

1. Seal the reviewed current source into a clean commit; bind the compiled asset,
   configuration and unchanged migration manifests to that exact SHA. Run all
   required release gates, retaining existing local-only migration exclusions.
2. Obtain required deployment review before any release action. Record the exact
   deployed SHA and match served authored assets to the sealed bundle; separately
   account for server-injected HTML metadata and compiled workspace CSS.
3. Through visible public controls at desktop/narrow widths in both themes,
   inspect the management-unavailable explanation and ordinary role entry. Confirm
   discovery reports `riskPasskey=false`, special roles are not self-enrollable,
   and no unavailable MFA action is operable. Verify failure/retry behavior.
4. Retest authenticated Human and Principal recovery/Evidence on 56 and 97 and
   authorized Agent HTTPS recovery against that same SHA with durable services.
   Historical Agent credentials expired September 18; do not reuse, extend or
   replace them without the required review. Do not repeat economic commands to
   manufacture evidence or claim old wallet signatures as current acceptance.
5. Keep public management servicing explicitly unavailable. Any future enablement
   separately requires reviewed identities, MFA and independent-approval adapters,
   expiry/revocation/role-isolation tests and actual durable servicing acceptance.

**BLOCKED — NOT COMPLETE** for deployment and hosted acceptance of this correction.
No deployment, hosted mutation, privilege grant, funds enablement or approval
relaxation occurred. UI review (synthetic fixture, not a live account) remains at
<http://127.0.0.1:4214/?preview_data=fixture#risk-operations>; the existing durable
review listeners were not replaced. Current public experience: <https://ipo.one>.
