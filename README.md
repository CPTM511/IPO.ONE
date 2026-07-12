# IPO.ONE

[![Quality Gate](https://github.com/CPTM511/IPO.ONE/actions/workflows/quality.yml/badge.svg)](https://github.com/CPTM511/IPO.ONE/actions/workflows/quality.yml)

**Machine-readable credit obligations for humans and agents.**

IPO.ONE is an Agent-first, human-compatible protocol layer for creating,
controlling, settling, repaying, and verifying credit obligations across Web2
and Web3 systems.

```text
Identity + Payment + Obligation
```

The current protocol kernel makes the operating controls explicit:

```text
Identity + Mandate + Payment + Obligation + Evidence
```

IPO.ONE is not a lending marketplace, wallet, bank, or universal credit score.
It is infrastructure for applications, agents, providers, originators, payment
rails, compliance partners, and capital systems that need to share one
auditable obligation state without collapsing identity, authorization, money
movement, accounting, and risk into one black box.

> **Current status:** publicly deployable sandbox candidate. The repository now
> includes a fail-closed production runtime, hardened container, Cloud Run
> service template, Human/Agent discovery, and hosted-release runbook. It is not
> yet live at `ipo.one`; cloud, edge, certificate, monitoring, and DNS execution
> still require explicit review. It performs no real lending, custody, KYC,
> underwriting, or production fund movement. Real-value use is prohibited.

## The Product Thesis

Payments answer whether value moved. IPO.ONE answers the wider credit question:

- Who or what incurred the obligation?
- Which Principal is economically responsible?
- What authority permitted the action?
- Where and for what purpose could value be spent?
- Which cashflow route captures repayment?
- What amount remains outstanding?
- Which evidence proves settlement, repayment, delinquency, or default?
- Can another platform or Agent verify that state without trusting a private
  spreadsheet or a proprietary score?

The long-term product is a composable credit-state protocol. Applications can
embed its schemas, policies, APIs, Evidence, and adapter contracts like building
blocks while regulated functions remain with licensed and certified partners.
KYC, KYP, on-ramp, off-ramp, payment, chain, and risk providers connect through
reviewed plugin contracts; IPO.ONE does not need to become every provider.

## Why Start With Agent Lockbox

The first commercial wedge is the **Agent Lockbox Credit Primitive**. An Agent
can incur tightly scoped provider obligations while revenue is captured into a
controlled Lockbox and routed to repayment before surplus is released.

```text
Agent Subject
  -> Principal and revocable Mandate
  -> CAIP-10 account binding
  -> Lockbox and deterministic credit line
  -> allowlisted Provider spend
  -> Transfer Intent and Settlement Evidence
  -> revenue capture
  -> automated repayment waterfall
  -> updated Evidence and credit recommendation
```

This is a practical starting point because Agent identity, spend destinations,
provider categories, API consumption, and cashflows can be constrained and
observed programmatically. Human credit remains schema-compatible from day one,
but production Human lending is intentionally out of scope until licensed
Originators, consent, privacy, loan-tape, legal, capital, and stop-loss controls
are approved.

## Public Beta Experience

One shared protocol state serves two first-class interaction modes:

| Mode | Designed for | Current capabilities |
| --- | --- | --- |
| Human Operator | Product, risk, operations, compliance, and partner teams | Guided lifecycle, position summary, Mandate and Agent state, credit learning, Transfers, Evidence, Ledger integrity, plugins, and risk visibility |
| Agent Runtime | Agent developers and machine clients | OpenAPI 3.1.2, zero-dependency JavaScript SDK, stable Problem Details, request correlation, sandbox-session continuity, and live request history |

The complete sandbox flow demonstrates:

1. Agent Subject and economic Principal creation.
2. Bounded, revocable Mandate activation.
3. Mock CAIP-10 execution-account binding.
4. Lockbox and balanced Ledger account creation.
5. Deterministic, explainable credit-line decision.
6. Allowlisted, purpose-bound Provider spend.
7. Event-sourced Transfer Intent, exact quote, authorization, submission, and
   finalized Settlement Receipt.
8. Revenue capture, repayment allocation, and credit-utilization release.
9. Versioned obligation, Rail, Ledger, audit, and Evidence events.
10. Evidence-derived credit learning without rewarding the same event twice.

The named healthy, risky, and recovery cycles are synthetic product scenarios.
They are visibly labelled and must not be treated as underwriting evidence.

## Architecture

```mermaid
flowchart TB
  Human["Human Operator"] --> Edge["HTTPS load balancer + Cloud Armor"]
  Agent["Agent Runtime / SDK"] --> Edge
  Edge --> HTTP["Allowlisted same-origin HTTP boundary"]
  HTTP --> Session["Bounded sandbox session and serialized operations"]
  Session --> Flow["Agent Lockbox orchestrator"]

  Flow --> Identity["Identity"]
  Flow --> Mandate["Mandate"]
  Flow --> Risk["Risk"]
  Flow --> Spend["Spend Policy"]
  Flow --> Lockbox["Lockbox"]
  Flow --> Obligation["Obligation"]
  Flow --> Rail["Rail and Settlement"]
  Flow --> Learning["Credit Learning"]

  Identity --> Evidence["Event and Evidence stream"]
  Mandate --> Evidence
  Risk --> Evidence
  Spend --> Evidence
  Lockbox --> Ledger["Double-entry Ledger"]
  Obligation --> Evidence
  Rail --> Evidence
  Learning --> Evidence
  Ledger --> Evidence

  Rail -. optional durable repository .-> Postgres["PostgreSQL event runtime"]
  Plugins["Reviewed plugin manifests"] -. data contracts only .-> Flow
```

### Protocol Components

| Component | Responsibility | Current implementation |
| --- | --- | --- |
| Identity | Principal, Agent/Human Subject, CAIP account references | Agent flow live; Human execution blocked |
| Mandate | Capability, counterparty, asset, amount, time, nonce, and revocation scope | First-class, fail-closed local service |
| Spend Policy | Provider allowlist, category, transaction, daily, and obligation limits | Enforced before spend and Rail submission |
| Obligation | Principal, amount, due state, repayment, overdue/default-compatible lifecycle | Versioned local aggregate |
| Lockbox | Revenue capture and repayment source | Projected through balanced Ledger postings |
| Ledger | Accounting source of truth | Append-only, double-entry, positive, balanced, asset-scoped, idempotent |
| Rail | Transfer Intent, exact quote, finality, settlement, reversal Evidence | Event-sourced sandbox adapter; no network or funds |
| Evidence | Portable event envelope, hashes, aggregate version, causation, correlation, finality | `evidence_event.v2` emitted across the kernel |
| Credit Learning | Explainable behavior signals and next-cycle recommendations | Deterministic, rule-based, evidence-aware demo engine |
| Plugin Registry | Trust state and data contract for KYC/KYP, Rail, Provider, chain, and risk adapters | Manifest validation only; no executable plugin loading |
| Persistence | Command idempotency, aggregate versions, events, outbox, inbox, replay | Optional PostgreSQL Rail runtime; other demo state remains process-local |

### Repository Layout

```text
apps/
  api/                 Node.js API and same-origin static server
  web/                 Responsive Human Operator and Agent Runtime UI
api/openapi/           OpenAPI 3.1.2 public contract
packages/
  api-contract/        Request IDs and RFC 9457 Problem Details
  domain/              Shared protocol enums, validators, IDs, and schemas
  mvp-flow/            Vertical-slice composition and demo controller
  sdk/                 Alpha JavaScript client and TypeScript declarations
modules/
  authorization/       Revocable Mandates
  identity/            Principals, Subjects, and account bindings
  ledger/              Double-entry accounting
  lockbox/             Revenue capture
  obligation/          Obligation lifecycle
  spend-policy/        Provider and purpose controls
  risk/                Deterministic credit decisions and freeze controls
  payment/             No-funds payment and repayment instructions
  rail/                Event-sourced transfer and settlement kernel
  settlement/          Compatibility projection over Rail Evidence
  persistence/         PostgreSQL event, outbox, inbox, and replay runtime
  plugin-registry/     Reviewed integration manifests
  credit-learning/     Explainable signals and recommendations
  event-audit/         Append-only event and Evidence storage
  admin/               Exposure, integrity, and audit views
db/migrations/         Ordered, reversible PostgreSQL migrations
schemas/v2/            Language-neutral protocol contracts
security/test/         Live adversarial HTTP suite
docs/                  ADRs, product guidance, launch gates, and threat model
```

## Developer Contract

The machine contract is
[`api/openapi/ipo-one.v1.json`](api/openapi/ipo-one.v1.json), currently
`0.3.0-alpha.4`. It declares 21 paths and 21 operations. Successful and failed
responses carry `X-Request-ID`; failures use RFC 9457-compatible
`application/problem+json` with stable machine codes.

| Surface | Operations |
| --- | --- |
| System | liveness/readiness, Human/Agent discovery, security contact, and OpenAPI |
| Agent | create Subject/Principal, bind account, create Lockbox, request credit, read status |
| Credit | Provider spend, revenue capture, auto repayment, evidence evaluation, credit profile |
| Rail and Evidence | settlement, Rail inventory, Transfer Intent replay proof, Admin audit |
| Demo | current state, healthy/risky/recovery scenarios, complete vertical slice, reset |

The SDK is source-available at [`packages/sdk`](packages/sdk). It generates a
high-entropy sandbox session, propagates request IDs, encodes path segments,
rejects credentials embedded in base URLs, exposes typed API failures, and never
automatically retries a mutation.

```js
import { IpoOneClient } from "./packages/sdk/src/index.js";

const ipo = new IpoOneClient({ baseUrl: "http://127.0.0.1:3000" });

let state = await ipo.createAgent({ displayName: "Treasury Agent" });
const agentId = state.agent.subjectId;

state = await ipo.bindWallet(agentId, {
  accountId: "eip155:8453:0x1111111111111111111111111111111111111111"
});
state = await ipo.createLockbox(agentId);
state = await ipo.requestCreditLine(agentId);
```

Sandbox sessions preserve one workflow; they do not authenticate a person,
workload, organization, wallet, or tenant. Do not place private data in them.

## Run Locally

### Prerequisites

- Node.js 24.18.0 LTS
- pnpm 11.1.3
- PostgreSQL 17 only for the optional durable-event test suite

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open:

- Control plane: `http://127.0.0.1:3000`
- Health: `http://127.0.0.1:3000/healthz`
- Liveness: `http://127.0.0.1:3000/livez`
- Readiness: `http://127.0.0.1:3000/readyz`
- Agent discovery: `http://127.0.0.1:3000/.well-known/ipo-one.json`
- OpenAPI: `http://127.0.0.1:3000/openapi.json`
- Complete proof: `http://127.0.0.1:3000/v1/demo/vertical-slice`

Reset one sandbox session:

```sh
curl -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-IPO-ONE-Sandbox-Session: readme_demo_session_001' \
  -d '{}' \
  http://127.0.0.1:3000/v1/demo/reset
```

## Security Model

The public server is intentionally narrow. It adds no third-party browser
scripts, fonts, images, analytics, remote plugins, production credentials, or
fund-moving adapter.

| Boundary | Enforced control |
| --- | --- |
| HTTP | strict parser, explicit methods, JSON media types, no compressed bodies, 16 KiB headers, 64 KiB bodies, 2,048-character targets |
| JSON | object roots, per-operation field allowlists, depth/node/string limits, prohibited prototype keys |
| Financial values | decimal strings only, no floats, no leading-zero ambiguity, maximum 78 digits |
| Browser | same-origin CSP, frame denial, MIME protection, no referrer, restricted permissions, text-safe rendering |
| State | 30-minute TTL, 128 sessions/process, serialized session operations, 32 mutations/session, reset support |
| Availability fallback | 600 requests/process/minute, 64 concurrent requests, 256 connections, bounded header/request/socket/keep-alive timeouts |
| Public origin | explicit Host allowlist, trusted-proxy HTTPS proof, HSTS, load-balancer-only Cloud Run ingress, disabled default origin |
| Errors | closed Problem Details and replacement of unsafe request/session identifiers |
| Runtime | shell-free distroless Node 24 LTS image, digest pinning, UID 65532, immutable release ID, structured PII-safe application logs |
| Supply chain | locked pnpm graph, frozen install, production audit, read-only CI permissions, full-SHA GitHub Actions, read-only container smoke |

Application limits are defense in depth. They are not a substitute for TLS,
edge DDoS controls, origin policy, monitoring, incident response, or an
independent penetration test. The complete attacker model, control matrix, and
residual-risk register are in
[`IPO.ONE Public Sandbox Threat Model v0.3`](docs/security/IPO_ONE_SANDBOX_THREAT_MODEL_v0.3.md).
Report vulnerabilities according to [`SECURITY.md`](SECURITY.md).

## Public Deployment

The proposed public boundary keeps GoDaddy as authoritative DNS and places a
Google Cloud global external HTTPS load balancer and Cloud Armor in front of a
load-balancer-only Cloud Run origin. The same `https://ipo.one` origin serves
the Human Console, Agent API, OpenAPI contract, and discovery document.

Repository checks can prove the image and application contract; they cannot
prove an external certificate, cloud IAM policy, DNS record, WAF policy, alert,
or operator response. Those controls must be reviewed and captured during the
deployment itself.

- Architecture decision: [`ADR-014`](docs/architecture/ADR-014-public-sandbox-hosting-boundary.md)
- Deployment runbook: [`deploy/gcp/README.md`](deploy/gcp/README.md)
- Issue evidence: [`OPS-001A`](docs/codex/tasks/OPS_001_PUBLIC_SANDBOX_HOSTING_BASELINE.md)

The public container deliberately refuses to start unless it receives the
exact no-real-funds acknowledgement and an HTTPS, HSTS, trusted-ingress
configuration. No cloud credential belongs in a repository `.env` file.

## Verification

```sh
pnpm run check          # boundaries, schemas, OpenAPI, migrations, deployment, unit/contract tests
pnpm run test:security  # live adversarial HTTP and state-bounding suite
pnpm run demo           # isolated Agent Lockbox vertical slice
pnpm audit --prod       # published production dependency advisories
```

With the dev server running:

```sh
pnpm run smoke:api
```

The optional PostgreSQL suite is destructive only inside a database whose name
contains `test`; it refuses other database names.

```sh
export DATABASE_URL=postgresql://127.0.0.1:5432/ipo_one_test
pnpm run test:postgres
```

That suite covers migration up/down/up, injected atomic rollback, idempotency
conflict, concurrent writers, outbox lease recovery, transactional inbox
deduplication, and restart replay. GitHub Actions repeats the locked install,
all repository and adversarial checks, PostgreSQL recovery, isolated demo,
dependency audit, and live smoke on every push and pull request.

## Commercial Positioning

IPO.ONE is designed as an embedded infrastructure and protocol business, not a
consumer balance-sheet lender.

### Initial Customers and Partners

| Segment | Problem IPO.ONE is designed to solve |
| --- | --- |
| Agent platforms and developers | Give Agents bounded provider credit and a portable repayment record without unrestricted wallets |
| Compute, data, model, and workflow providers | Convert approved usage into explicit, monitorable obligations with settlement Evidence |
| Payment, stablecoin, on/off-ramp, and chain providers | Integrate through one normalized Transfer and Evidence contract instead of bespoke credit logic |
| Originators and capital partners | Receive consistent obligation, cashflow, delinquency, and loan-tape-grade state while retaining regulated responsibilities |
| KYC, KYP, compliance, and risk providers | Issue scoped attestations through reviewed plugins without placing raw PII onchain or in the protocol core |

### Revenue Hypotheses

These are commercialization hypotheses, not announced pricing:

- platform subscription for policy, control-plane, Evidence, and reporting;
- usage fees per active obligation, verified settlement, or Evidence workflow;
- enterprise fees for certified adapters, private deployment, support, and
  reconciliation operations;
- institution-grade portfolio, risk, and capital reporting;
- protocol or network fees only after legal, market, governance, and fund-path
  review.

The defensible layer is the normalized obligation graph and its verified event
history: identity, delegated authority, provider spend, cashflow capture,
repayment, default-compatible state, and portable Evidence available to both
humans and Agents.

## Maturity and Roadmap

| Stage | Product state | Gate |
| --- | --- | --- |
| Public sandbox | Deployment candidate | No real funds or private data; inspectable UI/API/SDK, hardened production container, proposed edge boundary, and release tests |
| Closed design-partner pilot | Next | Approved AuthN/tenant/RBAC model, durable command path, signed Mandates, certified adapters, reconciliation, SLOs, legal/security/privacy review |
| Controlled production Agent credit | Future | Licensed and capital partners, reviewed custody and fund paths, per-provider/chain caps, dual control, break-glass, monitoring, disaster recovery |
| Human-compatible and multi-chain network | Long term | Licensed Originators, Consent/KYC references, loan tape, stop-loss covenants, finality/reorg controls, portable Credit Passport and attestations |

Near-term engineering priorities are:

1. Extend reviewed PostgreSQL persistence and reconciliation from Rail to
   Mandate, Ledger, Lockbox, Obligation, Risk, and Admin projections.
2. Complete `SECURITY-001`: AuthN, tenant ownership, object/function RBAC,
   credential lifecycle, rate policy, dual control, and break-glass.
3. Add cryptographically signed Mandates, nonce/replay protection, key rotation,
   and wallet/account proof.
4. Certify out-of-process Provider, KYP, payment, on/off-ramp, and chain adapters
   with signed requests, webhook replay protection, revocation, and failure policy.
5. Execute `OPS-001A`: approved cloud identity, HTTPS edge, Cloud Armor,
   monitoring, incident ownership, immutable release, and GoDaddy DNS cutover.
6. Add reconciliation, finality/reorg handling, capacity reservations,
   observability, incident operations, backup, restore, and disaster recovery.

The requirement trace and commercialization sequence are maintained in
[`IPO.ONE Commercialization Roadmap v0.3`](docs/guidance/IPO_ONE_COMMERCIALIZATION_ROADMAP_v0.3_DRAFT.md).
The precise public-beta gate is
[`IPO.ONE Public Beta Launch Readiness v0.3`](docs/guidance/IPO_ONE_PUBLIC_BETA_LAUNCH_READINESS_v0.3.md).

## Project Governance

Product and protocol decisions follow this hierarchy:

1. [`Product Description and PRD v1`](docs/guidance/IPO_one_Product_Description_and_PRD_v1.md)
2. [`MVP Build PRD and Technical Architecture v0.1`](docs/guidance/IPO_ONE_MVP_Build_PRD_Technical_Architecture_Codex_Task_Spec_v0.1_FINAL.md)
3. Reviewed ADRs in [`docs/architecture`](docs/architecture)
4. Issue-scoped implementation tasks in [`docs/codex/tasks`](docs/codex/tasks)

Architecture review and roadmap drafts are proposals until named human review.
Contracts, real funds, permissions, privacy boundaries, production dependencies,
and deployment changes require explicit Founder/CTO/Security review.

## Safety Notice

This repository is engineering software and product research. It is not
financial, legal, investment, compliance, or underwriting advice. It must not
be used to originate loans, custody assets, make production credit decisions,
store raw KYC/PII, or move real value in its current form.

IPO.ONE's ambition is to become the shared trust layer through which humans,
Agents, providers, originators, payment systems, and capital can exchange
verifiable credit state. This repository makes that thesis concrete, runnable,
and reviewable without pretending the public sandbox is already the finished
financial network.
