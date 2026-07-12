# Private Launch Evidence

`public-sandbox.pending.json` is a deliberately incomplete, committed contract.
It must fail release verification and must never be edited to claim that an
external control exists.

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
