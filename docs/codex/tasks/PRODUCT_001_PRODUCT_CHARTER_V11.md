# PRODUCT-001: Product Charter v1.1 and Dual-Native Baseline

Status: Complete in repository on 2026-07-14; human review remains required for
future real-value, production-chain, legal, capital, and permission decisions.

## Context

The Founding Edition whitepaper defined Single Kernel, Dual Entry, but project
guidance still prioritized an Agent-only production MVP and treated Human work
as schema/prototype scope. The Founder has ratified the whitepaper as Product
Charter v1.1 and directed parallel Human and Agent product development over one
shared kernel.

## Scope

- Preserve the Founding Edition DOCX as a versioned source archive.
- Publish the canonical Product Charter v1.1 Markdown interpretation.
- Update repository guidance hierarchy and dual-native MVP boundaries.
- Define Base Sepolia and X Layer Testnet as reversible test profiles.
- Define the complete no-real-funds product lifecycle and commercialization
  gates.

## Non-Goals

- No product UI implementation or visual-direction selection.
- No real Human or Agent lending, capital, custody, KYC processing, or funds.
- No production chain, contract, RPC, indexer, provider, or deployment change.
- No pricing, legal role, jurisdiction, or compliance-provider approval.

## Likely Files

- `AGENTS.md`
- `docs/guidance/IPO_ONE_PRODUCT_CHARTER_v1.1.md`
- `docs/guidance/IPO_ONE_Product_Charter_v1.1_Founding_Edition.docx`
- `docs/guidance/IPO_ONE_DUAL_NATIVE_EXECUTION_PLAN_v0.1.md`
- `docs/codex/tasks/*`

## Acceptance Criteria

- [x] v1.1 is explicitly canonical and v1.0 conflict behavior is defined.
- [x] Human and Agent are parallel first-class product modes over one kernel.
- [x] A full Human no-real-funds lifecycle is in scope without approving real
  Human lending.
- [x] UI and Agent machine interfaces are explicit product requirements.
- [x] Initial multi-chain test profiles and their non-production status are
  explicit.
- [x] The source archive hash matches the supplied Founding Edition.

## Test Commands

```sh
shasum -a 256 docs/guidance/IPO_ONE_Product_Charter_v1.1_Founding_Edition.docx
git diff --check
pnpm run check
```

## Security Checklist

- [x] No secrets, private keys, raw PII, KYC data, or customer data added.
- [x] No real-value capability or deployment permission granted.
- [x] Human private-data and real-credit gates remain explicit.
- [x] Chain profiles are test-only configuration, not production approval.
- [x] Contracts, funds, permissions, risk, and production remain human-gated.
