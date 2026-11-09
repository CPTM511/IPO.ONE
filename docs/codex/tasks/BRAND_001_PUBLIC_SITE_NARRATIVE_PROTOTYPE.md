# BRAND-001: Public Website Narrative and Interactive Prototype

Status: Approved for Codex implementation on a review branch.  
Branch: `codex/brand-001-homepage-narrative-prototype`  
Release status: Founder review only. Do not merge or deploy.

## 1. Objective

Rebuild the IPO.ONE public homepage prototype around the actual product proposition before doing any further login, animation-polish or production work.

The current prototype over-emphasizes abstract ideas such as “Responsibility is the missing layer” and does not give sufficient prominence to the real product:

- people and autonomous Agents can access external capital;
- both create explicit, auditable obligations;
- verified repayment and execution build reusable Credit State;
- an Agent acts only through a verified Principal and bounded Mandate;
- one shared credit lifecycle works across Human and Agent interfaces;
- multiple capital providers and settlement rails can connect without redefining the obligation.

The result must be an interactive prototype inside the repository and Codex worktree. It must not be delivered only as an external HTML attachment, generated image or chat artifact.

## 2. Authority order

Read and obey, in order:

1. `AGENTS.md`
2. `docs/PRODUCT_CONSTITUTION.md`
3. `docs/WHITEPAPER.md`
4. `README.md`
5. `docs/design/IPO_ONE_PUBLIC_NARRATIVE_V2.md`
6. This task
7. Existing public-site implementation and prior prototypes as implementation references only

If an existing slogan, section or visual conflicts with the first five sources, replace it.

## 3. Product interpretation

The prototype must present IPO.ONE as:

> Credit and obligation infrastructure for people and autonomous Agents.

The primary outcome is:

> Establish identity and authority, access capital, create a clear obligation, repay it, and carry verified performance into the next credit decision.

The distinctive Agent flow is:

> Principal → Agent Identity → Mandate → Credit Request → Offer → Authorization → Execution → Repayment → Credit State

The Human flow is:

> Identity → Consent → Evidence → Credit Request → Offer → Obligation → Repayment → Credit State

The two paths differ at the edge and converge on shared Offers, Obligations, settlement evidence and Credit State.

## 4. Mandatory homepage hierarchy

Implement the exact hierarchy and baseline copy in `docs/design/IPO_ONE_PUBLIC_NARRATIVE_V2.md`.

The first screen must communicate, in this order:

1. **Category:** the credit protocol for the Human–Agent economy.
2. **User value:** access capital and build credit from verified performance.
3. **Who it serves:** people and autonomous Agents.
4. **How it works:** identity, authority, funding offer, obligation, repayment and portable history.
5. **Primary action:** open IPO.ONE.
6. **Secondary action:** see Agent credit in action.

The main headline is:

> Access capital. Build credit from verified performance.

The supporting body is:

> IPO.ONE lets people and autonomous Agents establish identity and authority, receive funding offers, create clear obligations, repay through approved rails, and carry their credit history forward.

Do not use “Responsibility is the missing layer” as the main headline. It may appear only as a secondary explanatory statement if it materially improves comprehension.

`BORROW. BUILD. PROVE.` remains a secondary brand signature, not the product explanation.

## 5. Prototype scope

Implement an isolated Founder-review prototype using the existing web stack.

### Required approach

- Inspect the current `apps/web` architecture before editing.
- Do not add a second framework, parallel application shell or new design system.
- Prefer an isolated, feature-flagged or review-only route within the existing web application.
- Do not expose the prototype in the production navigation.
- Do not change backend APIs, database state, authentication, wallet flows, protocol behavior or production deployment.
- Do not merge to `main` or deploy to `ipo.one`.

If the current web architecture cannot safely support a review-only route, document the constraint and implement the smallest repository-native alternative. Do not create technical debt merely to produce a demo.

## 6. Required prototype sections

### 6.1 Hero

Use the frozen copy from `docs/design/IPO_ONE_PUBLIC_NARRATIVE_V2.md`.

The hero visual must show the product outcome, not an abstract protocol diagram. It should make the following relationship immediately legible:

> Capital access → explicit obligation → verified repayment/execution → stronger Credit State

No orbiting nodes, glowing cube, AI brain, token imagery, robot mascot or generic blockchain visual.

### 6.2 Agent credit — first interactive module

This is the first major section after the hero.

Create one concrete, synthetic Agent-working-capital scenario. The user can advance or play through:

1. Principal verified
2. Agent identity bound
3. Mandate defined
4. Credit requested
5. Offer accepted
6. Execution authorized
7. Repayment verified
8. Credit State improved

At every step, show:

- what action occurred;
- what authority allowed it;
- what object or state changed;
- what remains prohibited;
- how the final verified outcome changes future credit access.

The experience must emphasize capital access and credit progression—not only identity and authorization.

### 6.3 Two entry paths, one credit system

Provide a Human / Agent selector.

Human copy and objects:

- Identity
- Consent
- Evidence
- Request
- Offer
- Obligation
- Repayment
- Credit State

Agent copy and objects:

- Principal
- Agent Identity
- Mandate
- Execution Plan
- Offer
- Authorization
- Obligation
- Repayment
- Credit State

Make their convergence into the shared credit lifecycle visible and understandable without requiring technical knowledge.

### 6.4 Credit progression and Passport

Show a clear before-and-after change:

- before completion: limited capacity, T2, incomplete history;
- after verified repayment: settled obligation, new evidence, T3, improved indicative capacity or terms.

Provide selective-disclosure controls for the Credit Passport. Do not reduce the concept to a generic credit-score gauge.

### 6.5 Productive use cases

Use the four approved use cases:

- Agent working capital for compute, data, APIs and software;
- controlled strategy capital with explicit limits;
- Human productive credit for equipment, inventory and working capital;
- Provider or vendor credit for machine services.

One concrete Agent use case must be active by default. Human productive credit may be selectable.

### 6.6 Capital providers and rails

Explain through one interactive obligation:

- external providers supply capital and set terms;
- IPO.ONE standardizes requests, routes offers, records obligations and reconciles outcomes;
- traditional, on-chain and hybrid rails do not create different credit systems.

Do not imply that IPO.ONE is automatically the lender, custodian or balance-sheet provider.

### 6.7 Developers and trust

Show Human UI, API, SDK, MCP and A2A as interfaces to the same lifecycle.

Trust copy must remain plain:

> Intelligence can recommend. Policy decides.

Technical diagnostics, RPC state, indexer state and deployment evidence must remain outside the main narrative.

## 7. Language requirements

All public copy must be natural, concise and professional.

### Required style

- complete, direct sentences;
- common words before protocol terminology;
- one promise per section;
- concrete subject, verb and outcome;
- visible distinction between present product behavior, prototype simulation and future protocol ambition.

### Prohibited style

- AI-generated filler;
- chains of abstract nouns;
- slogans that replace explanation;
- “revolutionary,” “world-changing,” “frictionless,” “unlimited,” “autonomous finance,” “economic memory,” “proof in motion” or “earn the next decision” as public copy;
- repeated use of canonical, deterministic, native, primitive, ontology or orchestration on the marketing surface;
- fake partners, fake TVL, fake volume, fake production capital or unsupported “world first” claims.

## 8. Visual requirements

The visual direction remains premium, restrained and AI-era rather than crypto-native:

- editorial typography and strong whitespace;
- warm light mode and near-black dark mode;
- one restrained signal accent;
- product UI and state transitions as the main visual asset;
- minimal icon use;
- no decorative icon grids;
- no equal-card dashboard wall;
- no purple-neon Web3 treatment;
- no generic AI imagery;
- responsive desktop and mobile layouts;
- persistent light/dark theme switching.

Benchmark principles may be drawn from Apple, Linear, Stripe, Morpho, Hyperliquid, Aave, Uniswap, O1.credit, Nevermined, Skyfire, Catena, Theo, Maple, Centrifuge and Huma, but no page or component should be copied.

## 9. Interaction requirements

This task is not a login or authentication redesign.

Required interactions are limited to those that prove the narrative:

- Human / Agent selector;
- playable Agent credit sequence;
- use-case selector;
- before/after Credit State transition;
- Credit Passport disclosure controls;
- capital-provider / rail selection for one obligation;
- light/dark theme switch;
- clear CTA into the existing product.

Do not spend the task on login steps, wallet connection, animation ornament or technical status panels.

## 10. Acceptance criteria

### Narrative

A new visitor must understand within 15 seconds that:

- IPO.ONE provides credit infrastructure;
- people and autonomous Agents can use it;
- the product connects borrowers to external capital;
- accepted terms create an explicit obligation;
- verified performance improves future credit access;
- Agent authority is bounded by a Principal and Mandate.

### Functional

- The review prototype is repository-native and starts through the documented local command.
- All required interactions work with keyboard and pointer input.
- Theme switching persists across reloads.
- The Agent scenario completes from Principal verification to improved Credit State.
- The Human / Agent selector changes the correct edge objects without forking shared lifecycle objects.
- No control is dead.
- No existing production feature, route or test is removed.

### Quality

- No production deployment.
- No backend or protocol changes.
- No new framework.
- No unsupported claims.
- No material copy drift from `docs/design/IPO_ONE_PUBLIC_NARRATIVE_V2.md`.
- Existing repository checks pass.
- Add focused UI tests for the frozen hero copy and the Agent lifecycle completion.

## 11. Required evidence

Codex must return:

1. exact branch and commit SHA;
2. files changed;
3. local run command and review URL;
4. test commands and exact results;
5. screenshots for desktop light, desktop dark and mobile;
6. a short screen recording or equivalent evidence of the Agent lifecycle interaction;
7. a section-by-section copy diff against the previous prototype;
8. an explicit statement that nothing was deployed and no production behavior changed.

## 12. Stop conditions

Stop and report `BLOCKED` rather than improvising if:

- Product Constitution and whitepaper conflict materially with the frozen narrative;
- implementation requires backend, database, auth or protocol changes;
- the prototype cannot be isolated from production exposure;
- the current branch contains unrelated uncommitted work;
- existing checks fail before the task and the failure cannot be shown to be pre-existing.

Do not proceed to login redesign, additional motion polish, deployment or production replacement until the Founder explicitly approves this narrative prototype.