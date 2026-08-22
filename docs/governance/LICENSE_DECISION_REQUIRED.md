# License decision required before public M2 contracts/SDK

Status: Founder/legal decision required; no license added

## Current fact

At base commit `71786a3c72237320f7bacf77b64496dd1a0c526f`, the repository has no root
`LICENSE` file. Individual Solidity files use SPDX `MIT`, but that header does
not establish a complete repository-wide distribution policy for application,
SDK, documentation and contract source.

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

## Founder/legal choices to record

Before M2 contract publication, select and document:

1. whether the repository, contracts, SDK and documentation share one license
   or use explicit per-directory licenses;
2. the chosen approved license text and copyright holder/year;
3. contribution policy or contributor agreement/DCO posture;
4. third-party notices and source-offer obligations;
5. whether deployment source verification is allowed before a broader SDK/app
   license; and
6. treatment of existing SPDX headers if they conflict with the chosen policy.

Candidate models (MIT/Apache-2.0/open-core/source-available/proprietary) have
different commercial, patent, contribution and redistribution consequences.
Phase 0 intentionally makes no recommendation because this is a Founder/legal,
not engineering, choice.

## Gate

`M2A-002` may prepare a dependency/license inventory but must not add a license,
copy third-party protocol code or publish reusable claims until the decision is
recorded. Contract deployment/source verification also remains separately
gated.

Permission/funds/deployment impact: **none**. This file grants no reuse,
distribution, contract, deployment or funds authority.
