# IPO.ONE v0.2.0 bounded review decision

Decision: `PASS — DEPLOYED AND USER-VERIFIED`

Accepted: `2026-08-25`

Decision owner: `IPO.ONE Founder`

Engineering candidate SHA: `25921f008f260d2d8a39524603cd1a6f2512fd63`

Merged SHA: `ad5cce4c3477cb5732f4601d892e13e223382abe`

Pull request: <https://github.com/CPTM511/IPO.ONE/pull/53>

Post-merge CI: <https://github.com/CPTM511/IPO.ONE/actions/runs/32837312593>

Local product: <http://127.0.0.1:8787/#request-credit>

## Accepted boundary

This decision accepts M2A and v0.2.0 only for the exact Base Sepolia test-asset
Pool, its read-only recovery/reconciliation Evidence, and the local no-funds
product running the merged SHA. The Pool and Adapter remain the exact M2A-008
contracts. M2A-009 added no deployment, signer, transaction preparation,
broadcast method or funds movement.

The merged SHA passed the main repository Quality Gate, exact OCI identity
rebuild, PostgreSQL-backed local acceptance and a signed visible-click Human
session. The visible path refreshed the Pool and reviewed `Supply liquidity`
for `1000000` asset units while showing indexed state, AccountBinding and
submission as unavailable. No transaction was signed or submitted.

## Offline independent engineering review decision

The Founder confirmed that an independently participating engineer reviewed
the candidate together with the Founder offline and found it acceptable. The
Founder does not require publication of that engineer's identity or a separate
online report and explicitly accepts responsibility for this bounded review
decision.

For this exact M2A testnet/no-funds review, the Founder-directed offline
attestation satisfies the candidate's independent-review gate. The absence of
a public reviewer identity is retained as a disclosure, not represented as a
publicly attributable audit.

This disposition is not reusable for mainnet, real value, production custody,
production signers, public-production deployment or an M2B live venue-write
profile. Those boundaries retain their separately named review requirements.

## Authority created

The decision unlocks only M2B-001 at `L0_LOCAL_NO_FUNDS`: a durable,
fail-closed authorization binding among an existing Agent Subject, accountable
Principal, active Mandate, execution AccountBinding, pool-backed shared
Obligation/Facility and one exact goal-level Agent operation family.

It does not unlock M2B-002, Hyperliquid writes, signer creation, nonce use,
withdrawal, transfer, mainnet, real funds, production deployment or automatic
unfreeze.
