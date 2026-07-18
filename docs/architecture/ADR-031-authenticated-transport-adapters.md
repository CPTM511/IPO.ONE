# ADR-031: Separate Authenticated Tenant HTTP and Local MCP Adapters

Status: Accepted and implemented locally on 2026-07-15 under TRANSPORT-001.
Only the loopback/test HTTP and local stdio MCP profiles are active.

## Problem

IPO.ONE has a durable transport-neutral Tenant protocol and tested Human/Agent
authentication models, but no runtime composes them. The existing public API is
anonymous, in-memory, and intentionally unsuitable for Tenant commands. Adding
private routes to that server would collapse trust boundaries and could turn a
sandbox isolation identifier into apparent authentication.

## Decision

Use two thin adapters over the same Tenant Command Gateway:

1. `apps/tenant-api`: a loopback-only authenticated HTTP adapter for Human BFF
   sessions and Agent workload tokens.
2. `apps/agent-mcp`: a local stdio MCP adapter restricted to the exact Agent
   self-owned operation allowlist.

Adapters verify identity, create trusted Authentication and Network Context,
validate the shared Tenant protocol envelope, and call the existing Gateway.
They do not contain business policy, reconstruct authorization, or bypass
admission/idempotency/audit.

## Isolation Rules

- The anonymous public sandbox stays in `apps/api` with its existing OpenAPI.
- Private HTTP and MCP have separate entrypoints, configuration, dependency
  boundaries, discovery documents, and launch flags.
- MCP stdio has no remote listener or ambient tool authority.
- Production IdP, credential issuance, TLS, proxy, deployment, and public DNS
  remain later approvals.

## Consequences

The formal Human UI and Agent clients can now reach
the same durable application protocol locally. This proves transport parity
without claiming a production or public service boundary.

The Principal-to-Agent manifest is validated as
`agent_handoff_manifest.v1` with two explicit lifecycle phases. A draft
`application_ready` packet exposes the six approved tools: the four-step
Decision/Offer workflow plus the IDENTITY-001 proof-submit and binding-read
operations. An active `ready` packet represents the later
Principal-authorized runtime phase and cannot start a new Credit Intent. This
preserves the approved ordering: application first, exact Principal activation
after Offer, then later runtime work.

A separate stdin-only preflight continues to accept only active `ready`
packets and derives the first local self-read JSON-RPC call; it cannot load
credentials or compose authority. The reusable Host accepts either phase plus
an already authenticated `AgentTenantCommandClient`, pins Subject and
request-credit Mandate scope, and reuses the same JSON-RPC/stdio adapter.
PostgreSQL integration proves the application phase persists exactly one
Intent, Decision and Offer with four-operation authorization audit and replay.
The composed output is now independently governed by the closed
`agent_credit_offer_workflow_receipt.v1` contract, exported runtime validator,
TypeScript declarations, and adversarial fixtures. It reuses the canonical
Tenant economic summaries and fixes the four-step economic tool/operation/result-version
tuple without creating new protocol authority.

`@ipo-one/sdk` now owns the single canonical four-step composition through
`IpoOneAgentMcpClient`; `apps/agent-mcp` retains only a Host-compatible adapter.
The SDK accepts a validated application handoff, an injected JSON-RPC handler,
and the literal local-stdio profile. CI pins its tool/operation pairs to the MCP
App and browser handoff registries, so productization does not introduce a
second workflow or a new transport boundary.
Credential resolution, verified Authentication Context injection, and any
named deployable Host remain outside this adapter and require separate
composition and approval.
