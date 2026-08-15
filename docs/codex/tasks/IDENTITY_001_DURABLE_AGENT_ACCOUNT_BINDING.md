# IDENTITY-001: Durable Agent Account Binding and Subject Activation

Status: Implemented and verified locally in the no-real-funds profile on
2026-07-16. The project owner approved all three permission changes. This
approval and implementation do not grant funds, Offer acceptance, production
identity, deployment, or public transport authority.

## Context

`pilotCreateAgentSubject` durably creates an owned Agent Subject and controller
bindings, but the resulting Subject is `pending`. `pilotCreateDraftMandate`
correctly accepts a pending Subject, while `pilotActivateSandboxMandate`
correctly requires that Subject to be `active`.

Before this increment, the private Tenant protocol had no durable operation
that proved a CAIP-10 account binding and transitioned a newly created Agent
Subject to `active`. The public demo's mock wallet binding was not an
authenticated, restart-safe, or production-limited substitute.

This issue closes that onboarding gap without allowing a Human to invent an
Agent credential, allowing an Agent to activate itself without proof, or
creating funds authority.

## Proposed Three-Part Permission Change

### 1. Principal creates an exact owned binding challenge

- Add `agent_account.challenge.create.owned` only to the authenticated Human
  controller of the exact pending Agent Subject.
- The Principal supplies one normalized CAIP-10 account ID, intended account
  purpose, and the already bound Agent actor ID. Tenant, Principal, Subject,
  controller, and Agent binding come from trusted state.
- The server returns a short-lived, one-use challenge with chain/domain,
  Subject ID, account hash, purpose, nonce, issued-at, expiry, and protocol
  version. It never returns a credential, private key, or authorization token.

### 2. Bound Agent submits chain-specific ownership proof

- Add `agent_account.proof.submit.self` only to the existing authenticated
  Agent actor bound to that exact Subject and challenge.
- For EVM test profiles, verify an EIP-712 proof whose domain includes the
  CAIP-2 chain ID and IPO.ONE protocol version. Cross-chain, cross-Tenant,
  cross-Subject, expired, reused, malformed, or high-s proofs fail closed.
- Keep verification behind a chain-account-proof adapter so Base Sepolia and X
  Layer remain profiles, not architecture boundaries. Non-EVM proof schemes
  require separate adapters and conformance tests.

### 3. System atomically binds and activates verified state

- Add `agent_subject.activate.verified` only as an internal transition emitted
  by successful proof verification; no Human, Agent, Developer, Operator,
  Risk, Auditor, public HTTP, or MCP caller receives this capability directly.
- In one serializable transaction, consume the challenge, create the durable
  AccountBinding, transition the exact pending Subject to `active`, append
  Event/Evidence/outbox records, update authorization-resource versions, and
  commit replay metadata.
- Exact replay returns the committed result. A changed proof or reused
  challenge fails without partial state.

## Proposed Operations

| Operation | Kind | Actor | Resource | Capability | Funds authority |
| --- | --- | --- | --- | --- | --- |
| `pilotCreateAgentAccountChallenge` | Idempotent mutation | Human controller | Exact owned pending Subject | `agent_account.challenge.create.owned` | No |
| `pilotSubmitAgentAccountProof` | Idempotent mutation | Bound Agent workload | Exact challenge / Subject | `agent_account.proof.submit.self` | No |
| `pilotReadAgentAccountBinding` | Query | Bound Human or Agent | Exact owned binding | Existing owner/self read policy | No |

The internal Subject activation is not a caller-selectable operation.

## Scope

- Durable challenge, proof attempt, AccountBinding, Subject transition, Event,
  Evidence, outbox, replay, audit, RLS, reconciliation, and exact-resource
  authorization.
- CAIP-2/CAIP-10 validation and Base Sepolia/X Layer EVM proof conformance.
- Human UI states for challenge created, awaiting Agent proof, verified/active,
  expired, rejected, and retry with a new challenge.
- Agent MCP may submit only its own exact proof; it cannot create the challenge
  or change Subject/Mandate authority.

## Non-Goals

- No credential issuance, key storage, wallet connection SDK, arbitrary
  account import, production chain, mainnet signature, transaction, custody,
  balance read, funds movement, Offer acceptance, Obligation, execution,
  repayment, remote MCP, public endpoint, or deployment.
- No Operator override that marks a Subject active without the verified proof
  transaction.
- No raw signature or account address in Event/Evidence/log payloads; store
  normalized encrypted references and hashes according to the privacy model.

## Likely Files

- `packages/domain/src/*`
- `packages/api-contract/src/tenant-protocol.js`
- `packages/api-contract/index.d.ts`
- `schemas/v2/*account*`
- `modules/tenant-command-gateway/src/*`
- `modules/authentication/src/*`
- `modules/authorization/src/*`
- `modules/persistence/src/*`
- `modules/chain-adapter/src/*`
- `apps/tenant-api/*`
- `apps/agent-mcp/*`
- `apps/web/src/*`

## Acceptance Criteria

- [x] Only the exact Human controller can create a challenge for its pending
  Agent Subject, and only the already bound Agent actor can submit the proof.
- [x] Cross-Tenant/resource guessing, replay, expiry, wrong chain, wrong
  account, wrong Subject, wrong actor, malformed proof, freeze, and capacity
  failures leave no partial binding or activation.
- [x] Successful proof atomically creates one AccountBinding and changes the
  exact Subject from `pending` to `active`, with restart-safe replay and full
  Event/Evidence/audit/reconciliation coverage.
- [x] A newly active Subject can pass the existing Principal exact-hash Mandate
  activation without broadening the Mandate or actor role.
- [x] Human UI and Agent MCP complete the challenge/proof handoff without
  rendering credentials, private keys, raw proof material, or real-value
  claims.
- [x] Base Sepolia and X Layer proof conformance share the same adapter contract
  and reject chain replay.

## Test Commands After Approval

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run test:transport
pnpm run test:chain:conformance
git diff --check
```

## Security Checklist

- [x] Activation is derived only from successful proof verification inside the
  atomic transaction; no caller can pass `status=active`.
- [x] Challenge entropy, TTL, single use, domain separation, signature
  malleability, and chain replay are tested.
- [x] Trusted authentication context supplies Tenant and actor identity; no
  browser/MCP identity or capability fields are accepted.
- [x] RLS, exact-resource ownership, freeze, quotas, caps, idempotency, audit,
  and reconciliation remain fail closed.
- [x] Logs and Evidence contain hashes and bounded reason codes, never secrets,
  private keys, raw signatures, or unencrypted account identifiers.

## Approval Gate

- [x] Approve Human-owned challenge creation.
- [x] Approve bound-Agent proof submission for Base Sepolia/X Layer test
  profiles.
- [x] Approve atomic verified AccountBinding plus pending-to-active Subject
  transition, with no direct caller activation capability.

## Implementation and Verification

- The EVM proof adapter implements one EIP-712 v1.1 contract for Base Sepolia
  (`eip155:84532`) and X Layer Testnet (`eip155:1952`) with strict CAIP-10,
  low-s signature, expiry, mutation, and cross-chain rejection.
- Migration `0016` adds tenant-isolated challenge and proof-attempt projections,
  AccountBinding v2 constraints, immutable lifecycle guards, and the verified
  pending-to-active Subject activation guard.
- The authenticated Tenant protocol now exposes the three approved operations.
  The Human workbench creates and reviews the signing request; the six-tool
  local Agent MCP surface submits the proof and reads only hash-redacted binding
  state. An elapsed challenge is atomically expired before a replacement is
  issued, while an unexpired challenge blocks duplicate issuance.
- `.nvmrc` and `.node-version` pin Node `24.18.0`; all verification below ran
  with that exact runtime and pnpm `11.1.3`.
- Verification evidence: repository checks and unit suite `224/224`, security
  `21/21`, authenticated HTTP/MCP transport `22/22`, chain conformance `4/4`,
  fresh-database PostgreSQL integration `53/53`, focused identity/adapter/UI
  tests `8/8`, and `git diff --check` clean.
