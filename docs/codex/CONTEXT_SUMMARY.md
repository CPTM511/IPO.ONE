# IPO.ONE Codex Context Summary

## Documents Read

- `AGENTS.md`
- `docs/guidance/IPO_one_Product_Description_and_PRD_v1.md`
- `docs/guidance/IPO_ONE_MVP_Build_PRD_Technical_Architecture_Codex_Task_Spec_v0.1_FINAL.md`
- `docs/guidance/IPO_ONE_ARCHITECTURE_REVIEW_v0.2_DRAFT.md`
- Mission attachment: `IPO.ONE - Codex Autonomous Sequential MVP Build Mission v2.1`

## Core Product Goal

IPO.ONE is a machine-readable credit obligation protocol layer for human and AI-agent economies. The MVP proves an Agent-first loop:

Agent identity -> principal/account binding -> Lockbox -> limited credit line -> allowlisted provider spend -> policy-bound Transfer Intent -> explicit settlement receipt/finality -> revenue capture -> automatic repayment -> obligation update -> event/audit trail.

## MVP Scope

- Production-limited Agent Lockbox Credit Primitive.
- Agent Subject creation and economic Principal binding.
- CAIP-10 account binding with chain-agnostic IDs.
- Allowlisted Provider spend only.
- Lockbox revenue capture and repayment waterfall.
- Repayment, default, risk, and admin audit events.
- Human-compatible schemas and simulator-only states.
- Multi-chain-ready identifiers, event records, and cap interfaces.

## Non-Goals

- No real human lending.
- No public LP vaults or pools.
- No token launch or DAO governance.
- No arbitrary withdrawal or unrestricted recipient spend.
- No black-box AI credit scoring.
- No complex cross-chain credit execution.
- No production fund movement or deployment from Codex.
- No raw KYC, PII, private keys, seed phrases, or borrower raw data in code, logs, prompts, or fixtures.

## Domain Model

The protocol primitive is `Identity + Payment + Obligation`, not a generic lending app. Shared domain contracts must keep these concepts separate:

- `Subject`: Agent, Human, Org, or Originator actor.
- `Principal`: economic responsibility holder.
- `WalletAccount` / `AccountBinding`: CAIP-10 account reference and verification record.
- `Lockbox`: Agent revenue capture container.
- `CreditLine`: limited usable credit governed by risk decisions.
- `Obligation`: economic promise and repayment state.
- `Provider`: allowlisted spend recipient.
- `SpendRequest` / `SpendPolicy`: purpose and recipient controls.
- `Mandate`: revocable delegated authority and amount/counterparty scope.
- `Rail` / `TransferIntent` / `SettlementReceipt`: adapter-neutral payment transport, quote, finality, and reversal evidence.
- `Ledger`: append-only double-entry accounting truth for Lockbox value state.
- `Evidence`: versioned hashed envelope for every appended protocol event.
- `Repayment`: revenue applied to an obligation.
- `RiskDecision`: deterministic, explainable risk output.
- `CreditEvent`, `AuditEvent`, `AdminAction`: append-only evidence.

## Required State Machines

- Subject: `pending`, `active`, `suspended`, `closed`
- Lockbox: `created`, `active`, `frozen`, `closed`
- Obligation: `created`, `active`, `partially_repaid`, `fully_repaid`, `overdue`, `defaulted`, `closed`
- Spend Request: `requested`, `approved`, `rejected`, `settled`, `failed`
- Transfer Intent: `created`, `quoted`, `authorized`, `submitted`, `pending`, `settled`, `failed`, `reversed`, `expired`
- Risk Action: `none`, `reduce_limit`, `freeze_lockbox`, `suspend_subject`, `close_credit_line`

Human-compatible states such as KYC pending, DPD, restructured, repurchased, and written off are reserved for schema/simulator use only.

## Required Modules

- `event-audit`
- `authorization`
- `identity`
- `ledger`
- `lockbox`
- `obligation`
- `spend-policy`
- `risk`
- `payment`
- `persistence`
- `plugin-registry`
- `rail`
- `settlement`
- `admin`

## Security Constraints

- Every financial or risk state change must emit a credit event or audit event.
- Modules communicate through public service interfaces or events.
- No module may directly mutate another module's internal state.
- Credit spend must use allowlisted Providers only.
- Active obligations must be repaid from Lockbox revenue before surplus release.
- Human prototype data must not include raw PII.
- Multi-chain IDs must be chain-agnostic and must not use chain-local counters as business identifiers.

## Testing Requirements

- Unit tests for validators, state transitions, risk rules, and module services.
- Failure tests for invalid transitions, disallowed providers, over-limit credit use, and human-production lending attempts.
- Integration test for the Agent Lockbox vertical slice.
- Boundary lint for module imports and required skeleton files.
- OpenAPI parity checks for every implemented route, stable Problem Details,
  request correlation, and SDK method coverage.

## Document Conflicts

The v0.2 architecture audit identified material semantic differences that must be resolved before production work:

- Product guidance says early releases should expose repayment evidence rather than a universal score, while the interactive mission requires a fixed demo score and rate recommendation. The score is therefore a synthetic/demo view, not canonical protocol truth.
- Product and Build specs include authorization/funding/frozen obligation states that the local mission implementation simplifies to `created -> active`. A canonical state machine still needs a reviewed ADR.
- The target architecture is event-sourced. Most current services still mutate in-memory state and append evidence, while Rail now shares one asynchronous repository port across the default EventStore and a crash-tested PostgreSQL event runtime. Broker operation, reconciliation workers, and PostgreSQL coverage for non-Rail modules remain open.
- The Build Spec requires issue-by-issue delivery, while the public-demo mission requested a broader full-stack pass. The resulting browser demo must not be confused with the production MVP launch gate.
- Node SHA3-256 is not Ethereum Keccak-256. Demo IDs now use a separate `IPO_ONE_DEMO_V1` domain; production protocol IDs need reviewed encoding and cross-language test vectors.

See `docs/guidance/IPO_ONE_ARCHITECTURE_REVIEW_v0.2_DRAFT.md` for the proposed resolution and target model.
