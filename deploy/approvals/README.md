# Private Launch Evidence

`public-sandbox.pending.json` is a deliberately incomplete, committed contract.
It must fail release verification and must never be edited to claim that an
external control exists.

`closed-non-funds-pilot.pending.json` is the equivalent fail-closed contract
for the private pilot. It enumerates every policy gate, but the profile remains
locked and every external approval remains pending. Copy it only to an ignored
`*.local.json` path after the exact release, immutable cloud observations, and
real approvers exist; never convert placeholders into invented evidence.

`m2a-008-secured-pool.pending.json` is the fail-closed contract for the one
exact Base Sepolia secured-pool test-asset deployment. Policy v1.3.2 retains
pre-deployment approval Evidence to Gates A through C: code integrity, exact
configuration, and authority/signer safety. Gate D is enforced by the closed
runner during deployment; Gate E is required before completion. The profile is
enabled only for the reviewed exact addresses, bytecode/configuration hashes,
assets, oracle, caps and test-only classification. Independent
Security review is optional additional testnet assurance and remains mandatory
for any future mainnet or real-value profile.

Because this deployment uses a local closed chain runner and publishes no Web
container, its release record must use `imageUri: null` and
`founder_exact_testnet_decision` with an immutable GitHub commit/blob approval
reference. Other profiles retain their protected-environment and immutable
container requirements.

Actual release evidence belongs in a `*.local.json` file, which Git ignores, or
in an approved private change-control system. It may contain approver handles
and immutable evidence URLs, but never tokens, credentials, private keys,
customer data, raw IPs, PII, KYC/KYP material, or temporary signed URLs.

Validate an exact release identity with:

```sh
pnpm run launch:verify -- \
  --evidence deploy/approvals/public-sandbox.local.json \
  --profile public_sandbox \
  --expected-sha <exact-green-40-character-commit-sha>
```

Passing validation is necessary but not sufficient. Deployment must also run
through the approved protected environment, least-privilege cloud identity,
reviewed edge, and named DNS/change-control owners. The manifest references
those external approvals; it cannot grant them.
