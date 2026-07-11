# IPO.ONE Project Guidance

Before making product, architecture, or implementation decisions in this repo,
read the project guidance source:

- `docs/guidance/IPO_one_Product_Description_and_PRD_v1.md`
- Original source archive: `docs/guidance/IPO_one_Product_Description_and_PRD_v1.docx`
- `docs/guidance/IPO_ONE_MVP_Build_PRD_Technical_Architecture_Codex_Task_Spec_v0.1_FINAL.md`
- Original MVP build archive: `docs/guidance/IPO_ONE_MVP_Build_PRD_Technical_Architecture_Codex_Task_Spec_v0.1_FINAL.docx`
- Architecture review proposal: `docs/guidance/IPO_ONE_ARCHITECTURE_REVIEW_v0.2_DRAFT.md`
- Commercialization roadmap proposal: `docs/guidance/IPO_ONE_COMMERCIALIZATION_ROADMAP_v0.3_DRAFT.md`
- Public beta launch gate: `docs/guidance/IPO_ONE_PUBLIC_BETA_LAUNCH_READINESS_v0.3.md`
- Public sandbox threat model: `docs/security/IPO_ONE_SANDBOX_THREAT_MODEL_v0.3.md`

Treat the guidance as versioned project context. It may evolve, so prefer
updating the guidance document rather than scattering product decisions across
untracked notes.

Guidance hierarchy:

- Product Charter / Product Description v1.0 sets the long-term product thesis,
  protocol boundaries, and business/technical direction.
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

Current core constraints:

- IPO.one is a machine-readable credit obligation protocol layer, not a simple
  lending app.
- Product primitive: `Identity + Payment + Obligation`.
- MVP direction: Agent-first through Agent Lockbox.
- Must remain human-compatible from day 1 through schema support for Human
  Subject, Consent, KYC/VC references, Originator, Loan Tape, DPD/default,
  restructure, repurchase, and write-off.
- Must remain multi-chain-ready from day 1 using CAIP-2, CAIP-10,
  chain-agnostic obligation IDs, event indexing, per-chain caps, and adapter
  boundaries.
- Do not build early human cash loans, public LP vaults, tokens/DAO governance,
  arbitrary withdrawals, or black-box credit scoring before real repayment
  events exist.
- Sensitive human data and raw KYC/PII should stay offchain by default; use
  encrypted offchain references, hashes, attestations, and least-privilege
  access boundaries.
- Architecture should be event-sourced, versioned, adapter-based, auditable,
  and designed around explicit risk controls, pause/freeze operations, caps,
  stop-loss covenants, and verifiable repayment/default state.

MVP build rules:

- Implement the first production-limited vertical slice as `Agent Lockbox Credit
  Primitive`: Agent Subject creation, Principal binding, CAIP-10 account
  binding, allowlisted provider spend, Lockbox revenue capture, automated
  repayment routing, Repayment Events, and Admin/Risk visibility.
- MVP production credit is Agent-only. Human features are schema/prototype/mock
  only: Human Subject, Consent, KYC/VC references, Originator mock, loan tape
  simulator, and reserved obligation states.
- Codex work must be issue-based. Each task needs context, scope, non-goals,
  likely files, acceptance criteria, test command, and security checklist.
- Do not ask Codex to implement the whole MVP in one pass. Start with foundation
  tasks such as monorepo scaffold, AGENTS.md / issue templates, shared enums and
  validators, migration baseline, and local dev environment.
- Contracts, funds movement, risk controls, permissions, privacy boundaries,
  production dependencies, and deployment changes require human review.
