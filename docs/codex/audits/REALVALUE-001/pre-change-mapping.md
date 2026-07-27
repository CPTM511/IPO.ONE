# REALVALUE-001 pre-change mapping

Date: 2026-07-26

Task gate: `human_decision_only`

## Accepted prerequisite

The IPO.ONE Founder accepted RELEASE-001 as `IMPLEMENTED_UNVERIFIED` and
confirmed acceptance-matrix SHA-256
`1260226d1316bea2f6894acef15c725300b8bd9e9e2fae3a012b7d0e85e9a381`.
That verdict unlocks only preparation of this decision package.

## Existing authority and gap

| REALVALUE-001 requirement | Existing control | Open decision / evidence gap | Bounded task output |
| --- | --- | --- | --- |
| Capital source and loss bearer | Product Charter and Commercialization Roadmap require named capital and explicit loss allocation | No approved capital source, beneficial owner, source-of-funds evidence, loss bearer, or maximum loss | P0 capital and loss decisions, default locked |
| Legal roles and jurisdiction | Product Charter requires named legal roles and regulated-product review | No approved entity, jurisdiction, product classification, agreements, tax, complaint, or regulatory owner | P0 legal decision requiring independent counsel |
| Custody and signer | ADR-035 separates execution signer, Risk Guardian, withdrawal authority, and capital authority | No production custodian, signer, HSM/MPC policy, withdrawal authority, rotation, destruction, or address-nonreuse evidence | Separate custody and signer P0 decisions |
| Chain, asset, and accounts | Hyperliquid Testnet read-only adapter and local action boundary exist | Founder-controlled master/subaccount, non-empty history, API Wallet and signed Exchange E2E remain unverified; no production chain/asset/account is approved | P0 chain/asset/account decision; Testnet evidence is not production approval |
| Participants and Providers | Shared Facility model and local Provider boundary exist | No approved real-value Provider, Trader, Agent cohort, KYB/KYP, sanctions, contract, SLA, or concentration policy | P0 participant/Provider decision |
| Caps, first loss, and collateral | ADR-034 requires one Facility over the shared kernel | No approved total, per-Facility, per-Agent, Provider, chain, asset, first-loss, collateral, or loss waterfall values | Separate P0 cap and collateral decisions |
| Risk and stop-loss | ADR-036 has deterministic fail-closed states and stale/unknown blocking | No approved production thresholds, max age, stop-loss, REDUCE_ONLY/FLATTEN triggers, recovery hysteresis, or independent Risk owner | P0 risk decision |
| Pricing and accounting | Shared Ledger and actual-realized-income settlement design exist | No approved APR/fees, payer, tax/accounting treatment, chart of accounts, or reconciliation sign-off | P0 pricing/accounting decision |
| Incident and on-call | TC-403 and private-pilot runbooks define local/Testnet failure handling | Runtime alert provenance P2 remains open; no production SLO, rota, notification recipients, incident commander, custody escalation, or exercise | P0 operations decision |
| Independent security | Threat models and local adversarial tests exist | RELEASE-001 independent external review evidence was waived and remains unverified; no production custody/signer/value-path assessment | P0 independent review decision |
| Rollback and wind-down | ADR-037 and TC-403 require fail-closed recovery | No approved production wind-down, capital recovery, signer compromise, venue outage, uncertain outcome, or customer/partner notification plan | P0 rollback decision |
| Production infrastructure | Public sandbox and local private boundaries are distinct | No approved production IdP, database, backup/restore, RPC/indexer, secrets, hosting, privacy, retention, or deployment | P0 infrastructure decision |
| Final go/no-go | `controlled_agent_credit_pilot.releaseEnabled=false` | No policy revision and no exact-release multi-owner approval | P0 final launch decision; remains reject/locked |

## Files and behavior intentionally unchanged

- `deploy/launch-policy.v1.json`
- Tenant protocol catalog, request/result contracts, Gateway handlers
- AuthN, AuthZ, admission, PostgreSQL unit of work, Ledger, Event, Evidence,
  outbox and reconciliation runtime behavior
- Hyperliquid signer, Exchange action, funding and settlement behavior
- dependencies, migrations, OpenAPI, SDK and browser product surfaces

No external network, credential, signer, account, deployment, mainnet, Exchange
write, withdrawal, transfer, capital movement, or real-value action is permitted
by this mapping.
