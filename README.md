# IPO.ONE

**The machine-readable credit obligation layer for the Agent economy.**

IPO.ONE is an Agent-first, human-compatible, multi-chain-ready credit infrastructure protocol. It is built around a simple but powerful primitive:

```text
Identity + Payment + Obligation
```

Stablecoins made value programmable. Agent payment protocols are making machine-to-machine commerce native to the web. IPO.ONE adds the missing layer: a verifiable obligation system that can answer who is responsible, what value was advanced, where it can be spent, how repayment is captured, and whether the obligation was honored.

This repository contains the public interactive MVP for the **Agent Lockbox Credit Primitive**. It demonstrates a production-limited credit loop for revenue-generating AI agents without real lending, real fund movement, public LP vaults, token incentives, or black-box credit scoring.

## Why IPO.ONE Exists

The next generation of digital credit will not look like a traditional lending app. It will be made of programmable obligations attached to agents, humans, organizations, wallets, cashflow routes, repayment events, and attestations.

IPO.ONE is designed to become that protocol layer:

- **Identity**: Agent, Human, Organization, Originator, Principal, and CAIP-10 account references.
- **Payment**: stablecoin-ready routing, provider spend, lockbox revenue capture, and repayment instructions.
- **Obligation**: credit terms, spend policy, repayment state, default state, restructure state, audit events, and attestations.

The MVP starts with Agents because their cashflows can be captured programmatically. Human credit support is intentionally schema/prototype/mock only at this stage.

## The MVP

The first vertical slice proves the Agent Lockbox loop:

1. Create an Agent Subject.
2. Bind an economic Principal.
3. Bind a mock CAIP-10 wallet account.
4. Create an Agent Lockbox.
5. Request a deterministic, explainable credit line.
6. Spend only with allowlisted providers.
7. Capture Agent revenue into the Lockbox.
8. Route repayment automatically.
9. Emit repayment, obligation, and audit events.
10. Review exposure, utilization, risk state, and event history in the Admin surface.

The demo also includes a transparent Credit Learning Engine. It is deterministic and rule-based: repayment quality, revenue capture, utilization, rejected spend, and default-like events update a visible score and next-cycle recommendation. It is not ML, not reinforcement learning, and not a production credit score.

## What Makes It Different

IPO.ONE is not trying to be another overcollateralized lending market. It is designed for cashflow-constrained obligations where the most important questions are:

- Can the subject be identified?
- Can responsibility be bound to a Principal?
- Can the funds be limited to an approved purpose?
- Can repayment cashflow be captured before it leaks?
- Can repayment and default state be verified?
- Can that state travel across platforms, wallets, providers, and chains?

That makes IPO.ONE closer to a credit-state protocol than a lending app.

## Architecture

```text
apps/
  api/                 Node HTTP API and static frontend server
  web/                 Interactive browser MVP

packages/
  domain/              Shared enums, validators, IDs, states, and builders
  mvp-flow/            Vertical-slice composition and demo orchestration

modules/
  identity/            Principals, subjects, and CAIP-10 account bindings
  lockbox/             Lockbox lifecycle and revenue capture
  obligation/          Obligation lifecycle and repayment accounting
  spend-policy/        Provider allowlists and spend approval
  risk/                Deterministic credit-line decisions and controls
  payment/             No-fund-movement payment and repayment instructions
  settlement/          Settlement records
  credit-learning/     Transparent reputation scoring and recommendations
  event-audit/         Append-only event store
  admin/               Exposure, risk, and audit views

db/
  migrations/          Baseline schema for the MVP domain
```

The system is intentionally event-sourced, versioned, and adapter-oriented. The MVP runs locally with in-memory persistence, but the domain model is shaped for future database-backed services, contract adapters, provider integrations, and multi-chain event indexing.

## Quickstart

```sh
npm install
npm run dev
```

Open:

- Frontend: `http://127.0.0.1:3000`
- Health check: `http://127.0.0.1:3000/healthz`
- Vertical-slice API demo: `http://127.0.0.1:3000/v1/demo/vertical-slice`

Reset the demo from the UI or with:

```sh
curl -X POST http://127.0.0.1:3000/v1/demo/reset
```

## Core API Surface

- `POST /v1/agents`
- `POST /v1/agents/:id/wallet-bindings`
- `POST /v1/agents/:id/lockbox`
- `POST /v1/agents/:id/credit-line`
- `POST /v1/spend-requests`
- `POST /v1/settlements`
- `POST /v1/revenue-capture`
- `POST /v1/repayments/auto`
- `POST /v1/credit-learning/evaluate`
- `POST /v1/demo/cycles/healthy`
- `POST /v1/demo/cycles/risky`
- `POST /v1/demo/cycles/recovery`
- `GET /v1/agents/:id/status`
- `GET /v1/agents/:id/credit-profile`
- `GET /v1/admin/audit`
- `GET /v1/demo/vertical-slice`

## Credit Learning Engine

The MVP reputation engine starts each demo Agent at score `500` and records every change as an auditable reputation signal.

Positive signals include:

- on-time repayment
- full repayment
- high revenue capture
- low utilization
- healthy repeat cycles

Negative signals include:

- late repayment
- rejected risky spend
- high utilization
- default-like events
- admin freeze events

The output is deliberately explainable:

- current score
- risk tier
- next recommended credit limit
- demo rate recommendation
- reasons and signal history

This design keeps the MVP honest: no universal black-box score is exposed before real repayment history exists.

## Safety Boundaries

This repository is a product and engineering MVP. It does not execute regulated financial activity.

It does **not** include:

- real lending
- real stablecoin movement
- production credit underwriting
- public liquidity pools
- arbitrary withdrawals
- human cash loans
- token issuance
- DAO governance
- production KYC or raw PII storage
- production ML/RL credit models

Human compatibility is present through schemas, mock flows, consent/KYC reference boundaries, originator placeholders, loan tape simulation, and reserved obligation states. Real human credit would require licensed originator review, legal review, first-loss design, loan tape controls, stop-loss covenants, and human approval.

## Validation

```sh
npm run check
npm run demo
```

`npm run check` runs dependency-boundary validation and the full Node test suite. The current MVP covers identity, wallet binding, lockbox revenue capture, spend policy, repayment routing, obligation state, risk controls, credit learning, admin visibility, and the public interactive flow.

## Roadmap

Near-term engineering milestones:

1. Replace in-memory demo persistence with repository-backed persistence.
2. Add OpenAPI documentation and stricter request validation.
3. Add Playwright smoke tests for the interactive frontend.
4. Introduce contract skeletons only after fund-path human review.
5. Add provider adapter interfaces for real API, model, compute, and tool providers.
6. Add deployment controls, RBAC, audit logging, and production-grade risk gates.

Longer-term protocol milestones:

1. Agent Credit Network.
2. Originator sandbox and loan tape reporting.
3. Human-compatible obligation execution through licensed partners.
4. Credit Passport and attestation APIs.
5. Multi-chain credit state normalization.
6. Institution-grade reporting and capital routing.

## Project Status

This is an early public MVP of a larger protocol vision. The purpose of this repository is to make the core obligation loop inspectable, runnable, testable, and reviewable.

The long-term ambition is not simply to finance agents. It is to define the trust layer where agents, humans, originators, providers, wallets, and capital can share verifiable credit state.
