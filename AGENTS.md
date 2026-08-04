# IPO.ONE Project Guidance

Before making product, architecture, or implementation decisions in this repo,
read the project guidance source:

- Highest product-truth authority and requirement registry:
  `docs/PRODUCT_CONSTITUTION.md`
- Canonical Product Charter: `docs/guidance/IPO_ONE_PRODUCT_CHARTER_v1.1.md`
- Founding Edition source archive:
  `docs/guidance/IPO_ONE_Product_Charter_v1.1_Founding_Edition.docx`
- `docs/guidance/IPO_one_Product_Description_and_PRD_v1.md`
- Original source archive: `docs/guidance/IPO_one_Product_Description_and_PRD_v1.docx`
- `docs/guidance/IPO_ONE_MVP_Build_PRD_Technical_Architecture_Codex_Task_Spec_v0.1_FINAL.md`
- Original MVP build archive: `docs/guidance/IPO_ONE_MVP_Build_PRD_Technical_Architecture_Codex_Task_Spec_v0.1_FINAL.docx`
- Architecture review proposal: `docs/guidance/IPO_ONE_ARCHITECTURE_REVIEW_v0.2_DRAFT.md`
- Commercialization roadmap proposal: `docs/guidance/IPO_ONE_COMMERCIALIZATION_ROADMAP_v0.3_DRAFT.md`
- Founder-approved product optimization measure:
  `docs/guidance/IPO_ONE_PRODUCT_OPTIMIZATION_MEASURE_v1.0.md`
- Founder-directed product engineering and experience standard:
  `docs/guidance/IPO_ONE_PRODUCT_ENGINEERING_AND_EXPERIENCE_STANDARD_v1.0.md`
- Local-to-closed-pilot delivery guidance:
  `docs/guidance/IPO_ONE_LOCAL_TO_CLOSED_PILOT_DELIVERY_GUIDE_v0.1_DRAFT.md`
- Public beta launch gate: `docs/guidance/IPO_ONE_PUBLIC_BETA_LAUNCH_READINESS_v0.3.md`
- Public sandbox threat model: `docs/security/IPO_ONE_SANDBOX_THREAT_MODEL_v0.3.md`
- CHAIN-001B live-testnet runbook:
  `docs/security/IPO_ONE_CHAIN_001B_TESTNET_RUNBOOK_v0.1.md`

Treat the guidance as versioned project context. It may evolve, so prefer
updating the guidance document rather than scattering product decisions across
untracked notes.

Guidance hierarchy:

- Product Constitution v1.0 is the highest product-truth authority and conflict
  resolver. It assigns stable requirement IDs, records approved/gated/rejected
  capabilities, and resolves the current CreditLine, Agent Lockbox, Strategy
  Vault, and dispute-workflow decisions. Approval in the Constitution is not
  implementation, verification, hosting, real-value, or production evidence.
- Product Charter v1.1 is the canonical long-term product and governance source.
  It ratifies one shared obligation kernel with Human and Agent as parallel,
  first-class entry modes. Product Description v1.0 remains a historical source
  and is superseded where it conflicts with v1.1.
- MVP Build Spec v0.1 governs first implementation work, repository scaffolding,
  issue decomposition, architecture defaults, launch gates, and Codex operating
  rules.
- Architecture Review v0.2 is a non-canonical audit and target-model proposal.
  Use it to identify known gaps and proposed ADRs, but do not treat protocol,
  funds, permissions, or production-model changes as approved until human review.
- Commercialization Roadmap v0.3 is a non-canonical requirement traceability
  and pilot-readiness proposal. Use it to sequence issues and launch gates, but
  keep product, pricing, legal, capital, provider, chain, and production
  permission decisions behind named human approval.
- Product Optimization Measure v1.0 is the Founder-approved near-term product
  and development reference. It sets the three product families, four delivery
  phases, bilateral Capital Partner workflow, Credit Passport direction, and
  non-redundancy rules. It does not itself approve deployment, credentials,
  contracts, signers, KYC vendors, production risk, or funds movement.
- Product Engineering and Experience Standard v1.0 is the mandatory
  implementation and acceptance standard for local synthetic/no-funds work.
  It requires one primary next action, explicit mutation language, safe
  defaults, server-derived workspace recovery, queryable automation,
  issue-sized delivery, minimal architecture and real-browser verification.
  It grants no permission, risk, deployment, signer, KYC or funds authority.
- Local-to-Closed-Pilot Delivery Guide v0.1 is non-canonical delivery guidance.
  Use it to separate repeatable local integration, invited durable no-funds
  operation, live testnet execution, and controlled real value. It grants no
  deployment, signer, remote-access, risk, contract, or funds authority.

Current core constraints:

- IPO.one is a machine-readable credit obligation protocol layer, not a simple
  lending app.
- Product primitive: `Identity + Payment + Obligation`.
- Product direction: dual-native through one shared kernel. Agent and Human
  pilots progress in parallel; Agent implementation may land first, but neither
  entry mode may fork the obligation, ledger, risk, event, or Evidence model.
- The no-real-funds product must provide an operable Human pilot, including
  Human Subject, Consent, KYC/VC references, Credit Intent, explainable Offer,
  Obligation, repayment schedule, DPD/default, restructure, repurchase,
  write-off, and Evidence using synthetic or redacted data only.
- Must remain multi-chain-ready from day 1 using CAIP-2, CAIP-10,
  chain-agnostic obligation IDs, event indexing, per-chain caps, and adapter
  boundaries.
- Do not enable real Human cash loans, public LP vaults, tokens/DAO governance,
  arbitrary withdrawals, or black-box credit scoring before real repayment
  events exist.
- Sensitive human data and raw KYC/PII should stay offchain by default; use
  encrypted offchain references, hashes, attestations, and least-privilege
  access boundaries.
- Architecture should be event-sourced, versioned, adapter-based, auditable,
  and designed around explicit risk controls, pause/freeze operations, caps,
  stop-loss covenants, and verifiable repayment/default state.

MVP build rules:

- Implement the first shared vertical slice as a no-real-funds credit lifecycle:
  Subject and Principal binding, Consent/Mandate, Credit Intent, deterministic
  decision and Offer, accepted Obligation, controlled execution, repayment,
  servicing/default transitions, Evidence, and Admin/Risk visibility. Reuse it
  for both Human and Agent entry modes.
- Agent Lockbox remains the first production-limited credit candidate. Human
  credit may be fully functional only in synthetic/private pilot modes until
  legal, KYC/privacy, risk, capital, servicing, and production permissions are
  separately approved.
- Human-facing UI and machine-facing OpenAPI/SDK/MCP surfaces are co-equal
  product interfaces over the same versioned application protocol.
- Normal role journeys must not require internal IDs, hashes, versions, or
  operation names. Technical details remain available through progressive
  disclosure and queryable receipts.
- Labels such as View, Open, Continue, Back, and Next must not hide an
  economic, authority, or lifecycle mutation.
- Browser state is never canonical product truth. Role workspaces and next
  actions must recover from authenticated server truth.
- Automation may prepare, route, reconcile, and execute exact Mandate-bound
  work, but every run must remain queryable and fail closed on stale,
  unknown, unauthorized, or unreconciled state.
- Multi-chain tests use Base Sepolia (`eip155:84532`) as the first execution
  profile and X Layer Testnet (`eip155:1952`) as the portability profile. This
  is a reversible test configuration, not a mainnet or capital commitment.
- Codex work must be issue-based. Each task needs context, scope, non-goals,
  likely files, acceptance criteria, test command, security checklist,
  permission boundary, migration impact, rollback plan, and completion
  Evidence.
- Do not ask Codex to implement the whole MVP in one pass. Start with foundation
  tasks such as monorepo scaffold, AGENTS.md / issue templates, shared enums and
  validators, migration baseline, and local dev environment.
- Contracts, funds movement, risk controls, permissions, privacy boundaries,
  production dependencies, and deployment changes require human review.
