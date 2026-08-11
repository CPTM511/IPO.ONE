# OKX-AGENT-001 — Reference Agentic Wallet Adapter

Status: IMPLEMENTED_UNVERIFIED — stopped for Founder review after this adapter

Delivery mode: `L0_LOCAL_NO_FUNDS`

Date: 2026-08-07

Baseline branch: `codex/m1-b-deployable-sandbox`

Baseline commit: `dfba8d7ec6390ec79df6df21886bcf3525702e69`

## Context and current baseline

The Founder accepted the first Phase 3 adapter capability Evidence and directed
continued development. `AGENTWALLET-001` and `METAMASK-AGENT-001` are
implemented but remain unverified until a sealed review state exists. The next
and final Phase 3 adapter issue in the controlling source is
`OKX-AGENT-001`. Work must stop for review when this adapter Evidence is
complete; Phase 4 must not start automatically.

Current OKX Onchain OS documentation describes Agentic Wallet integration via
Skills/MCP/CLI-style Agent workflows, TEE key isolation, transaction
simulation, risk grading and blocking. Those are vendor capability claims, not
cryptographic attestation or IPO.ONE authority. No exact remote tool contract,
credential, signer, endpoint or execution permission is approved here.

## Scope

- define an exact short-lived OKX Agentic Wallet capability-observation
  contract for Skills, MCP, CLI and Open API integration surfaces;
- normalize the observed surface, reviewed wallet/security tools, supported
  chains and TEE/simulation/risk claims into the canonical Agentic Wallet
  capability contract;
- create hash-only MCP/CLI invocation projections for exact security preflight
  and execution-read references, with no natural-language or generic command
  escape hatch;
- explicitly deny wallet send, transfer, batch transfer, approval management,
  arbitrary MCP service payment and unreviewed execution tools;
- normalize TEE/vendor execution references without treating a vendor claim,
  transaction hash or acknowledgement as canonical execution or settlement;
- normalize simulation, risk grade, identity verification and interception
  facts into `ALLOW`, `STEP_UP`, `DENY` or `QUARANTINE` while preserving the
  mandatory IPO.ONE preflight gate;
- expose one exact nine-method disabled local reference Provider satisfying the
  vendor-neutral SPI;
- add closed JSON Schemas, negative conformance tests and completion Evidence.

## Non-goals

- no installation of `okx/onchainos-skills`, MCP server, CLI, SDK or package;
- no login, email/OTP/social flow, wallet creation, API key, passphrase,
  credential file, `.env`, session, TEE connection or attestation request;
- no natural-language tool routing, generic MCP forwarding, shell command,
  subprocess, HTTP/Open API or remote endpoint call;
- no `wallet send`, batch transfer, swap, trade, approval revocation,
  autonomous payment, x402/APP payment, deposit, withdrawal or consolidation;
- no signing, transaction simulation call, broadcast, tracking, UserOperation,
  chain write, Testnet/mainnet use or funds movement;
- no acceptance of the vendor's TEE/security claim as verified attestation;
- no new Provider, chain, venue, risk-limit, production, credential, signer,
  custody, deployment or real-value authority;
- no vendor business policy in the Kernel and no duplicate authorization,
  preflight, Ledger, Obligation, settlement, reconciliation or Evidence logic;
- no Phase 4 or Hyperliquid execution implementation.

## Likely files

- `modules/agentic-execution/src/okx-agentic-wallet-adapter.js`
- `modules/agentic-execution/src/okx-agentic-wallet-risk.js`
- `modules/agentic-execution/src/index.js`
- `modules/agentic-execution/test/okx-agentic-wallet-adapter.test.js`
- `schemas/v2/okx-agentic-wallet-capability-observation.schema.json`
- `schemas/v2/okx-agentic-wallet-invocation-projection.schema.json`
- `schemas/v2/okx-tee-execution-reference.schema.json`
- `schemas/v2/okx-agentic-wallet-risk-receipt.schema.json`
- `scripts/check-schemas.mjs`
- `docs/codex/audits/OKX-AGENT-001/audit.md`

## Given / When / Then acceptance criteria

1. Given a trusted local capability observation, when it is normalized, then
   only exact observed surfaces/tools/chains become supported; missing,
   malformed or unknown facts remain non-permissive.
2. Given Base Sepolia or X Layer Testnet, when a capability or invocation is
   prepared, then its CAIP-2 chain, descriptor, capability, observation,
   context-epoch, PreparedExecution and preflight hashes are exact and current.
3. Given an MCP/CLI projection, when validation runs, then only reviewed
   `security_tx_scan`, `security_sig_scan` or `wallet_history` references are
   representable; natural-language prompts, raw commands, tool names, arguments
   and generic forwarding are rejected.
4. Given an attempt to project wallet send, transfer, batch transfer, swap,
   payment, approval or arbitrary execution, when policy is evaluated, then the
   result is `DENY` without external invocation.
5. Given a vendor TEE claim without a separately verified attestation, when an
   execution reference is normalized, then the result cannot be `ALLOW`, cannot
   activate authority and cannot confirm canonical execution or settlement.
6. Given risk facts, when simulation fails/unknown, identity fails/steps up,
   risk is high/critical/unknown, or interception blocks/unknown, then the exact
   decision is fail-closed and stale receipts are unusable.
7. Given a vendor acknowledgement or `unknown` external result, when normalized,
   then retry remains blocked until canonical reconciliation; no Ledger or
   settlement mutation is permitted.
8. Given the reference Provider is registered, when any operation is invoked,
   then static registry gating rejects it before any external call.
9. Given open fields, raw credentials, addresses, prompts, commands, responses,
   signatures, transaction payloads or attestation blobs, when validation runs,
   then they are rejected and not retained.
10. Given completion Evidence, when reviewed, then no package, credential,
    Provider call, wallet state, TEE state, transaction, chain or funds state
    exists and Phase 4 has not started.

## Exact test commands

```bash
node --test modules/agentic-execution/test/okx-agentic-wallet-adapter.test.js
pnpm run check:schemas
pnpm run typecheck
pnpm run lint
pnpm test
```

## Security checklist

- [x] Adapter descriptor and every external integration surface are disabled.
- [x] Capability source is local synthetic, short-lived and hash-bound.
- [x] Unknown capability, chain, tool or risk fact is non-permissive.
- [x] MCP/CLI integration has no generic command, prompt, argument or forwarding
      surface.
- [x] Value-moving and permission-changing vendor tools are denied.
- [x] TEE vendor claims are not treated as verified attestation.
- [x] Canonical preflight is still required after any vendor security result.
- [x] Unknown external outcomes block retry pending reconciliation.
- [x] Raw credentials, addresses, signatures, transaction data, attestation
      blobs and Provider responses are not accepted or retained.
- [x] No external execution, production or funds authority exists.

## Permission boundary

The continuation instruction authorizes this local synthetic/no-funds
reference adapter and Evidence only. It does not authorize installing or
invoking OKX software, registering MCP, running a CLI, creating/logging into a
wallet, using a TEE, obtaining credentials, simulating or signing externally,
broadcasting a transaction, using a chain, deploying, trading, transferring or
moving funds. Any such action needs a new named human permission review.

## Data and migration impact

No migration. New artifacts are immutable in-memory observations, projections,
references and receipts. No wallet address, credential, prompt, command,
attestation, transaction response, Event, outbox or financial record is stored.

## Rollback plan

Remove the two OKX adapter modules, index exports, focused test, four schemas,
schema registry entries, issue/audit documents and ADR status clarification. No
external or durable state exists to reverse.

## Required Evidence

- official-current capability mapping with explicit claim/attestation limits;
- exact changed-file list and baseline drift statement;
- negative proofs for unknown capability, unsafe tool, generic MCP/CLI escape,
  unverified TEE, stale risk, blocked transaction and unknown outcome;
- focused, schema, type, lint and full repository test results;
- explicit no-install/no-credential/no-call/no-signature/no-transaction/no-funds
  proof;
- clickable local product review URL;
- explicit Phase 3 stop before Phase 4.

## Dependency and sequencing notes

Depends on ADR-038, Phase 2, `AGENTWALLET-001`, and the reviewed
`METAMASK-AGENT-001` capability boundary. Vendor code remains outside the
Kernel. Completion of this issue ends the planned Phase 3 adapter sequence and
requires another review stop before any Phase 4 execution work.

## Completion Evidence

Implemented and stopped after the second Phase 3 adapter. See
`docs/codex/audits/OKX-AGENT-001/audit.md`.
