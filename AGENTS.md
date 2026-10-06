# IPO.ONE Project Guidance

For product, architecture, or implementation decisions, use this checkout's
`docs/PRODUCT_CONSTITUTION.md` for authority, current phase, requirement status,
and explicit supersession. Read its relevant sections and the accepted ADRs,
security invariants, contracts, and acceptance criteria needed for the task.
Do not import another checkout's phase or permissions.

For implementation and user-facing changes, also apply the relevant sections of
`docs/guidance/IPO_ONE_PRODUCT_ENGINEERING_AND_EXPERIENCE_STANDARD_v1.0.md`.
Use `docs/guidance/CODEX_GUIDANCE_INDEX.md` to locate additional sources by topic.
Read original archives only for provenance or source-fidelity questions; draft
reviews and roadmaps do not confer approval. Reuse already-read guidance until
its relevant version or evidence changes.

Keep project decisions in their versioned canonical documents. Specific product,
identity, funds, privacy, release, and acceptance requirements below remain binding;
general workflow efficiency does not waive them. An existing task or issue may
supply the required issue contract without duplicating its contents elsewhere.

## Product usability and truthful completion gate

For every user-facing IPO.ONE capability:

1. A feature is not complete merely because code, a component, handler, test,
   contract, artifact, or feature flag exists.
2. Completion requires explicit evidence for five states: CODE, RUNTIME,
   DEPLOYED, REACHABLE, and VERIFIED.
3. Every Human workflow step requiring action must have a visible,
   understandable, operable UI control. Direct hashes, internal functions,
   hidden DOM, fixtures, and developer tools do not count.
4. Every Agent workflow step must have an equivalent authorized, versioned
   API/MCP operation.
5. Every role-allowed view must be reachable from a visible control. An orphan
   view is a release-blocking defect.
6. Navigation placement and authorization are separate concerns. A non-primary
   view may move to an advanced group but may not lose all entry points.
7. Disabled or unconfigured capabilities must remain truthfully visible with
   the reason and recovery condition; they may not silently disappear or be
   represented as live.
8. Local tests, historical testnet transactions, static artifacts, preview
   screenshots, successful merges, and Vercel Ready status do not prove
   production usability.
9. Final browser acceptance must run against the actual deployed SHA and use
   visible clicks for Human journeys.
10. Critical state must survive refresh, logout/login, process restart, worker
    replay, duplicate events, and database recovery as applicable.
11. Sandbox data is allowed, but final acceptance must use deployed services
    and durable persistence, not frontend mocks or hardcoded success responses.
12. Chain claims must distinguish digest, transaction, observation, finality,
    and reconciliation. Never present historical or synthetic artifacts as a
    current user's chain record.
13. Do not put PII, KYC, raw transactions, or full credit histories on-chain.
14. Credit history may inform a new explainable Decision/Offer; it may not
    silently increase limits or bypass authorization.
15. Finding a defect creates an obligation to implement the smallest correct
    fix, add regression protection, deploy, and retest. A defect report alone
    does not complete a repair task.
16. If any required verification is unavailable, report
    `BLOCKED — NOT COMPLETE`. Never substitute "code complete" for product
    complete.

Allowed final verdicts:

- `PASS — DEPLOYED AND USER-VERIFIED`
- `BLOCKED — NOT COMPLETE`
- `FAIL — NOT COMPLETE`

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
- M2 is secured-only and may implement one curated Base Sepolia test-asset pool
  after governance ratification. The pool is an adapter-connected Capital
  Facility, not a second kernel. No hybrid/unsecured real-value exposure, market
  factory, mainnet, real funds, multiple markets/assets, flash loans, recursive
  leverage, or unrestricted withdrawal is authorized. Each L3 profile,
  contract, asset, oracle, account, signer, and run remains separately reviewed.
- M3 is narrowly limited to Metered Usage Evidence and deterministic charge
  admission as a Provider Spend Facility profile over the shared kernel. The
  exact `provider_gateway_compute` / `inference_tokens` / `token` synthetic
  profile is authorized at L0 and L2 through the canonical launch policy. No
  separate Task/API/Compute product, ledger, orchestration platform, external
  Provider, second resource profile or real value is authorized.
- Do not enable real Human cash loans, tokens/DAO governance, arbitrary
  withdrawals, or black-box credit scoring before real repayment events exist.
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
- Continue from the current approved task and existing implementation. Use
  foundation/scaffolding guidance only when those foundations are actually missing.
- Contracts, funds movement, risk controls, permissions, privacy boundaries,
  production dependencies, and deployment changes require human review.

## Product experience handoff

For product iterations, provide a clickable experience URL. For local work, keep
the loopback runtime available through the requested Founder review; use the
applicable hosted URL after separately authorized deployment. A PR, screenshot,
test log, or report does not substitute for the experience link. This requirement
does not authorize deployment, public exposure, credentials, or funds movement.

For IPO.ONE planning or implementation that needs phase/authority routing, use
`.agents/skills/ipo-one-guidance-gate/SKILL.md`; detailed product truth remains in
the canonical project documents above.

For all user-facing feature development, follow
`docs/guidance/IPO_ONE_CURRENT_UI_BASELINE.md` and run `pnpm check:ui-baseline`.
Use the current WEB-027 Precision Terminal UI and subsequent approved fixes;
never build a new feature on an old UI branch. Verify the actual served assets
and affected screens, including login dialogs, themes and narrow viewports.
