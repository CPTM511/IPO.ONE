# Launch policy M2 testnet proposed change

Status: Schema direction accepted 2026-08-22; profile added disabled in policy v1.1.0

## Problem

The prior policy had no secured-pool L3 profile. `public_sandbox` remains enabled
only for no-real-funds product behavior; closed pilot, controlled Agent credit,
and the new secured-pool profile remain disabled. Reusing
`humanCreditEnabled` would wrongly conflate Human production credit with public
test-asset secured borrowing.

## Proposed schema and profile

Policy v1.1.0 adds explicit test-asset capabilities and the disabled profile
below. The checked-in profile uses `exactProfile: null`; exact reviewed values
must replace it before a separate unlock PR. Null, placeholders, and invalid
values fail closed and cannot authorize release.

```json
{
  "live_testnet_secured_pool": {
    "displayName": "Public Base Sepolia secured-pool test",
    "releaseEnabled": false,
    "environment": "live-testnet-secured-pool",
    "maxReleaseAgeHours": 24,
    "capabilities": {
      "realFundsEnabled": false,
      "humanCreditEnabled": false,
      "testAssetsEnabled": true,
      "securedPoolEnabled": true,
      "publicPoolParticipationEnabled": true,
      "marketCreationEnabled": false,
      "privateTenantDataEnabled": false,
      "externalProviderExecutionEnabled": false,
      "agentVenueExecutionEnabled": false
    },
    "exactProfile": {
      "chainId": "eip155:84532",
      "poolContract": "REQUIRED_EXACT_ADDRESS",
      "poolBytecodeHash": "REQUIRED_BYTES32",
      "adapterVersion": "REQUIRED_VERSION",
      "wethCollateral": "0x4200000000000000000000000000000000000006",
      "testUsdcDebt": "REQUIRED_EXACT_ADDRESS",
      "oracle": "REQUIRED_EXACT_ADDRESS_AND_SOURCE",
      "marketCount": 1,
      "runOwner": "REQUIRED_NAMED_OWNER",
      "deploymentApprovalRef": "REQUIRED_ONE_USE_APPROVAL",
      "configurationHash": "REQUIRED_BYTES32",
      "realValueClassification": "test_assets_only"
    },
    "gates": [
      {"id":"constitution_v1_3_ratified","ownerRole":"Founder/Product/Governance","maxAgeHours":720},
      {"id":"m2_adrs_accepted","ownerRole":"CTO/Security/Product","maxAgeHours":720},
      {"id":"contract_dependency_provenance","ownerRole":"Security/Engineering","maxAgeHours":72},
      {"id":"contract_unit_fuzz_invariant","ownerRole":"Smart Contract/Security","maxAgeHours":72},
      {"id":"independent_contract_review","ownerRole":"Independent Security","maxAgeHours":720},
      {"id":"exact_chain_contract_asset_oracle","ownerRole":"Security/Risk/Engineering","maxAgeHours":72},
      {"id":"testnet_caps_and_pause_roles","ownerRole":"Risk/Founder","maxAgeHours":72},
      {"id":"deployment_signer_lifecycle","ownerRole":"Security/Release Owner","maxAgeHours":24},
      {"id":"indexer_finality_reorg_reconciliation","ownerRole":"Engineering/Operations","maxAgeHours":72},
      {"id":"restart_restore_recovery_drill","ownerRole":"Operations/Security","maxAgeHours":72},
      {"id":"lp_human_risk_browser_acceptance","ownerRole":"Product/QA/Risk","maxAgeHours":72},
      {"id":"test_asset_public_safety_copy","ownerRole":"Product/Legal","maxAgeHours":720},
      {"id":"release_owner_authorization","ownerRole":"Founder/Release Owner","maxAgeHours":24}
    ],
    "unlockRequirements": [
      "Replace every placeholder with reviewed exact values and bind evidence to the deployed SHA.",
      "Prove one market, no factory/proxy, no real funds/mainnet and no Agent venue execution.",
      "Record deployment, configuration, transaction, finality, indexer and zero-discrepancy reconciliation evidence.",
      "Approve a policy revision that changes releaseEnabled; passing evidence alone cannot unlock the profile."
    ]
  }
}
```

M2B must not silently broaden this profile. It requires a distinct disabled
`live_testnet_secured_pool_agent_execution` profile or a reviewed version that
names exact Principal, Agent, Mandate, pool position, Hyperliquid account,
delegate/signer, operations, caps and one-use run approval while preserving
`realFundsEnabled=false`, withdrawal/transfer denial and testnet-only scope.

## Fail-closed rules

- `releaseEnabled=false` until a second explicit policy PR.
- Missing, placeholder, stale or mismatched exact-profile fields fail validation.
- Chain/contract/asset/oracle/config/SHA mismatch blocks all new risk.
- Missing finality or reconciliation cannot be represented as complete.
- Test asset balances must never be displayed as cash, real credit or redeemable
  value.
- The policy cannot self-enable from Evidence or environment variables.

## Rollback

Pause risk increase, retain repay/add-collateral/eligible protective actions,
stop public entry, reconcile every observed transaction, archive exact Evidence
and set `releaseEnabled=false`. Rollback never rewrites pool balances or
Ledger/Event history and does not reuse a retired signer.

Permission/funds/deployment impact: **none**. No JSON policy, Vercel setting,
contract, profile, signer or deployment is changed by this proposal.
