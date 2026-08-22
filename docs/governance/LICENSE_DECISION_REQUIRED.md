# IPO.ONE repository license decision

Status: Founder-approved and recorded 2026-08-22

Decision owner: IPO.ONE Founder / Product / Governance

## Decision

1. The repository, contracts, SDK, application source, examples, and
   documentation use one root MIT License.
2. Copyright line: `Copyright (c) 2026 IPO.ONE`.
3. New inbound contributions use Developer Certificate of Origin 1.1 sign-off;
   no separate CLA is required at this stage.
4. Third-party dependencies retain their upstream licenses and notices. Their
   source is consumed only through exact reviewed dependencies; no Aave or other
   lending-protocol source is copied.
5. Contract source verification is permitted only for a separately approved
   deployment. The MIT License does not authorize deployment, a signer, an
   account, an oracle, funds, mainnet, or production.
6. Existing Solidity `SPDX-License-Identifier: MIT` headers remain consistent
   and unchanged.

The authoritative files are `LICENSE`, `DCO`, `CONTRIBUTING.md`, and
`THIRD_PARTY_NOTICES.md`.

## Current fact

At base commit `71786a3c72237320f7bacf77b64496dd1a0c526f`, the repository had no root
`LICENSE` file. That gap is resolved by this decision and the root MIT License.

## Why M2 makes the decision material

A public testnet pool exposes verified contract source and encourages wallet,
SDK and integration use. Without a clear repository license, external parties
cannot reliably determine permission to copy, modify, redistribute or integrate
the code. Contributors and dependency notices also need a consistent policy.

This affects:

- publication and verification of pool source/ABI;
- external use of the SDK/OpenAPI examples;
- contribution terms and ownership of patches;
- distribution of contract, application and documentation artifacts;
- notices for OpenZeppelin, Foundry/forge-std and other dependencies; and
- any claim that code can be reused by partners or auditors.

## Dependency facts, not a project-license decision

- The proposed OpenZeppelin Contracts package is MIT-licensed.
- Foundry and forge-std are available under MIT or Apache-2.0 terms.
- Those permissions govern their code and notices; they do not automatically
  license IPO.ONE source.
- No Aave source is needed or proposed. Do not copy Aave code, headers,
  documentation or tests without a separate scope-specific license and
  architecture review.

## Gate

The license prerequisite for dependency admission is satisfied. Contract
implementation, deployment, and source verification remain separately gated by
their issue, launch policy, exact profile, and named approvals.

Permission/funds/deployment impact: **none**. The MIT License grants source reuse
rights; it does not grant operational, contract, deployment, signer, custody,
oracle, risk, transaction, or funds authority.
