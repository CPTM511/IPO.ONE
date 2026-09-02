# M3-RESOURCE-002 Acceptance Evidence

Date: 2026-09-03

Verdict: `PASS — L0 LOCAL NO-FUNDS VERIFIED`

Baseline: `2c6d2493b1ab514b4ae1a8628ed00fc4f9d21036`

Implementation: `18cbdea64a7168b60633d3ce81a29f6b9669d3ff`

This record accepts the local runtime integration and co-equal product
acceptance for the single Founder-authorized synthetic Metered Usage profile.
It grants no deployment, external Provider, production credential, pricing or
risk-policy change, signer, custody, transfer, withdrawal, mainnet or real-funds
authority.

## Delivered product truth

The local private-pilot runtime now provisions one exact
`provider_gateway_compute` profile and one per-Obligation SpendPolicy, verifies
Ed25519-signed finalized `inference_tokens` usage, derives its integer charge
server-side, and admits it through the existing System Worker, Mandate,
Obligation, Ledger, Event and Evidence boundaries. The local Provider key is a
0600 runtime secret outside source control and is never returned in a receipt.

The reference Agent workflow uses the canonical MCP sequence to accept the
Offer, execute the sandbox Obligation, obtain one Provider admission, read its
own Evidence, repay, and read the final Evidence. Principal and Agent reads
return the same privacy-minimal Metered Usage receipt. No second obligation,
ledger, pricing kernel or browser-owned truth was introduced.

## Exact runtime Evidence

| Binding | Exact value |
| --- | --- |
| Local database | isolated PostgreSQL 17 `ipo_one_m3_resource_002_acceptance_v6` |
| Provider | `provider_gateway_compute` |
| Provider key ID | `local_metered_fa97b09daf9496b65f7543df093c3db0` |
| Policy hash | `0x37762d059f01d33e26891d37a74f93c78369c6774e487e2d79c6fd72be6429b2` |
| Obligation | `obligation_22cf76ef-6c8f-415e-ba00-1958655edca0` |
| Usage Evidence | `usage_local_metered_bcce8663cede8a84fe61b42817d84663aa856006425e339fa2c5d736bb4e39f8` |
| Admission | `metered_usage_admission_5f6de9effd72fbcdc3a7369a6071475a3d8c9f7657295fa742ebb687a0b969f6` |
| Ledger transaction | `ledger_transaction_b71e569a-fd0e-4bfc-af33-ec8178cb5fbf` |
| Usage and charge | `250 token`; `500` synthetic minor units |
| Final lifecycle | `fully_repaid`; total repaid `10000`; outstanding principal `$0.00` |
| Evidence timeline | `17` events |

The first run returned `replayed=false`. The same explicit run ID and quantity
after process restart returned the exact same Evidence, admission, Ledger and
policy identifiers with `replayed=true`. PostgreSQL contains one usage row, one
admission, one matching reservation and two Ledger entries; debit and credit
are both `500`. Reusing the run ID with quantity `251` failed closed without a
second charge. Invalid-signature denial is covered by the focused Provider
suite.

## Human and Agent product acceptance

The reference Agent acceptance completed with `status=passed`, the four-step
versioned MCP receipt, `principalAgentParity=true`, and a fully repaid shared
Obligation.

In a real Chrome + MetaMask session, the invited Principal selected the
Principal Controller workspace, signed the displayed one-use SIWE message, and
entered through normal product navigation. `Review Agent obligations` opened
the owned shared Obligation without an internal ID. The page displayed
`Fully Repaid · Current`, `$0.00` outstanding principal and `$100.00` total
repaid. `Load Evidence` displayed:

`Metered usage · 250 tokens · $5.00 synthetic charge · finalized and reconciled`

and reported 17 owner/controller-authorized server Evidence events. After a
browser refresh, the signed-in workspace, Obligation state and amounts
recovered from server truth; clicking `Load Evidence` again returned the same
Metered Usage receipt and 17-event timeline.

## Verification

| Gate | Result |
| --- | --- |
| Focused Agent/runtime/Provider suites | PASS `26/26` |
| PostgreSQL/RLS integration | PASS `95/95` |
| Root JavaScript suite | PASS `1262/1262` |
| Foundry contracts | PASS `25`; `2` explicit fork-only tests skipped |
| Runtime, lint, types, schemas, OpenAPI, migrations, Tenant protocol, traceability, security, transport, deployment topology, local stack, launch policy and web bundle | PASS |
| Exact replay and conflict denial | PASS; one charge only |
| Process/browser refresh recovery | PASS |
| Principal Web and Agent API/MCP parity | PASS |
| `git diff --check` | PASS |
| Scoped P0/P1 | PASS; none open |

## Truthful boundary and rollback

- `sandboxOnly=true`
- `productionFundsMoved=false`
- `realFundsEnabled=false`
- no production deployment or configuration mutation
- no external Provider call or credential
- no mainnet, signer, custody, transfer or withdrawal

This is CODE, local RUNTIME and local VERIFIED Evidence. It is not DEPLOYED or
production REACHABLE Evidence. Production Public Beta remains unchanged and
does not inherit this M3 capability.

Rollback removes the local adapter/runtime wiring and command entrypoint while
preserving immutable Evidence and balanced Ledger history. Stop before any
deployment, external Provider, additional resource profile, production
credential, new pricing/risk policy or real value; each requires a new named
decision and current Evidence.
