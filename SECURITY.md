# Security Policy

IPO.ONE is currently a no-real-funds public-beta sandbox. It must not be used
for production lending, custody, private KYC data, wallet keys, or real payment
execution.

## Supported Surface

Security fixes target the current default branch and the latest tagged public
beta. Historical demo snapshots are not maintained as production releases.

The implemented controls, attacker assumptions, automated evidence, and known
residual risks are documented in
[`docs/security/IPO_ONE_SANDBOX_THREAT_MODEL_v0.3.md`](docs/security/IPO_ONE_SANDBOX_THREAT_MODEL_v0.3.md).
No software review can guarantee the absence of every present or future
vulnerability; reports that challenge this model are welcome.

## Reporting a Vulnerability

Use GitHub's private vulnerability reporting or a private repository security
advisory for `CPTM511/IPO.ONE`. Do not publish exploit details, credentials,
private data, or unredacted logs in a public issue.

Include the affected route/module, impact, minimal reproduction, environment,
and any request ID that helps correlate the failure. Never include a real
private key, token, KYC record, or account credential.

If private reporting is unavailable, open a public issue containing only a
request for a private security contact. Do not include vulnerability details.

## Safety Boundary

Sandbox session IDs partition public demo state; they are not authentication,
authorization, tenant identity, or secrets. Production AuthN/RBAC/tenant,
durable state, reconciliation, signed Mandates, certified Providers, and fund
paths remain explicit launch blockers for any real-value use.
