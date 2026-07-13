# OPS-001A: Public Sandbox Hosting Baseline

Status: Approved public no-real-funds sandbox hosted and verified; private-data
and real-value operations remain prohibited
Date: 2026-07-13

## Context

The local public-beta candidate needs a reproducible production runtime before
`ipo.one` can point at it. This task covers only a no-real-funds public sandbox.
It must not imply authenticated commercial-pilot or financial-production
readiness.

## Scope

- Add fail-closed production runtime configuration and exact safety acknowledgement.
- Enforce Host allowlisting, trusted HTTPS ingress proof, HSTS, and bounded
  machine-readable operational endpoints.
- Emit structured request logs without bodies, queries, session IDs, raw IPs,
  or unexpected error details.
- Publish Human/Agent discovery and vulnerability-reporting metadata.
- Add a digest-pinned, non-root production container and Cloud Run template.
- Prove the container can run read-only with Linux capabilities removed in CI.
- Document GCP load balancer, Cloud Armor, certificate, GoDaddy DNS, monitoring,
  rollback, and approval steps.

## Non-Goals

- No real funds, custody, production credit, Human lending, KYC/KYP processing,
  raw PII, external payment adapter, or executable plugin.
- No AuthN, tenant model, RBAC, object authorization, durable sandbox sessions,
  billing, SLA, or commercial pilot claim.
- No unattended cloud deployment or DNS mutation.
- No claim of zero vulnerabilities, formal verification, or completed external
  penetration testing.

## Likely Files

- `apps/api/src/runtime-config.js`
- `apps/api/src/server.js`
- `packages/api-contract/src/index.js`
- `security/test/server-security.test.mjs`
- `Dockerfile`
- `.dockerignore`
- `.github/workflows/quality.yml`
- `deploy/gcp/cloud-run-service.yaml.tmpl`
- `deploy/gcp/README.md`
- `scripts/check-deploy.mjs`
- `README.md`

## Acceptance Criteria

- [x] Production startup fails unless the public sandbox, HTTPS, proxy, HSTS,
  origin, Host, release, contact, and no-real-funds contract are valid.
- [x] Unknown Host values return 421 and non-HTTPS public ingress returns 426.
- [x] Liveness/readiness probes work without creating mutable visitor state.
- [x] Discovery states that real funds, production credit, and Human credit are disabled.
- [x] Logs omit request bodies, query values, session IDs, raw IPs, and stack traces.
- [x] Build and shell-free distroless runtime images are digest pinned; runtime
  uses UID/GID 65532 and CI checks the exact Node patch.
- [x] CI builds and starts the container with read-only root, no capabilities,
  no-new-privileges, and bounded process/memory/CPU resources.
- [x] Cloud Run template restricts ingress to internal/load-balancer paths,
  disables the default URL, and configures startup/liveness/readiness probes.
- [x] Exact release commit passes GitHub CI container verification.
- [x] GCP load balancer, Cloud Armor, certificate, core alerts, and rollback are approved and verified.
- [x] GoDaddy root-A cutover is approved and `https://ipo.one` passes post-cutover checks.

## Test Commands

```sh
pnpm run check
pnpm run test:security
pnpm run test:postgres
pnpm run demo
pnpm audit --prod
git diff --check
```

## Security Checklist

- [x] No secret, private key, credential, raw PII, or real endpoint token committed.
- [x] No direct public `run.app` origin in the proposed production boundary.
- [x] No proxy header is trusted in local mode; production trust is coupled to
  load-balancer-only ingress.
- [x] Operational responses reveal no mutable state or customer data.
- [x] The exact safety mode is discoverable by humans and machines.
- [ ] Independent penetration test and hosted edge test complete before private data.
- [ ] Founder/CTO/Security sign the deployment evidence and incident ownership.

## Hosted Evidence

The public sandbox is deployed at `https://ipo.one` from release
`00598584f437f71ebb1dd8a3517585ad8fc96ce9`. Exact GCP resources, DNS
preservation checks, live SDK/UI results, scanner counts, monitoring resources,
and residual governance gates are recorded in
`docs/security/IPO_ONE_PUBLIC_SANDBOX_DEPLOYMENT_EVIDENCE_v0.1.md`.

This completion status applies only to the anonymous synthetic-data sandbox.
It does not close the independent penetration-test, protected-environment,
notification-recipient, named incident-owner, AuthN/AuthZ, private-data, or
real-value gates.
