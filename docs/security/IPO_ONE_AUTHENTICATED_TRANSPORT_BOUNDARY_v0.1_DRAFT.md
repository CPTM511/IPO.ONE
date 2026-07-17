# IPO.ONE Authenticated Transport Boundary v0.1

Status: Active for the loopback/test HTTP and local stdio MCP profiles after
TRANSPORT-001 approval and verification on 2026-07-15. Public/remote and
production transport remain disabled.

## Trust Sources

- Human: approved OIDC BFF session, CSRF token, exact origin, active internal
  Credential/Actor mapping, and required recent MFA where applicable.
- Agent: approved issuer/audience, short-lived workload token, active internal
  Credential/Actor mapping, DPoP or trusted mTLS sender constraint, and replay
  protection.
- Network Context: trusted adapter configuration and ingress facts, never HTTP
  body, MCP arguments, forwarded headers, or model text.

## Transport Separation

- Anonymous public sandbox: unchanged and cannot import the durable Gateway.
- Tenant HTTP: separate loopback-only listener, closed envelope, authenticated
  context, no production start profile.
- Agent MCP: local stdio only, six reviewed self-owned tools, no remote
  transport or ambient filesystem/shell/network tools.

## Agent Handoff Boundary

- The Principal-to-Agent packet is a non-authorizing manifest, not an
  authentication artifact or MCP connection profile. The versioned contract
  distinguishes `application_ready` for one draft Mandate from `ready` for the
  Principal-activated runtime phase. The browser renders and copies only the
  phase derived from the exact loaded Mandate: draft for application and active
  for post-application runtime.
- The packet must conform to the closed `agent_handoff_manifest.v1` JSON Schema;
  its tool sequence is conformance-checked against the approved MCP registry.
- The manifest may contain the owned Subject ID, Mandate ID, Mandate/terms
  hashes, bounded capabilities, assets, limits, expiry, request schema version,
  local transport profile, and the exact six reviewed MCP tool/operation pairs.
- Credential delivery is out of band. The manifest must not contain a Tenant
  selector, role or approval claim, token, cookie, DPoP proof, signature,
  private key, client secret, workload credential, or caller-supplied
  Authentication Context.
- `publicEndpointEnabled`, `remoteMcpEnabled`, and `fundsAuthority` remain
  `false`. Copying the manifest grants no identity, transport, acceptance,
  execution, repayment, withdrawal, or funds capability.
- The optional developer preflight reads only bounded strict JSON from stdin,
  accepts only active runtime `ready`, emits a minimal first-call plan, and has no credential loader, filesystem
  path input, network listener, or ability to compose the authenticated MCP
  Host.
- The application workflow accepts only `application_ready`, derives the exact
  Mandate, and invokes its fixed four economic tools through Decision/Offer;
  the same manifest also exposes the exact-subject IDENTITY-001 proof and
  binding-read tools. A
  runtime `ready` Host rejects new Credit Intent submission with
  `mcp_application_handoff_required`.
- The composed `agent_credit_offer_workflow_receipt.v1` is a closed output
  contract over canonical Tenant summaries. It fixes the four tool steps and
  explicitly sets credentials, public endpoint, remote MCP, production funds,
  and funds authority to false. The receipt is not an authentication artifact,
  acceptance, Obligation, Evidence attestation, or funds authorization.

## Fail-Closed Requirements

- Authentication, body framing, content type, byte/depth/node limits, schema,
  Actor/operation allowlist, rate, concurrency, and timeout checks precede
  Gateway execution.
- Gateway authorization, live revalidation, approval, abuse, idempotency,
  transaction, audit, and result validation remain authoritative.
- Adapter errors expose bounded stable codes and request IDs, not tokens,
  identities, object existence, SQL, stacks, validator internals, or policy
  secrets.
- Cancellation or disconnect cannot turn an unknown command outcome into an
  automatic mutation retry; clients must read by idempotency/replay semantics.
