# IDENTITY-002 Agent Account Bootstrap — Audit

## Outcome

The private Agent product no longer requires an MCP handoff before the Agent can
prove its CAIP-10 account. `pilot:start` publishes only one stable local test
account address. The Principal UI creates and downloads a closed one-use EIP-712
request, and `pilot:agent:prove` validates and submits it through the durable
Agent Tenant client without exposing the private key or signature.

The Agent API now distinguishes the descriptive capability packet from the
exact `agent_handoff_manifest.v1` accepted by `pilot:agent`. Application and
runtime handoffs can be downloaded directly, and both Agent CLIs accept the
documented pnpm `--` argument separator.

## Verified clean-database path

Against a clean PostgreSQL 17 database and the role-separated loopback product:

1. The Human Principal created Agent Subject
   `subject_4263c742-4611-40e3-9b91-62a3d465b20e`.
2. The local Agent proved Base Sepolia account control and atomically activated
   the Subject; the receipt included no key or signature.
3. The Principal created draft Mandate
   `mandate_56471e32-5edb-446e-8113-aee653def95c` and downloaded the application
   handoff.
4. Local MCP read Agent self, requested 9,000 minor units, read the application,
   and produced an approved deterministic Offer plus finalized Decision
   Passport lineage.
5. The Principal activated the exact Mandate and downloaded the runtime handoff.
6. Local MCP accepted the exact Offer, created shared Obligation
   `obligation_a9c83d44-b19f-4dde-8425-cf8c5cea7751`, executed it through the
   signed non-redeemable rail, and posted a 9,000-unit synthetic repayment.
7. An independent owned read returned `fully_repaid`, zero outstanding
   principal, executed state, one paid installment, current servicing, and 11
   finalized redacted Evidence items with no pagination remainder.

## Security evidence

- Account derivation is limited to the local private-pilot secret and the two
  approved test-chain CAIP profiles.
- The signer rejects extra fields, wrong account/chain/hash, expired requests,
  and typed-data drift before signing.
- UI challenges and handoffs contain no credential, private key, Authentication
  Context, public endpoint, remote MCP authority, withdrawal, or funds authority.
- Principal activation remains required before acceptance, execution, repayment,
  owned Obligation, and Evidence tools become available.
- All economic effects remained synthetic, non-withdrawable, and
  `productionFundsMoved: false`.

## Automated gate

`PATH=/private/tmp/node-v24.18.0-darwin-arm64/bin:$PATH pnpm run check` passed:
310/310 tests, 46 schemas, 21 OpenAPI operations, 23 migration pairs, and 34
private Tenant operations.
