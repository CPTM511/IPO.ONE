# ADR-014: Public Sandbox Hosting and Origin Boundary

- Status: Accepted and implemented for the public no-real-funds sandbox;
  private-data and real-value profiles remain prohibited
- Date: 2026-07-13

## Context

IPO.ONE needs a public endpoint for Human Operators and Agent clients without
turning the current in-memory demonstration into a claim of production credit
readiness. The deployment must preserve one same-origin UI/API contract, reject
direct or ambiguous origin traffic, produce reviewable release artifacts, and
keep real funds, raw PII, KYC processing, and authenticated tenant operations
disabled.

Direct Cloud Run domain mapping is not selected because Google documents it as
Preview and not recommended for production services. Splitting the UI and API
across unrelated origins would add CORS, cookie, CSP, and release-coordination
surface before the product needs it.

## Decision

The first public sandbox uses this boundary:

1. GoDaddy remains the registrar and authoritative DNS provider for `ipo.one`.
2. A reserved global IPv4 address fronts a Google Cloud global external HTTPS
   Application Load Balancer.
3. A Google-managed certificate terminates TLS 1.2 or later for `ipo.one`.
4. Cloud Armor provides coarse edge rate controls and reviewed WAF rules.
5. A serverless NEG routes to one Cloud Run service that serves the Human
   Console, Agent API, OpenAPI contract, and discovery document on one origin.
6. Cloud Run ingress is `internal-and-cloud-load-balancing`; its default
   `run.app` URL is disabled after the load balancer is verified.
7. The application accepts only explicit Host values and, in production,
   requires every trusted `X-Forwarded-Proto` value to be `https`.
8. The production process fails startup unless `public_sandbox`, HTTPS, HSTS,
   trusted proxy, and the exact no-real-funds acknowledgement are configured.
9. The final image uses a signed, digest-pinned, shell-free distroless Node 24
   LTS runtime, runs as UID/GID 65532, and is identified by an immutable Git
   commit SHA. CI proves the Node patch, absent shell, and read-only execution.
10. `/livez`, `/readyz`, `/.well-known/ipo-one.json`, and
    `/.well-known/security.txt` expose bounded operational and machine-readable
    metadata without creating a sandbox session.

The initial Cloud Run deployment is single-region with one warm instance,
bounded concurrency, and bounded autoscaling. This is a cost-conscious public
sandbox shape, not a multi-region availability claim.

Cloud deployment must use GitHub OIDC Workload Identity Federation or an
equivalent short-lived identity. Long-lived service-account JSON keys are not
accepted. The runtime service account receives no cloud API role until a
specific dependency requires and documents one.

## Implementation Checkpoint

On 2026-07-13 this boundary was deployed in GCP project
`ipo-one-public-sandbox-cptm511`, region `asia-southeast1`, and the root A
record was cut over to reserved address `136.68.214.66`. Managed TLS is active
for `ipo.one` and `www.ipo.one`; Cloud Armor, the HTTPS redirect, the
load-balancer-only origin, disabled default URL, immutable release identity,
multi-region readiness check, service alerts, DNS preservation, and rollback
value were verified. The exact hosted evidence is recorded in
`docs/security/IPO_ONE_PUBLIC_SANDBOX_DEPLOYMENT_EVIDENCE_v0.1.md`.

## Consequences

- Human and Agent clients share one release, hostname, CSP, contract, and
  request-correlation boundary.
- Direct public origin bypass and Host-header routing ambiguity fail closed.
- A bad or incomplete production environment cannot silently start in local
  sandbox mode.
- DNS, certificate, edge, cloud IAM, monitoring, and rollback evidence remain
  externally operated controls and cannot be proven by repository tests alone.
- Process-local sessions can disappear during rollout or autoscaling and cannot
  support authenticated pilot state. Durable state and AuthN remain separate
  `DATA-002` and `SECURITY-001` gates.
- No architecture can warrant zero unknown vulnerabilities. Independent review,
  monitoring, incident response, and prompt patching remain required.

## Approval Gates

The public-sandbox GCP project, region, billing, runtime identity, Cloud Armor,
security contact, DNS rollback, and exact root-A change were authorized for the
no-real-funds deployment. Protected-environment approval, formal multi-role
evidence sign-off, named alert recipients, incident/takedown ownership, and log
retention review remain open governance requirements.

Before any real value or private data, the Production No-Go list in the public
beta launch gate still applies in full.
