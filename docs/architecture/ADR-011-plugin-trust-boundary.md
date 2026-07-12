# ADR-011: Data-Only Plugin Trust Boundary

- Status: Accepted for contract design; remote execution deferred
- Date: 2026-07-10

## Context

IPO.ONE must connect to KYC, KYP, compliance, payment, on/off-ramp, provider,
chain, and risk systems without becoming the licensed operator of every
function. Loading third-party code into the authorization or funds path would
create an unacceptable supply-chain and privilege boundary.

## Decision

- A plugin is a signed, versioned data manifest plus a remote adapter contract,
  not executable code loaded into the IPO.ONE process.
- Manifests declare typed capabilities, schemas, jurisdictions, data classes,
  attestation outputs, endpoint, authentication method, and fail-closed policy.
- Secrets and raw PII are never part of the manifest.
- Production endpoints require HTTPS; unauthenticated endpoints are sandbox
  only.
- Plugin registration does not equal trust. Activation requires an explicit
  review action, and each returned attestation remains independently
  verifiable, scoped, expiring, and revocable.
- A plugin timeout, invalid signature, stale attestation, or schema mismatch can
  only deny, queue for review, or alert. It cannot silently approve.

## Consequences

- Providers remain replaceable and composable without sharing the core trust
  domain.
- KYC/KYP responsibility stays with the relevant institution while IPO.ONE
  stores only references, hashes, and attestations by default.
- Network invocation, credential vaulting, and certification are intentionally
  outside this MVP.
