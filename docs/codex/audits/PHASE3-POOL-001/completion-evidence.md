# PHASE3-POOL-001 completion Evidence

Date: 2026-08-29

Verdict: `PASS — DEPLOYED AND USER-VERIFIED`

## Release identity

- Starting alignment baseline: `39bdf32709d896e1debaa0f8c72c98aad8a9b3e0`
- Final merged `main` SHA: `316de8f0c2188c5f4d0b15a1cffbc50713b2972e`
- Final deployed SHA: `316de8f0c2188c5f4d0b15a1cffbc50713b2972e`
- Pull requests: `#60`, `#61`
- Production deployment: `dpl_5KLezhu9ZA3vcob8xgpMp5GSNPkq`
- Product entry: `https://ipo.one/#secured-pool`

## Verified product truth

- SIWE-authenticated Human workspace recovered four Actor-bound resource
  references from durable server state.
- `Secured Pool` was reachable through visible product navigation.
- Deployment identity was exact for Base Sepolia `eip155:84532` and Pool
  `0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da`.
- RPC and current safe-block market reads were available. Safe block advanced
  across refreshes, proving a current read rather than a static fixture.
- Available liquidity, gross debt, utilization and LP claim were authoritative
  zeroes and displayed as zero rather than unknown.
- Indexer and reconciliation were separately represented as unavailable.
- The acceptance Actor had no authorized AccountBinding. Private position
  values remained unavailable, and `Review without submitting` remained
  disabled.
- Page refresh and full reload preserved the authenticated server workspace;
  visible navigation reloaded the Pool from current server/chain truth.
- Browser warning/error log result was empty.
- Production logs recorded HTTP 200 for
  `GET /tenant/v1/secured-pool/market`.

## Release and safety checks

- `/livez`, `/readyz` and deployment discovery reported the final SHA.
- Runtime profile remained `closed_non_funds_pilot` with
  `realFundsEnabled=false`; this descriptive profile label is not L2 launch
  authority.
- Full repository and PostgreSQL checks, focused contract checks, visible-click
  browser paths and both CI runs passed.

```text
signerCreated=false
poolTransactionSubmitted=false
venueTransactionSubmitted=false
mainnetAuthorized=false
realFundsAuthorized=false
```

This Evidence closes only `PHASE3-POOL-001`. It does not activate
`PILOT-008`, enable its launch-policy profile, invite participants, or grant
Hyperliquid, mainnet, signer, real-value or M3 authority.
