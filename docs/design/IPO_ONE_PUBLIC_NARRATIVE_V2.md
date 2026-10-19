# IPO.ONE Public Narrative v2

Status: Founder-directed narrative reset for the interactive website prototype.  
Scope: public homepage and prototype copy only. No production deployment in this task.

## 1. Product truth

IPO.ONE is not primarily a “responsibility layer,” an Agent wallet, a payment product, a lending pool, or a generic AI-finance dashboard.

IPO.ONE is **credit and obligation infrastructure for people and autonomous Agents**.

The core user outcome is straightforward:

> A person or Agent can establish identity and authority, request capital, receive a clear offer, create an obligation, repay it, and carry verified performance into the next credit decision.

The product has five defining properties:

1. **Human and Agent access are both first-class.** Their interfaces and authority models differ, but they use the same underlying credit lifecycle.
2. **Verified performance builds portable credit.** Repayment, execution quality and Mandate compliance should improve future access and terms.
3. **Capital comes from external providers.** Banks, fintech lenders, private-credit facilities, Provider credit and compatible on-chain facilities retain control of capital, policy and terms.
4. **One obligation survives across rails.** Traditional and on-chain settlement are execution choices, not separate credit systems.
5. **Intelligence improves decisions but does not create authority.** Models may assess and recommend; lender-approved policy controls exposure and financial state.

This framing is derived from `docs/PRODUCT_CONSTITUTION.md`, `docs/WHITEPAPER.md` and the public `README.md`.

## 2. Messaging hierarchy

The homepage must communicate these ideas in this order:

1. **What the product does:** access capital and build credit.
2. **Who it is for:** people and autonomous Agents.
3. **What makes it different:** verified outcomes become reusable Credit State.
4. **How Agent credit works:** Principal, Agent Identity, Mandate, offer, bounded execution, repayment.
5. **How the network works:** external capital, one shared lifecycle, multiple rails.
6. **Why it is trustworthy:** clear authority, explainable decisions, evidence and reconciliation.
7. **How it is integrated:** Human interfaces, API, SDK, MCP and A2A.

Architecture should support the story, not lead it.

## 3. Homepage copy freeze

The following copy is the approved baseline for the next prototype. Minor grammatical edits are allowed only when required by the final layout. Meaning and hierarchy must not change without Founder review.

### Navigation

- Product
- How Agent Credit Works
- Credit Passport
- Developers
- Trust
- **Open IPO.ONE**

### Hero

**Eyebrow**

> THE CREDIT PROTOCOL FOR THE HUMAN–AGENT ECONOMY

**Headline**

> Access capital. Build credit from verified performance.

**Body**

> IPO.ONE lets people and autonomous Agents establish identity and authority, receive funding offers, create clear obligations, repay through approved rails, and carry their credit history forward.

**Primary CTA**

> Open IPO.ONE

**Secondary CTA**

> See Agent credit in action

**Supporting line**

> One credit system. Separate Human and Agent interfaces. External capital. Multiple rails.

**Brand signature**

> BORROW. BUILD. PROVE.

The brand signature is secondary. It must not replace the product explanation.

### Section 1 — Agent credit

**Heading**

> How Agent credit works

**Lead**

> An Agent can request and use capital only within a Mandate set by a verified Principal. Each request, offer, execution and repayment updates one auditable credit record.

**Interactive sequence**

1. Principal verified
2. Agent identity bound
3. Mandate defined
4. Credit requested
5. Offer accepted
6. Execution authorized
7. Repayment verified
8. Credit State improved

**Outcome line**

> The Agent does not receive unrestricted financial authority. It earns broader access through verified performance.

### Section 2 — Human and Agent access

**Heading**

> Two entry paths. One credit system.

**Lead**

> People use consent, disclosures and affordability checks. Agents use Principals, identities, Mandates and execution plans. Both use the same offers, obligations, repayment records and Credit State.

**Human path**

> Identity → Consent → Evidence → Request → Offer → Obligation → Repayment → Credit State

**Agent path**

> Principal → Agent Identity → Mandate → Execution Plan → Offer → Authorization → Obligation → Repayment → Credit State

### Section 3 — Credit progression

**Heading**

> Better performance should lead to better access.

**Lead**

> Verified repayment and execution become permissioned Credit State. Capital providers can use that history to offer more capacity, longer terms or better pricing.

**Credit Passport line**

> A Credit Passport shares only the evidence required for a specific decision. It is not a public profile or a universal score.

### Section 4 — Product use cases

**Heading**

> Productive credit for people and Agents.

**Use cases**

- Agent working capital for approved compute, data, APIs and software.
- Controlled strategy capital with defined venue, amount, duration and risk limits.
- Human productive credit for equipment, inventory and working capital.
- Provider or vendor credit for machine-to-machine services.

The prototype should show one concrete Agent scenario first. It may allow the user to switch to a Human scenario.

### Section 5 — Capital providers

**Heading**

> Capital providers keep control.

**Lead**

> Banks, fintech lenders, private credit and compatible on-chain facilities set their own policy and terms. IPO.ONE standardizes requests, routes offers, records obligations and reconciles outcomes.

**Supporting line**

> IPO.ONE coordinates the credit lifecycle. It does not need to become the balance-sheet lender.

### Section 6 — Rails

**Heading**

> One obligation across approved rails.

**Lead**

> Funding and repayment can move through traditional, on-chain or hybrid rails without changing the meaning of the obligation or the Credit State built from it.

### Section 7 — Developers

**Heading**

> Built into applications, platforms and Agents.

**Lead**

> Human interfaces, APIs, SDKs, MCP and A2A all use the same credit objects and lifecycle.

**CTA**

> Explore the developer interface

### Section 8 — Authority and trust

**Heading**

> Intelligence can recommend. Policy decides.

**Lead**

> Models may assess risk and suggest terms. Only lender-approved policy can authorize exposure or change financial state.

**Trust line**

> Every offer, authorization, obligation, settlement event and correction remains traceable.

### Closing

**Headline**

> Borrow. Build. Prove.

**Body**

> Complete an obligation. Add verified performance. Improve the next capital decision.

**CTA**

> Open IPO.ONE

## 4. Language rules

Public copy must be natural, concise and professional.

Use plain language first. Product terminology may be introduced only when it clarifies a real object or control.

### Use

- access capital
- funding offer
- clear obligation
- verified repayment
- approved rail
- credit history
- Credit State
- Credit Passport
- Principal
- Mandate
- capital provider

### Avoid on the marketing surface

- “Responsibility is the missing layer” as the main headline
- “Proof in Motion” as customer-facing language
- “Earn the next decision”
- repeated use of canonical, deterministic, native, ontology, primitive or orchestration
- vague claims such as revolutionary, world-changing, frictionless, autonomous finance or infinite scale
- generic AI language that does not describe a product capability
- long chains of abstract nouns
- fake superlatives, fake market statistics, fake partners or fake production volume

“Payments move value. Credit records responsibility and performance.” may appear as a supporting explanation, not as the main product proposition.

## 5. Visual emphasis

The visual hierarchy must reinforce the messaging hierarchy:

- **Hero:** capital access and credit progression.
- **First interactive module:** the complete Agent credit lifecycle.
- **Second module:** Human and Agent paths converge into one shared credit system.
- **Third module:** Credit State improves after verified repayment.
- **Later modules:** capital providers, rails, developer access and trust.

Do not make protocol architecture, security diagnostics, RPC state, test status or implementation details the public homepage’s primary visual.

## 6. Acceptance test for the narrative

A first-time visitor should understand the following within 15 seconds:

1. IPO.ONE provides credit infrastructure, not only payments or wallets.
2. Both people and autonomous Agents can use it.
3. Users can access external capital and create explicit obligations.
4. Verified performance improves future credit access.
5. Agent authority is bounded by a verified Principal and Mandate.

If any of these points is unclear, the homepage narrative has failed.