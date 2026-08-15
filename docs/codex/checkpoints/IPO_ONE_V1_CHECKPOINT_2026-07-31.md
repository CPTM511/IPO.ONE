# IPO.ONE V1 checkpoint — 2026-07-31

Checkpoint status: `FOUNDER_REQUESTED_V1_CHECKPOINT`

Requested by: `IPO.ONE Founder`

Recorded at: `2026-07-31T10:05:13Z`

Product label: `IPO.ONE V1`

This checkpoint preserves the current product state before the next round of
optimization work. It is a reproducible source and product checkpoint, not a
production launch, mainnet, real-capital, custody, KYC-vendor, signer, or funds
movement approval.

## Recovery identifiers

- Source branch: `codex/checkpoint-20260727-pre-strategy`
- Parent before this checkpoint: `a1aa0fc0a8c275ca2bcb7b416f72a4b0058a95e8`
- Annotated tag: `ipo-one-v1-checkpoint-20260731`
- GitHub repository: `https://github.com/CPTM511/ipo.one-v1`
- GitHub visibility at creation: `PRIVATE`

Resolve the immutable checkpoint commit without trusting a copied hash:

```bash
git rev-parse ipo-one-v1-checkpoint-20260731^{}
```

## Included product state

- one shared Human/Agent obligation kernel;
- browser-operable Human application, deterministic evaluation, Offer,
  Obligation, execution, early repayment, Evidence, and repeat application;
- staged Agent application, Principal Mandate activation, Obligation, approved
  use, repayment, Evidence, and obligation review surfaces;
- PostgreSQL-backed local pilot, worker, authentication, no-funds Provider, and
  local Agent reference runtime;
- Credit Passport, Credit Track Record, Obligations, Repay & Settle, Capital
  Partners, Trading Capital, Wallet & Permissions, Provider Network, reports,
  and Risk & Operations surfaces;
- Human/Agent user manual, primary-action contract, and UX-003/004/005 browser
  audit evidence.

## Verification at checkpoint

- Node `v26.5.0`;
- pnpm `11.1.3`;
- repository tests: `681/681 PASS`;
- web tests: `109/109 PASS`;
- PostgreSQL, private Pilot, and worker: `HEALTHY` after local rebuild;
- `git diff --check`: `PASS`;
- intended checkpoint candidates scanned for common private-key and bearer-token
  patterns; only deterministic test hashes were present.

## Known issue intentionally preserved

An active Agent Mandate is durable, but its matching
`agent_credit_offer_workflow_receipt.v1` is currently recalled from browser
`sessionStorage`. A new tab, sign-out, or cleared browser session can therefore
restore the Mandate without its Offer receipt. The UI fails closed and requires
a new Draft Mandate. No incorrect Obligation or funds movement occurs, but
durable server-side receipt recovery remains optimization work after this
checkpoint.

## Explicit boundaries

- Local closed-pilot and synthetic/no-real-funds status only.
- Existing Base Sepolia evidence remains bounded historical Testnet evidence;
  this checkpoint sends no transaction and creates no new signer.
- No mainnet, real funds, arbitrary withdrawal, custody, production Human
  lending, public LP/vault, token, or DAO capability is enabled.
- Deployment and publication of this source checkpoint do not constitute cloud
  runtime deployment or production authorization.

## Excluded local material

- `docs/marketing/` brand-film drafts, which are a separate workstream;
- `.env` and `.env.*` except reviewed examples;
- `.ipo-one/` local databases, keys, secrets, and runtime state;
- `cdp-app-react/.env`, nested repository metadata, dependencies, caches,
  generated builds, and temporary files;
- private keys, seeds, bearer tokens, reusable signatures, and wallet
  credentials.

## Restore

```bash
git clone https://github.com/CPTM511/ipo.one-v1.git
cd ipo.one-v1
git switch --detach ipo-one-v1-checkpoint-20260731
```

Return to the repository default branch for future optimization work:

```bash
git switch main
```
