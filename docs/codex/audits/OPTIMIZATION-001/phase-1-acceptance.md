# OPTIMIZATION-001 Phase 1 acceptance

Date: 2026-07-30

Status: accepted as a local no-funds release candidate

## Sealed source

- Release candidate: `ipo-one-local-rc-20260730-002`
- Candidate commit:
  `7f04aedebe6e624f1cc843298aa22f17b4b87d6f`
- Manifest SHA-256:
  `f07c96f11c610f7c4f8539aee88875f1678452a5ba48bb39abe6cf8dbdca51fa`
- Runtime: Node 26.5.0, pnpm 11.1.3, PostgreSQL 17
- Database: 47 ordered migration up/down pairs
- Human OpenAPI: `0.3.0-alpha.4`
- Shared Tenant protocol: `tenant_protocol.v1`
- Remote Agent transport: `agent_https_openapi.v1`, disabled pending approval

The release receipt binds the exact contracts, test fixtures, product
experience source, restart operations, acceptance sources, database baseline,
and CHAIN-001F checkpoint. Cloud mutation, remote participant access, mainnet,
real funds, external Provider execution, and venue signing remain disabled.

## Product result

- Signed-out entry has one visible Sign in action and four clear paths:
  Human, Agent, Capital Partner, and Developer/API.
- Private panels and private data remain hidden before authenticated server
  verification.
- Credit Passport uses the current server-known Subject and Credit Intent.
  Technical recovery and verifier tools remain available under progressive
  disclosure.
- Evidence digest, transaction hash, anchor state, finality, indexer state, and
  reconciliation state are presented as separate facts.
- Only a strict verified Base Sepolia transaction URL is rendered as an
  explorer link.
- Local restart preserves an already approved CHAIN-001F attestor but does not
  enable one that was previously disabled.
- Restart now stops API and worker before PostgreSQL and waits for database
  health before bringing dependent services back.

## Verification

- Repository gates: 659 passed, 0 failed.
- Web tests: 98 passed, 0 failed.
- PostgreSQL integration: 81 passed, 0 failed against a fresh isolated
  PostgreSQL 17 database.
- Web bundle: 1 external module, 26 authored modules, 772 unique IDs.
- Tenant protocol: 72 operations.
- TRANSPORT-003: passed with remote activation still disabled.
- Live local acceptance after ordered restart: passed.
- Persistence, idempotency, wallet lifecycle, Agent credential revocation,
  timeout/unknown handling, reconciliation, pause/freeze, credit outcome retry,
  and one-to-one Evidence anchor coverage: passed.
- Desktop browser: 1280px client width, 1280px document width, one visible
  Sign in action, four role entries, and no console errors.
- Mobile browser: 390px client width, 390px document width, one explicit
  text-labelled Sign in action, four role entries, and no horizontal overflow.

Browser evidence:

- `artifacts/product-audit/2026-07-30/01-signed-out-overview.png`
- `artifacts/product-audit/2026-07-30/02-signed-out-mobile-after.png`
- `artifacts/product-audit/2026-07-30/03-signed-out-desktop-after.png`

The in-app browser did not expose an injected wallet provider during the final
visual pass. It therefore did not perform a new interactive wallet signature.
Authenticated Human EIP-191 re-login and Agent credential paths were exercised
by the production-runtime and PostgreSQL suites; no browser fixture was used to
manufacture an authenticated UI state.

## CHAIN-001F observation

- Chain: Base Sepolia, `eip155:84532`
- Contract: `0x78ba26d4a9211e8d4b0158c9e5443305278c1df0`
- Attestor: `0x66f0acF3457e7B73845FD33c764947fC5A220f2a`
- Native value per anchor: 0
- Production funds moved: false
- Attestor balance remains within the approved 0.01 ETH cap.
- At the acceptance observation: 787 anchor requirements, 778 finalized,
  1 safe, 8 included, 0 failed.

The safe and included records have real transaction hashes and block numbers.
They remain explicitly non-final until the Base Sepolia finalized tag advances;
the worker does not resend them or relabel them as finalized.

## Remaining observations

- P0: none.
- P1: none.
- P2 operational: monitor the 9 non-final CHAIN-001F records until the RPC
  reports finality. This does not block local use or misrepresent chain state.
- P2 environment: an interactive wallet extension is required for a new manual
  in-browser signature pass.

## Phase 2 decision

Go for Phase 2 no-funds bilateral marketplace design and implementation after
human review of this receipt.

No-go for cloud launch, external participant access, Capital Partner mutation
in a hosted environment, new contracts/signers, testnet value movement, KYC
vendors, or real funds. Those remain separate approval gates.
