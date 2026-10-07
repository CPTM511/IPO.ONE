# Codex guidance source index

Read only the sources relevant to the current decision. This index is not a mandatory reading sequence; original DOCX archives are for provenance or source-fidelity checks.

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
- Community demand-validation and Reddit operating baseline:
  `docs/guidance/IPO_ONE_COMMUNITY_VALIDATION_PLAYBOOK_v1.0.md`
  (communication scope only; current community rules and account eligibility still require verification)
- CHAIN-001B live-testnet runbook:
  `docs/security/IPO_ONE_CHAIN_001B_TESTNET_RUNBOOK_v0.1.md`
- M2 secured-pool pre-development alignment:
  `docs/guidance/IPO_ONE_M2_PRE_DEVELOPMENT_ALIGNMENT_v1.0.md`
- M2 architecture decisions:
  `docs/architecture/ADR-M2-001-SECURED_ONLY_M2.md` through
  `docs/architecture/ADR-M2-005-ORACLE_RATE_LIQUIDATION.md`
- M2 threat model:
  `docs/security/IPO_ONE_M2_PUBLIC_SECURED_POOL_THREAT_MODEL_v0.1_DRAFT.md`
- M2 requirement traceability:
  `docs/traceability/IPO_ONE_M2_REQUIREMENT_TRACEABILITY_v0.1.md`

Treat the guidance as versioned project context. It may evolve, so prefer
updating the guidance document rather than scattering product decisions across
untracked notes.

Guidance hierarchy:

- The current checkout's Product Constitution is the highest product-truth authority and conflict
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
- M2 Pre-Development Alignment v1.0 and ADR-M2-001 through ADR-M2-005 govern the
  Founder-approved secured-pool architecture and issue sequence. They grant no
  runtime, dependency, contract, deployment, signer, oracle, risk-parameter,
  testnet-run, real-value, or production authority. The canonical Constitution
  and launch policy remain the conflict and activation gates.


## Current UI and feature-development baseline

- `docs/guidance/IPO_ONE_CURRENT_UI_BASELINE.md` — mandatory current UI routing and executable regression guard.
