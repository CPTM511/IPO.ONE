# UX-002 Browser-operable shared credit audit

Date: 2026-07-31
Scope: local Closed Pilot, synthetic capital, Human and Agent shared credit kernel

## Reported failures

1. Human exact Offer confirmation could end with no visible result.
2. Repayment appeared to require maturity and did not explain early repayment.
3. Credit Passport and Credit Track Record opened as empty, navigation-only pages.
4. Agent Console made handoff download plus a local CLI the primary product path.
5. Evidence digests were easy to confuse with Base Sepolia transaction hashes.

## Root causes

- The browser resource-ID predicate coerced `null` and `undefined` to strings.
  Those strings matched the identifier regular expression, so a page render could
  dereference a missing Agent Mandate and leave the whole workspace at
  `Connecting`.
- A successful Offer acceptance could be visually reported as failed when the
  follow-up workspace refresh encountered a stale authentication session.
- Repayment was already allowed before maturity after execution, but the
  product copy did not say so and a fully repaid position looked like a disabled
  payment defect.
- Passport and Track Record relied on implicit browser state and provided no
  explicit recovery action.
- The Agent product described a secure developer handoff but did not expose an
  equivalent browser-operable reference Agent path.
- Agent Decision Passports were incorrectly validated against the Human-only
  identity-Evidence set.

## Implemented product behavior

- Human Offer acceptance uses an explicit account confirmation and preserves a
  committed result even if the subsequent workspace refresh fails.
- Rejected or ended sessions clear private browser state and reopen sign-in
  instead of leaving a silent spinner.
- Human repayment explicitly supports early partial or full repayment after
  execution, with no sandbox prepayment penalty. A zero-balance position points
  to another position or a new application.
- `Load my latest Decision` restores the current Human or Agent Decision
  Passport from authenticated state.
- `Load verified record` restores the exact Obligation and its server Evidence.
- Agent Console can call a registered, server-held reference Agent over a
  protected local HTTPS-style API route. The browser receives sanitized
  receipts only; no Agent credential, private key, raw signature, or funds
  authority is delivered to it.
- Local account binding can ask the already registered test Agent to submit its
  own one-use CAIP-10 proof online. External Agents submit the same challenge
  through the protected Agent API; download and CLI are optional transports.
- Handoff download, local stdio MCP, and CLI remain optional developer
  transports.
- Human and Agent continue to use the same Obligation, execution, repayment,
  servicing, Ledger, Event, and Evidence model.

## Browser acceptance performed

Human:

- Create Subject and scoped Consent.
- Request and evaluate credit.
- Review and acknowledge exact Offer.
- Confirm with account and create one Obligation.
- Execute the no-funds Obligation.
- Post a partial repayment before the first due date.
- Load Decision Passport.
- Load Credit Track Record from owned Evidence.

Agent:

- Create the one-use account challenge and ask the registered test Agent to
  prove it online without downloading a file.
- Run Request, Decision, and Offer online.
- Review and activate the exact Draft Mandate as Principal.
- Continue with the registered reference Agent.
- Create and execute the shared Obligation.
- Post early full repayment.
- Read Evidence.
- Review the controller-visible Agent Obligation.
- Load Agent Decision Passport and Credit Track Record.

## Evidence truth

An Evidence digest is an offchain integrity hash, not a transaction hash.
Key lifecycle Evidence is eligible for the configured Base Sepolia anchor
worker. The product may show a BaseScan link only after a real transaction is
submitted and the indexed/finality/reconciliation state is available.

The live local worker now uses the approved secondary Base Sepolia provider for
submission, nonce reads, and observation as one consistent provider slot.
Partial RPC propagation, including a receipt whose block is temporarily
unavailable, remains `unknown` and retryable instead of terminating the worker
or claiming finality. Existing anchor requirements are never resent solely
because a read provider is temporarily incomplete.

At verification time the worker was healthy, funded below its hard cap, and
configured for zero-native-value transactions. The durable database contained
real submitted anchor transaction hashes plus explicit `pending`, `broadcast`,
`included`, `safe`, and `finalized` states. A backlog is not represented as
finalized; each Evidence row remains pending until the finality observer records
the actual Base Sepolia receipt.

## Verification

- Browser-click Human lifecycle: passed, including account confirmation and
  early partial repayment.
- Browser-click Agent lifecycle: passed, including online application,
  Principal activation, shared Obligation, full repayment, Passport, and Track
  Record.
- Repository tests: 678 passed, 0 failed.
- PostgreSQL integration tests: 82 passed, 0 failed against an isolated
  ephemeral PostgreSQL 17 database.
- Web bundle, Agent HTTPS transport, Tenant protocol, product traceability, and
  local-stack contracts: passed.
- Live local stack and reference-Agent acceptance: passed.
- LOCAL-RC-002 successor checksum check: passed after the project-owner-approved
  seal. The old v1 manifest remains byte-identical and is pinned as the
  predecessor instead of being rewritten to conceal source drift.

## Screenshot index

Before:

- `before/human-offer-confirmation.png`
- `before/early-repayment-available-fixture.png`
- `before/credit-passport-navigation-only.png`
- `before/credit-track-record-navigation-only.png`
- `before/agent-download-cli-primary.png`

After:

- `after/human-obligation-created-and-repaid.png`
- `after/human-early-repayment.png`
- `after/human-credit-track-record.png`
- `after/agent-browser-lifecycle-complete.png`
- `after/agent-credit-passport.png`
- `after/agent-credit-track-record.png`
