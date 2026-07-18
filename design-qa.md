# IPO.ONE WEB-002 Design QA

## Sources

- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-f0c28b33-d0fa-4f80-aaa4-fbb1b692d795.png`
  - bright consumer entry hierarchy, large headline, lavender emphasis, pill actions;
- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-c4cf4044-ebd9-4830-917e-82f2ebce7541.png`
  - graphite professional workspace, large headline, left navigation, dense Borrow surface;
- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-b1ca4502-d5ee-4011-8436-9a17edd1c6c8.png`
  - dark market summary, large financial numerals, overlapping white data card and table.

## Implementation Captures

- `artifacts/ui/human-desktop-1440x1024.png`
- `artifacts/ui/agent-verified-1440x1024.png`
- `artifacts/ui/reference-vs-human-desktop.png`
- `artifacts/ui/reference-vs-agent-desktop.png`
- `artifacts/ui/chrome-human-tablet-834x1194.jpg`
- `artifacts/ui/chrome-human-phone-390x844.jpg`
- `artifacts/ui/chrome-human-narrow-360x732.jpg`
- `artifacts/ui/chrome-agent-phone-390x844.jpg`
- `artifacts/ui/chrome-agent-complete-phone-390x844.jpg`
- `artifacts/ui/web002-human-private-disconnected.png`
- `artifacts/ui/web002-human-offer-desktop.png`
- `artifacts/ui/web002-human-workbench-mobile-390.png`

Verified viewports/states: 1440x1024, 834x1194, 390x844, and 360x732;
Human readiness entry plus initial and completed Agent no-funds lifecycle.
Completed Agent evidence at 390x844 reads `6 of 6 complete`, `Balanced`,
`Verified v5`, 63 Evidence envelopes, and zero outstanding principal.

## Comparison

Full-view comparison: `reference-vs-human-desktop.png` places the Aave market
summary/data-table reference beside the IPO.ONE Human surface. The build matches
the reference hierarchy through the graphite header, lavender active language,
overlapping white capability card, compact status rows, and spacious canvas.

Focused comparison: `reference-vs-agent-desktop.png` places the Aave Pro dark
workspace reference beside the completed IPO.ONE Agent portfolio. The build
matches the large proposition, high-contrast primary action, professional left
rail, and dense operational panel while preserving IPO.ONE obligation semantics.

## Findings and Iteration History

- P1 fixed: the Agent lifecycle cards initially rendered behind the graphite
  portfolio header. The data-card layer now has an explicit stacking context and
  visibly overlaps the header like the approved reference.
- P1 fixed: the Human `Review readiness` link originally collided with hash
  routing. It is now a semantic button that scrolls to and focuses the readiness
  table without changing product mode.
- P2 fixed: top-level labels now say Human, Agent, Portfolio, Borrow & Credit,
  Payments, Evidence, Risk Operations, and Agent API instead of presenting an
  internal control-plane-first taxonomy.
- Desktop overflow check passed at 1440x1024 (`scrollWidth === innerWidth`).
- Tablet/mobile overflow checks passed at 834, 390, and 360 CSS pixels
  (`scrollWidth === clientWidth`) in Chrome with device pixel ratio 1.
- Mobile navigation opens with the sidebar visible and the main shell inert;
  focus moves to the close control. Escape closes it, restores focus to the
  menu trigger, sets `aria-expanded=false`, and makes the sidebar inert again.
- The 390px Agent UI completed the six-stage public no-funds lifecycle without
  browser warnings/errors and remained horizontally bounded after state
  changes and reload.
- P2 fixed: at 360px, the menu, Human/Agent selector, and primary Human actions
  now expose at least 44px control height instead of the prior 32px mode target.
- Human/Agent switching, the complete Agent lifecycle, API status, canonical
  portfolio values, and error/warning console inspection passed; no browser
  console warnings or errors were observed.
- Static accessibility and security checks passed: skip link, landmarks,
  `aria-current`, inert navigation, live regions, no `innerHTML`, same-origin
  runtime assets, and bounded sandbox disclosures.

## Authenticated Application Increment — 2026-07-15

- The in-app browser exercised the real loopback HTTP request envelope through
  `pilotCreateHumanSubject`, `pilotCreateConsent`, `pilotRequestCredit`, and
  `pilotEvaluateCreditApplication` against a canonical visual-QA Gateway
  fixture. The resulting UI displayed the returned `$120.00` principal, `9%`
  annual rate, maturity, Intent ID, approved status, and six reason codes.
- Validation and recovery passed: `$999` was rejected locally by the bounded
  no-funds form, no Consent was created, changing the amount to `$120` allowed
  the same session to continue through Offer.
- The Offer-acceptance control remained disabled after approval and explicitly
  named `CREDIT-001E`; no Obligation or funds state appeared.
- The disconnected public sandbox rendered `Private gateway unavailable` and
  kept all private mutations disabled. The authenticated loopback composition
  rendered `Private API online` only with a valid BFF-issued CSRF bootstrap and
  did not attempt the anonymous `/v1` demo.
- Current desktop implementation and the approved Aave market reference were
  inspected together. The dark summary header, overlapping white readiness
  card, restrained lavender state language, compact finance rows, and large
  Offer numeral remain visually aligned without copying Aave assets or market
  semantics.
- A same-origin 390x844 in-app-browser frame exercised the responsive Human
  workbench. The full Subject -> Consent -> Intent -> Decision -> Offer flow
  completed, `scrollWidth === clientWidth === 390`, the Offer read `$120.00`,
  and the acceptance control remained disabled.
- P2 fixed: the long canonical Intent ID previously wrapped into a stray final
  character in the dark Offer card. It now truncates visually with the complete
  ID preserved in the accessible title.
- `pnpm run check`: 203/203 passed.
- `pnpm run test:transport`: 7/7 passed.
- `pnpm run test:security`: 21/21 passed.

## Principal-Controlled Agent Authority Increment — 2026-07-15

- The authenticated Human Principal workbench now exercises
  `pilotCreateAgentSubject`, `pilotCreateDraftMandate`, `pilotReadMandate`, and
  `pilotActivateSandboxMandate` through the same same-origin CSRF-protected
  Tenant envelope as the Human application.
- The pending-state path passed: creating an Agent Subject returned `pending`;
  drafting returned the exact server Mandate and terms hashes; the Principal
  acknowledgement and activation controls remained disabled, with the missing
  account-binding activation gate explained in the interface.
- The provisioned-active path passed: an exact active Agent Subject produced a
  draft with fixed `request_credit`, `accept_credit_offer`, and
  `execute_sandbox_credit` capabilities; the Human Principal acknowledged the
  immutable server hashes; activation returned `active` and an Evidence hash.
- The browser never accepted Tenant, actor, role, capability, Mandate hash, or
  terms hash as editable authority fields. It generated no Agent credential and
  exposed no raw account proof, key, signature, or real-value action.
- The Aave market-workspace reference and the completed IPO.ONE authority panel
  were inspected together in one same-size comparison. IPO.ONE preserves the
  selected dark navigation, white dense work surface, restrained lavender
  states, compact finance rows, and dark review console while keeping its own
  identity/obligation semantics.
- The same-origin 390x844 frame rendered the new workbench as a single-column
  flow with the existing 44px mobile targets and no clipped primary entry
  actions. Semantic snapshot inspection confirmed the full Subject -> Draft ->
  exact review -> Activation structure and disabled-state announcements.
- `IDENTITY-001` now records the intentionally unimplemented durable CAIP-10
  proof and pending-to-active Subject transition required for newly created
  Agents. Drawing the UI did not broaden that permission.

## Principal-to-Agent MCP Handoff Increment — 2026-07-15

Source visual truth:
`/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-b1ca4502-d5ee-4011-8436-9a17edd1c6c8.png`.
Implementation capture: `/private/tmp/ipo-one-agent-authority.png` at 1280x720,
authenticated private-host state with one active sandbox Mandate. The local
`/visual-compare` QA route placed both images in one normalized comparison view.

- The complete interaction path passed: waiting Agent API -> Principal setup ->
  exact active Subject -> Draft Mandate -> hash acknowledgement -> Activation ->
  `Open Agent API handoff` -> copy packet. The copied state exposed the four
  approved tool/operation pairs and announced that the packet was copied
  without credentials.
- The ready packet contains Subject/Mandate identifiers, immutable hashes,
  bounded authority, protocol version, and tool metadata. It explicitly states
  `nonAuthorizing`, `out_of_band`, no included credentials, no public/remote MCP,
  and no funds authority. The waiting packet omits owned identifiers and keeps
  its copy action disabled.
- P2 fixed: the Principal Mandate capability chips and Developer runtime
  capability list previously shared `.capability-list`, allowing the later flex
  rule to change the Developer list layout. The Mandate chips now use the
  dedicated `.mandate-capability-list`; the post-fix Agent API capture shows the
  original scan-first Developer list restored.
- Fonts and typography: the existing sans/serif/monospace hierarchy remains
  intact; code, tool names, operation IDs, labels, and status weights remain
  readable without replacing the selected type system.
- Spacing and layout rhythm: the six-part graphite runtime band, two-column
  handoff/tool grid, dark code surface, compact tool rows, and bounded status
  cards match the approved Aave density and alignment language. No primary
  control is clipped at desktop.
- Colors and tokens: graphite, white, lavender, green ready states, muted
  waiting states, borders, radii, and shadows reuse the existing product tokens;
  no new decorative palette or gradient was introduced.
- Image and asset fidelity: the page uses the existing IPO.ONE icon sprite and
  supplied product visual language. No placeholder art, emoji, handcrafted SVG,
  or copied Aave asset was added.
- Copy and content: public OpenAPI/SDK, private Tenant protocol, local stdio MCP,
  out-of-band authentication, remote-disabled, and funds-none boundaries are
  named independently, removing the prior risk that the public SDK looked like
  the private Agent entry.
- The 390x844 same-origin frame rendered Agent Runtime, Public OpenAPI, and the
  six runtime facts as one bounded column with no clipped headline or primary
  action. Semantic inspection confirmed the full waiting packet, four tools,
  transport boundary, SDK, capabilities, and request-log regions remain present
  below the fold.
- Full-view and focused comparison found no remaining actionable P0/P1/P2
  mismatch. The implementation intentionally maps the Aave market table into an
  authority/tool workspace rather than copying token-market content.

## Responsive Runner Note

The in-app browser still mis-scaled a 390x844 screenshot and ignored the
override in a fresh tab. The verification was therefore repeated through the
already-installed Chrome browser capability, without downloading or installing
automation software. Chrome reported the exact requested CSS viewport for each
capture and produced dimensionally consistent screenshots.

Final result: passed.

## Commercial Account and Network Onboarding — 2026-07-17

- The global Access action now opens one two-step onboarding surface from both
  Human and Agent workspaces: choose an approved account method, then connect an
  approved test network. Authentication, Principal authority, Mandate authority,
  and funds authority are stated as separate decisions throughout the flow.
- Google and passwordless-email entry points are driven only by same-origin
  server discovery. The public sandbox and any runtime without an approved IdP
  display them as unavailable instead of simulating a successful login.
- Wallet onboarding uses the injected EIP-1193 provider for account request,
  exact chain switch/add, and—only when the server enables it—a one-use SIWE
  challenge. It requests no transaction, token approval, balance read, or fee.
- Base Sepolia (`eip155:84532`) and X Layer Testnet (`eip155:1952`) reuse the
  existing multi-chain adapter boundary and remain synthetic-only. Mainnet and
  arbitrary RPC metadata are absent.
- Desktop inspection at 1440px and mobile inspection at 390px both reported
  `scrollWidth === clientWidth`; the dialog, header, action grid, and network
  controls had zero horizontal overflow. Focus enters the dialog, Escape and
  close controls restore it to Access, and the application is inert only while
  the dialog is open.
- Browser inspection returned zero warnings or errors. With no injected wallet,
  the primary network action returned explicit install/open-wallet guidance and
  left network and authority state unchanged.
- Visual language reuses the established IPO.ONE/Aave-informed graphite,
  lavender, white-panel, rounded-card, and high-contrast focus system. No copied
  Aave asset, fake logo, remote script, external font, placeholder, emoji, or
  new decorative system was introduced.
- Release-gate evidence: `pnpm run check` 332/332; security 23/23; authenticated
  transport 39/39; PostgreSQL 63/63; Provider sandbox 5/5; chain conformance 6/6;
  reorg 5/5; live-chain unit 9/9; production dependency audit reports no known
  vulnerabilities; `git diff --check` passes.

Final result: passed.

## WEB-011 Guided commercial Human experience — 2026-07-17

Reference sources:

- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-c4cf4044-ebd9-4830-917e-82f2ebce7541.png`
- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-b1ca4502-d5ee-4011-8436-9a17edd1c6c8.png`

Implementation evidence:

- `artifacts/ux-audit/WEB_011/guided-human-top-desktop.png`
- `artifacts/ux-audit/WEB_011/guided-current-obligation-desktop.png`
- `artifacts/ux-audit/WEB_011/guided-new-request-desktop.png`
- `artifacts/ux-audit/WEB_011/guided-human-top-mobile.png`
- `artifacts/ux-audit/WEB_011/guided-human-guide-mobile.png`
- `artifacts/ux-audit/WEB_011/aave-vs-guided-human-comparison.png`

- Browser state passed: the authenticated restored Obligation renders `Step 4
  of 5`, `Activate your sandbox credit plan`, and the single primary next action
  `Review activation`; the blank application and Offer are not the landing
  content.
- Interaction passed: `Review activation` focuses the current Obligation;
  `Start another request` reveals the application and Offer while preserving
  the current position; `Return to current credit` restores the guided current
  state. Progressive journey guidance opens on demand.
- Responsive checks passed at 1440×1000 and 390×844 with zero page-level
  horizontal overflow. Mobile keeps the two primary choices and all five
  lifecycle stages readable and fully bounded.
- Combined visual inspection passed. Relative to the approved Aave references,
  the implementation preserves the strong graphite proposition, lavender
  emphasis, scan-first actions, white operational surfaces, finance-style
  information density, radii, and spacing without copying Aave branding or
  market content.
- The guide adds no authority. It presents existing authenticated server truth,
  calls only existing operations or focus targets, preserves acknowledgement
  gates, and introduces no real funds, credentials, PII, scoring, or production
  permissions.

final result: passed

## WEB-012 Guided commercial Agent integration — 2026-07-17

Reference source:
`/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-c4cf4044-ebd9-4830-917e-82f2ebce7541.png`.

Implementation evidence:

- `artifacts/ux-audit/WEB_012/04-guided-agent-api-desktop.png`
- `artifacts/ux-audit/WEB_012/05-principal-setup-focused.png`
- `artifacts/ux-audit/WEB_012/06-agent-protocol-details.png`
- `artifacts/ux-audit/WEB_012/07-agent-workspace-desktop.png`
- `artifacts/ux-audit/WEB_012/08-agent-api-mobile.png`
- `artifacts/ux-audit/WEB_012/09-agent-guide-mobile.png`
- `artifacts/ux-audit/WEB_012/aave-vs-guided-agent-comparison.png`

- Waiting-state browser truth now leads with `Authorize this Agent`, `Step 1 of
  4`, one primary action, and a short Principal/Agent responsibility model.
- The former raw-packet-first entry is retained as progressive technical detail;
  the packet, exact MCP registry, SDK, and request log remain reachable without
  dominating first use.
- Principal handoff passed: the Human view opens the authority disclosure,
  focuses `agentAuthority`, and positions the target below the sticky header.
- Responsive checks passed at 1440×1000 and 390×844 with zero page-level
  horizontal overflow, fully bounded primary controls, and four readable
  integration stages.
- Combined inspection against the Aave Pro reference found no actionable
  P0/P1/P2 visual mismatch. Graphite proposition hierarchy, lavender emphasis,
  white operational card, clear primary/secondary actions, compact status data,
  radii, and spacing remain aligned without copying Aave assets or branding.
- The UI adds no authority or execution. All readiness derives from the exact
  Subject, AccountBinding, Mandate, handoff, and closed capability manifest;
  credentials, remote MCP, real funds, browser-executed Agent workflows, and
  fabricated receipts remain absent.

final result: passed

## PILOT-006 Privacy-safe Feedback — 2026-07-17

Source visual truth:
`/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-c4cf4044-ebd9-4830-917e-82f2ebce7541.png`.

Implementation evidence:

- `artifacts/design-qa/pilot-006-human-desktop.png`
- `artifacts/design-qa/pilot-006-risk-desktop.png`
- `artifacts/design-qa/pilot-006-aave-risk-comparison.png`

- The combined reference/prototype input preserves the Aave-inspired hierarchy:
  dark navigation, compact product header, high-contrast dark protocol hero,
  lavender emphasis, bounded white data cards and dense operational tables.
- Human feedback uses the existing IPO.ONE shell and tokens. Five labeled
  categorical controls, one dominant submit action, privacy copy and no comment
  field remain legible without creating a parallel design system.
- Risk feedback is subordinate to verified portfolio and lifecycle truth, not
  a vanity dashboard. It returns aggregate counts only and visibly names the
  PII, identifier, analytics and underwriting boundaries.
- At 1440x1000 the Human form and Risk workspace have no clipped primary action
  or horizontal overflow. At 390x844 the form bounds are 32px to 358px inside a
  390px viewport and `scrollWidth === viewportWidth === 390`.
- The live browser exposed a same-resource concurrent-read conflict. The UI now
  sequences authenticated portfolio, lifecycle and feedback reads; the retest
  shows `Signals verified`, Human/Agent `1 / 0`, completed `1`, blocked `0`.
- Product console inspection returned no warning or error entries. External
  Codex browser telemetry timeouts were outside the IPO.ONE origin and did not
  affect product requests.

Final repository gate: 327/327; schemas 46; OpenAPI 21/21; migrations 24
ordered pairs; Tenant protocol 38 operations; PostgreSQL integration 63/63.

Final result: passed.

## SERVICING-002B private Servicing Operations queue — 2026-07-17

Design source remains the user-approved Aave references listed at the top of
this file. The implementation reuses IPO.ONE's graphite summary band, white
overlapping operational card, lavender accents, dense financial hierarchy,
existing radii/shadows and established sans/monospace typography.

- The authenticated Risk Operations surface now contains a separate private
  queue panel with a plain-language title, exact queue-resource input, closed
  stage filter, load/next-page controls, visible/critical/past-due/verified
  metrics and a five-column case table.
- Responsive CSS converts each queue row into a bounded labeled card at 390px;
  the desktop table header is removed only at the mobile breakpoint. Loading,
  empty, unavailable, denied, filtered and pagination copy is present in the
  static source.
- Defaulted and DPD stages use text plus restrained severity tokens; color is
  not the sole carrier. Monetary values remain exact minor-unit-derived display
  values. IDs use the existing copy-safe monospace treatment.
- The panel contains no assign, acknowledge, resolve, restructure, repurchase,
  write-off, collection, withdrawal or funds action. The visible boundary says
  private, synthetic, PII-free, read-only and no real funds.
- Legacy DEMO risk/admin state remains hidden from the authenticated product
  surface. The queue reads only the closed `pilotReadServicingQueue` result and
  cannot derive lifecycle truth in the browser.
- Static UI regression and the complete repository gate pass: 306/306 tests,
  46 schemas, 21 OpenAPI operations, 23 migration pairs, 34 private Tenant
  operations and eleven Agent MCP tools.

Desktop/mobile interaction capture is intentionally pending. The current
execution environment rejects the local QA Host at `listen(127.0.0.1)` with
`EPERM`; therefore overflow, focus/live-region and console inspection for this
increment are not claimed as passed. They remain a release-gate retest in the
SERVICING-002B audit.

Current result: implementation accepted by static/product gates; visual runtime
verification pending environment recovery.

## SERVICING-002A owned Obligation hydration — 2026-07-17

Source visual truth:

- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-b1ca4502-d5ee-4011-8436-9a17edd1c6c8.png`
  — Aave Core dark product summary, overlapping white financial surface,
  compact status metrics and restrained action treatment.

Implementation evidence:

- `artifacts/product-design-audit/2026-07-17-owned-obligation-hydration/desktop-servicing-case.png`
- `artifacts/product-design-audit/2026-07-17-owned-obligation-hydration/mobile-servicing-case-390.png`
- `artifacts/product-design-audit/2026-07-17-owned-obligation-hydration/aave-ipo-one-comparison.png`
- `artifacts/product-design-audit/2026-07-17-owned-obligation-hydration/reference-aave-dashboard.png`

Verified state: exact Human-owned `obligation.v2`, signed sandbox execution,
page reload, server-authoritative recovery, repayment after reload, returned
`Cured` servicing action, Payments reload and clean-tab exact-ID recovery.

- The Aave reference and IPO.ONE implementation were inspected in one combined
  comparison input. IPO.ONE preserves the graphite frame, white high-trust
  financial workspace, lavender state accent, strong financial numerals,
  compact metadata rows, pill controls and scan-first hierarchy while retaining
  its own Obligation and servicing semantics.
- Desktop hierarchy and content density passed with the new exact-ID restore
  strip integrated into the existing Servicing Case rather than introduced as
  a separate technical screen.
- At 390x844, `body.scrollWidth === documentElement.scrollWidth === innerWidth
  === 390`; the case measured 358px wide and both restore and repayment actions
  measured 44px high. The restore strip, identity metadata, key metrics and case
  progression remain in one readable column.
- Core interaction passed twice: automatic restoration from the opaque
  session-only ID after reload, and manual restoration from an exact ID in a
  clean tab. No cached Obligation snapshot was used as presentation authority.
- P1 fixed during visual QA: the Servicing Case presentation originally
  expected internal `actorHash` and schedule-hash fields that the closed Tenant
  transport intentionally omits. It now validates the approved servicing-action
  summary against the exact Obligation, lifecycle, balances, sequence, policy
  and trusted time without broadening the response.
- P2 fixed: the browser QA servicing-action and repayment hash fixtures were
  normalized to the canonical 32-byte hex shape so the final flow exercises the
  same closed validation as production code.
- Browser console inspection returned zero application warning/error entries on
  desktop and mobile. The in-app responsive override reported the exact 390px
  CSS viewport after reset and re-application.
- Final repository gates: full check 301/301; PostgreSQL 61/61; security 21/21;
  transport 37/37; 46 schemas; 33 private Tenant operations; eleven local MCP
  tools; 23 migration pairs.

Final result: passed.

## WEB-010 Dual-native Servicing Case workspace — 2026-07-17

Source visual truth:

- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-b1ca4502-d5ee-4011-8436-9a17edd1c6c8.png`
- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-c4cf4044-ebd9-4830-917e-82f2ebce7541.png`

Implementation evidence:

- `artifacts/product-design-audit/2026-07-17-servicing-case/desktop-active.png`
- `artifacts/product-design-audit/2026-07-17-servicing-case/desktop-cured.png`
- `artifacts/product-design-audit/2026-07-17-servicing-case/mobile-cured-top.png`
- `artifacts/product-design-audit/2026-07-17-servicing-case/mobile-cured-case.png`
- `artifacts/product-design-audit/2026-07-17-servicing-case/mobile-cure-controls.png`
- `artifacts/product-design-audit/2026-07-17-servicing-case/mobile-cure-controls-bottom.png`

Verified state: authenticated private Human lifecycle, exact accepted and
executed `obligation.v2`, active Servicing Case, $60 synthetic repayment,
returned `Cured` classification, $60 outstanding, and five owner Evidence
events including `servicing_cured`.

- Visual hierarchy matches the chosen Aave Core direction: graphite product
  heading, large bounded white finance workspace, restrained lavender state,
  dense aligned metrics, exact schedule rows, and a primary action adjacent to
  case context. IPO.ONE retains its own servicing semantics and icon sprite.
- The same-input source/implementation comparison found no actionable P0/P1/P2
  mismatch after implementation. No copied Aave assets or new image assets were
  required.
- Human interaction passed Offer acceptance -> signed sandbox execution ->
  Payments -> repayment -> Cured -> owner Evidence. The action used the
  existing Tenant operation and workflow sequence; the UI claimed cure only
  from the exact returned action.
- Agent mode hid the Human case and displayed an authority-specific handoff to
  the existing Agent repayment and Evidence path.
- At 390px, `body.scrollWidth === documentElement.scrollWidth === innerWidth ===
  390`; the repayment button measured 44px high. Metrics, stage, inputs,
  schedule, Evidence link and safety boundaries remained inside one column.
- Browser console inspection returned zero application warning/error entries.
  External Browser-plugin telemetry warnings were not page diagnostics.
- Full Node 24.18.0 regression passed 296/296; security passed 21/21; transport
  passed 35/35; static/presentation tests passed 5/5.

Final result: passed.

## WEB-009 Decision Passport product UI — 2026-07-17

Source visual truth:

- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-b1ca4502-d5ee-4011-8436-9a17edd1c6c8.png` — primary Aave Core product hierarchy;
- `/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-c4cf4044-ebd9-4830-917e-82f2ebce7541.png` — secondary graphite Aave Pro hierarchy.

Implementation evidence:

- `artifacts/product-design-audit/2026-07-17-decision-passport/desktop-passport-collapsed-viewport.png`
- `artifacts/product-design-audit/2026-07-17-decision-passport/desktop-passport-viewport.png`
- `artifacts/product-design-audit/2026-07-17-decision-passport/mobile-passport-viewport.png`
- `artifacts/product-design-audit/2026-07-17-decision-passport/mobile-proof-viewport.png`
- `artifacts/product-design-audit/2026-07-17-decision-passport/comparison-full.png`
- `artifacts/product-design-audit/2026-07-17-decision-passport/comparison-focused.png`

Verified viewports/states: 1440x1100 collapsed and expanded proof; 390x844
collapsed passport and expanded machine proof; approved Offer before acceptance;
shared Obligation after exact acknowledgement and acceptance.

- The primary and secondary source screenshots and current implementation were
  inspected together in full-view and focused comparison inputs. IPO.ONE keeps
  the reference's graphite workspace, white high-trust product surface,
  restrained lavender state language, green verification cue, compact summary
  metrics, scan-first rows, and adjacent action while retaining its own credit
  Evidence and Obligation semantics.
- Typography reuses the existing sans and monospace hierarchy. Policy, reason
  codes, schema versions, hashes, source versions, and finality remain distinct
  without adding another font system.
- Spacing and color use the existing IPO.ONE graphite/white/lavender/green
  tokens, 10–14px card rhythm, compact finance rows, existing radii, and
  existing shadows. No new decorative gradient or palette was introduced.
- Assets and icons reuse the existing IPO.ONE icon sprite. No placeholder art,
  emoji, inline SVG, CSS drawing, or copied Aave asset was added.
- Copy separates Human explanation from canonical proof: six plain-language
  reasons preserve exact server order and reason codes; the native disclosure
  reveals policy, feature set, trusted time, five finalized sources, aggregate
  versions, Evidence/entity hashes, and the exact copy action.
- The core interaction passed in the in-app browser: Human Subject -> scoped
  Consent -> Credit Intent/Decision -> Passport review -> proof expand -> exact
  JSON copy -> Offer acknowledgement -> shared Obligation. Clipboard inspection
  returned `risk_decision_passport.v1`, five source Evidence entries,
  `sandboxOnly=true`, `nonAuthorizing=true`, and
  `productionAuthority=false`, with no credential/funds authority.
- P2 fixed: the first 390px proof used a compressed four-column table that
  truncated source meaning. It now renders labelled Source, Version, Finality,
  and Proof groups with complete source labels and compact dual hashes.
- Desktop and mobile both reported `scrollWidth === innerWidth`; browser
  warning/error diagnostics were empty. The mobile Passport is 268px wide and
  the proof is 266px wide inside the existing 390px authenticated shell.
- No remaining actionable P0/P1/P2 visual or interaction finding was observed.
  The implementation intentionally uses a transaction rail rather than cloning
  Aave's asset table because the reviewed object is one exact decision and Offer.
- Regression evidence: `pnpm run check` 293/293; 46 schemas; 23 migration pairs;
  32 private operations; security 21/21; transport 35/35; `git diff --check`
  passed.

This increment adds no policy, feature, Evidence source, score, route, operation,
MCP tool, SDK permission, rate, cap, production identity, deployment, or funds.

final result: passed

## WEB-008 Private Risk Operations control plane — 2026-07-17

Source visual truth:
`/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-c4cf4044-ebd9-4830-917e-82f2ebce7541.png`.

Implementation evidence:

- `artifacts/product-design-audit/2026-07-17-risk-operations/risk-operations-desktop-loaded.png`
- `artifacts/product-design-audit/2026-07-17-risk-operations/risk-operations-desktop-frozen.png`
- `artifacts/product-design-audit/2026-07-17-risk-operations/risk-operations-mobile-viewport.png`

- The approved Aave Pro reference and the loaded IPO.ONE implementation were
  inspected together in one comparison input. The existing graphite sidebar,
  dark proposition header, lavender emphasis, white operational canvas, large
  financial numerals, compact posture cards, and dense table remain aligned
  without copying Aave assets or token-market semantics.
- The core journey is functional: one exact portfolio read renders authoritative
  aggregate exposure; one exact Agent Subject plus approved reason and explicit
  acknowledgement executes the existing protective freeze and refreshes the
  posture.
- Human Borrower access fails closed with a shared access/unavailable message,
  zero exposure, and no resource enumeration. Authenticated private mode hides
  the legacy DEMO reset, Admin Dashboard, fixtures, and object inspector.
- At 390x844, `scrollWidth === innerWidth === 390`; forms, metrics, posture
  cards, and asset rows stack within the 358px private surface, with 326px
  primary controls and no clipped action.
- In-app Browser diagnostics were empty. The runner's earlier full-page mobile
  artifact is not used as visual truth; the exact 390x844 viewport capture is.
- Repository evidence: Node 24.18.0, full check 276/276, fresh PostgreSQL 17
  55/55, security 21/21, transport 35/35, Provider 5/5, 41 schemas, 21
  migrations, 32 private operations, and ten Agent MCP tools.

This design increment adds no new protocol authority, real funds, unfreeze,
limit increase, remote transport, production identity, or deployment.

final result: passed

## WEB-006 Dual-native UI audit fixes — 2026-07-17

The current authenticated Human and Agent product was re-audited at 1440x1000
and 390x844 against the approved Aave Pro and market references. Human Subject,
Consent, Intent, deterministic Offer, exact acceptance, sandbox execution,
repayment, and four-event owned Evidence completed through the shared private
protocol. Agent Runtime displayed ten local MCP tools and three SDK workflows.

- P1 fixed: private Agent Workspace no longer calls the unsupported legacy
  `/v1/agents` demo route. It opens the Human Principal authority workbench and
  derives Agent status from the shared Subject, AccountBinding, and Mandate
  state.
- P2 fixed: legacy mock-wallet controls are hidden while the private Gateway is
  active; the legacy public demo path remains available when private transport
  is absent.
- P2 fixed: owned Evidence metadata uses larger, lighter secondary text on the
  graphite panel, and the semantic `hidden` attribute can no longer be
  overridden by author display rules.
- Human and Agent 390px views both reported zero horizontal overflow.
- Detailed journey and accessibility evidence is recorded in
  `docs/codex/audits/WEB_006_DUAL_NATIVE_UI_AUDIT/audit.md`.
- Final comparison files:
  `16-aave-pro-vs-agent-final.png` and
  `17-aave-market-vs-human-evidence-final.png` under
  `artifacts/product-design-audit/2026-07-17-human-agent-ui/`.

This current-run audit does not claim full WCAG conformance and does not enable
real funds, credentials, remote MCP, deployment, or new protocol authority.

## WEB-007 Private shared-kernel navigation — 2026-07-17

- Fixed the authenticated navigation split that sent Human users into empty
  Agent demo state on Portfolio, Borrow & Credit, Payments, and Evidence.
- Human and Agent now remain explicit parallel modes over the same current
  Subject, Mandate, Offer, Obligation, schedule, servicing, and Evidence state.
- Human and Agent primary actions route to the canonical application or
  Principal authority workbench; no legacy demo mutation is used.
- Desktop checks passed at 1440x1000. Human and Agent mobile Portfolio checks
  passed at 390x844 with zero horizontal overflow and working mobile navigation.
- Browser diagnostics were empty after the complete navigation and action
  journey.
- Current-run evidence and limitations are recorded in
  `docs/codex/audits/WEB_007_PRIVATE_SHARED_KERNEL_NAVIGATION/audit.md`.
- Historical demo behavior is now explicitly subordinate to Product Charter
  v1.1 and approved commercialization requirements; retained demo fixtures are
  test infrastructure, not authenticated product truth.
- The authenticated Payments surface now reports the verified signed Provider
  sandbox capability as a formal status grid. It does not claim a Provider
  action on the current Obligation and keeps public/remote Provider access,
  funds and withdrawals visibly disabled.
- Provider status passed current-run Aave-reference comparison, Human and Agent
  semantic navigation, 1440x1000 desktop review, and 390x844 mobile review with
  zero horizontal overflow and no browser diagnostics. Evidence is under
  `artifacts/product-design-audit/2026-07-17-provider-sandbox/`.

## WEB-004 Private Auditor Evidence Console — 2026-07-16

Source visual truth:
`/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-b1ca4502-d5ee-4011-8436-9a17edd1c6c8.png`.

Implementation evidence:

- `artifacts/design-qa/web-004-auditor-evidence-desktop-1440x1024.png`
- `artifacts/design-qa/web-004-auditor-evidence-desktop-1664x1024.png`
- `artifacts/design-qa/web-004-auditor-evidence-mobile-390x844.png`

The approved Aave market reference and the authenticated IPO.ONE Auditor
workspace were inspected together in one comparison input. The implementation
preserves the reference hierarchy through a graphite instance summary, three
high-signal metrics, an overlapping white operational card, compact filter
controls, and a dense five-column table. It replaces market/token semantics
with the canonical Obligation, aggregate version, source finality, timestamps,
and Evidence hash rather than copying Aave assets.

- Desktop interaction passed: an exact Obligation query returned four events,
  cursor pagination appended two more without duplicates, the Load more control
  disappeared at the terminal page, and copied hash bytes matched the selected
  Evidence row.
- The private console rendered only with a valid same-origin CSRF bootstrap.
  The public sandbox retained the markup in a hidden state, exposed no visible
  private-console semantics, and kept the page width bounded.
- The denied-resource fixture showed one shared `Auditor access is required or
  the Obligation is unavailable` message with zero returned events. It did not
  distinguish authorization from resource existence.
- At 390x844, the desktop table became stacked labeled rows (`88px + flexible`
  cells), all primary controls remained at least 44px high, pagination reached
  six rows, and `scrollWidth === clientWidth === 390`.
- Typography, graphite/white/lavender tokens, radii, borders, and shadows reuse
  the existing IPO.ONE design system. The existing same-origin icon sprite
  supplies shield, file, and copy icons; no placeholder, emoji, CSS drawing,
  handcrafted SVG, or copied Aave asset was added.
- In-app Browser console inspection returned zero warnings or errors. No
  actionable P0/P1/P2 visual mismatch remains for this scoped workspace.
- Repository verification: Node 24.18.0; `pnpm run check` 242/242;
  `pnpm run test:transport` 22/22; `pnpm run test:security` 21/21;
  `git diff --check` passed.

Final result: passed.

## IDENTITY-001 CAIP-10 Account Proof — 2026-07-16

Source visual truth:
`/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-c4cf4044-ebd9-4830-917e-82f2ebce7541.png`.

Implementation evidence:

- `artifacts/design-qa/identity-001-account-proof-workbench-2048x1024.png`
- `artifacts/design-qa/identity-001-human-mobile-390x844.png`
- `artifacts/design-qa/identity-001-aave-comparison.png`

Viewport and state: 2048x1024 desktop Human Pilot with the Principal-controlled
Agent workbench focused, plus the anonymous-safe 390x844 Human entry state. The
private gateway was intentionally unavailable in this visual run, so identity
mutations remained disabled; command behavior is covered by the authenticated
Gateway and PostgreSQL suites.

Full-view comparison evidence: the normalized same-input comparison preserves
the selected Aave Pro visual language through the graphite navigation and
review surface, white operational canvas, compact finance-style rows,
restrained lavender emphasis, small uppercase labels, and dense but bounded
control layout. IPO.ONE intentionally replaces market/token content with
Subject, CAIP-10 proof, Mandate, and Evidence semantics.

Focused-region comparison evidence: the desktop workbench capture verifies the
complete Subject -> one-use EIP-712 request -> hash-only AccountBinding ->
bounded Mandate review sequence. It shows Base Sepolia and X Layer selection,
account and purpose inputs, signing-request/copy/refresh actions, three-state
proof feedback, a collapsible payload preview, and the dark immutable review
console without placeholder art or copied Aave assets.

Required fidelity surfaces:

- Fonts and typography: the existing sans/serif/monospace hierarchy remains
  consistent. Step labels, field labels, hashes, controls, and explanatory copy
  stay readable at desktop and 390px without clipped headings or broken wraps.
- Spacing and layout rhythm: the proof card nests under its numbered step, uses
  the same grid, radius, border, and button rhythm as the surrounding authority
  flow, and collapses to one column at mobile. Desktop and mobile both report
  page `scrollWidth === innerWidth`.
- Colors and visual tokens: graphite, white, lavender, muted disabled states,
  green environment status, and existing border/shadow tokens remain aligned
  with the approved references. No new decorative color system was introduced.
- Image quality and assets: the increment needs no raster illustration. It
  reuses the existing same-origin IPO.ONE icon sprite; no emoji, placeholder,
  CSS drawing, handcrafted SVG, or copied Aave image was added.
- Copy and content: the UI distinguishes the Human-created challenge from the
  Agent-submitted proof, names the five-minute one-use boundary, and states that
  raw account/signature data and credentials do not enter the Human handoff.
- States and interactions: Configure Agent authority scroll/focus passed;
  disabled anonymous-state controls are explicit; mobile navigation opened
  with the main shell inert and closed on Escape with focus/state restoration.
  Browser console inspection returned zero warnings or errors.

Comparison history: the first focused capture was taken before smooth scrolling
settled and showed the preceding Human application panel. After waiting for the
explicit focus transition, the second capture showed the complete identity
workbench at the same viewport. No actionable P0/P1/P2 visual mismatch remained.

Follow-up polish: an authenticated visual fixture can later capture populated
challenge hashes and the verified green binding state; this is P3 evidence
coverage, not a blocker to the current empty/disabled design state.

Final result: passed.

## Agent Handoff Contract Hardening — 2026-07-15

- The previously presentation-owned packet is now the closed
  `agent_handoff_manifest.v1` machine contract. Waiting and ready states share
  one JSON Schema; waiting remains non-copyable while eligible draft and active
  Mandates expose their phase-specific packets.
- The browser constructor is a standalone same-origin ES module served by both
  the public sandbox host and the authenticated loopback host. Invalid Mandate
  state, production authority, malformed hashes, unknown capabilities, or
  unbounded identifiers fail closed to no ready packet.
- Two valid and four adversarial fixtures cover waiting/ready, credential
  inclusion, remote MCP, funds authority, and Tenant injection. The browser
  tool sequence is compared exactly with the four-tool Agent MCP registry in
  both the contract gate and unit tests.
- The visible Agent API layout is unchanged except for exposing the canonical
  schema version below the packet. It reuses the existing code-panel typography,
  spacing, color, and responsive behavior; no new visual system or asset was
  introduced.
- This hardening adds integration confidence but no credential, endpoint,
  identity activation, Offer acceptance, execution, repayment, or funds
  authority.
- `pnpm run check`: 207/207 passed; schema checks: 32 contracts; handoff
  conformance: 2 valid + 4 invalid fixtures.
- `pnpm run test:transport`: 7/7 passed.
- `pnpm run test:security`: 21/21 passed.

## Agent Handoff Developer Preflight — 2026-07-15

- The machine path now continues beyond copy: a ready handoff can be passed by
  stdin to `pnpm run agent:handoff:plan`, producing a bounded
  `agent_handoff_call_plan.v1` with the first `ipo_one_read_self` JSON-RPC call.
- The preflight emits fresh request, correlation, and JSON-RPC IDs while
  omitting Mandate/terms hashes, capabilities, limits, Tenant/role fields, and
  all credential material.
- Waiting, unsafe, malformed, oversized, and duplicate-key documents fail with
  one stable redacted error. Direct MCP server execution still returns
  `agent_mcp_composition_required`, so the tool does not simulate a verified
  Authentication Context or imply a runnable production Host.
- This is a developer-experience and contract increment. It changes no visible
  page layout, styling, assets, responsive behavior, or business permission.
- A reusable Host factory now accepts only the already authenticated Agent
  client and ready manifest, pins Subject-scoped tools to the exact handoff
  Subject, and exposes the existing JSON-RPC/stdio runtime. PostgreSQL
  integration proves the generated first call returns the durable Subject plus
  active Mandate and writes authorization audit evidence.
- Current regression: `pnpm run check` 207/207,
  `pnpm run test:transport` 12/12, `pnpm run test:security` 21/21, and
  PostgreSQL integration 53/53.

## Agent Application Handoff to Durable Offer — 2026-07-15

- Contract review found that Credit Intent submission and deterministic
  evaluation require a draft Mandate, while Principal activation is explicitly
  post-application. The machine contract now represents that ordering instead
  of treating the active runtime packet as application authority.
- `agent_handoff_manifest.v1` has three closed states: waiting,
  `application_ready` with a draft Mandate, and `ready` with an active Mandate.
  Three valid and five adversarial fixtures cover the lifecycle and safety
  invariants.
- `runAgentCreditOfferWorkflow()` invokes exactly the existing four local MCP
  tools, derives the Mandate rather than accepting caller authority, validates
  every Tenant result, and returns an immutable no-funds receipt. Replay keeps
  the same Intent and Decision.
- An active runtime Host now returns `mcp_application_handoff_required` for a
  new Credit Intent. This prevents silent privilege/lifecycle widening and adds
  no tool, endpoint, credential, acceptance, execution, or funds authority.
- Clean PostgreSQL integration proves the authenticated Agent path persists one
  Intent, deterministic Decision and Offer, and records allow audit for all
  four operations. Human and Agent objects retain the same canonical shapes.
- The browser now renders the draft application phase separately from the active
  runtime phase. It does not reinterpret an active Mandate as application
  authority or permit a draft packet to activate the Mandate.
- Current regression: `pnpm run check` 208/208; schema checks 32 contracts;
  Tenant handoff conformance 3 valid + 5 invalid; transport 14/14; security
  21/21; PostgreSQL integration 53/53.

WEB-002 remains complete through the Human deterministic Offer UI and active
Principal-to-Agent runtime handoff. The Agent machine path is now additionally
verified through durable Offer, including the visible draft application
handoff. Newly created Agent Subject activation, Offer acceptance, shared
Obligation, execution, repayment, and servicing remain separate gates.

## Agent Application Handoff UI — 2026-07-15

Source visual truth:
`/var/folders/fp/44x1yt3x0679kmhw_qqhbcx40000gn/T/codex-clipboard-b1ca4502-d5ee-4011-8436-9a17edd1c6c8.png`.

Implementation evidence:

- `artifacts/ui/web002-agent-application-handoff-1440x1024.png`
- `artifacts/ui/web002-agent-application-handoff-mobile-390x844.png`
- `artifacts/ui/reference-vs-agent-application-handoff.png`
- `artifacts/ui/reference-vs-agent-application-handoff-focused.png`

Verified state: authenticated private Tenant shell, newly created pending Agent
Subject, exact server-returned draft Mandate, and the `application_ready`
Developer handoff open.

- Interaction passed: create Agent Subject -> create/read exact Draft Mandate ->
  `Open application handoff` -> copy `agent_handoff_manifest.v1`. The copied
  packet was `application_ready` with `authority.status=draft`, four exact
  TRANSPORT-001 tool pairs, `credentialsIncluded=false`, local stdio only,
  remote/public disabled, and `fundsAuthority=false`.
- State labeling passed: the Principal workbench shows `Application handoff` and
  `Draft Mandate · Decision & Offer`; Agent Runtime shows `Application ready`
  and `Draft application authority`. Active/runtime language is not used for the
  draft phase.
- Fonts: the existing sans and monospace hierarchy remains readable at desktop
  and mobile; code and operation IDs retain the selected product type system.
- Spacing and layout: the Aave-inspired summary band, white bounded panels,
  two-column desktop grid, and stacked 390px layout reuse the established shell
  rhythm. At 390x844, `scrollWidth === clientWidth === 390`; no headline,
  primary action, or copy control is clipped.
- Colors and tokens: graphite, white, lavender, green ready states, borders,
  radii, and shadows are all existing IPO.ONE tokens. No new decorative system
  was introduced.
- Assets and icons: the implementation reuses the existing IPO.ONE icon sprite.
  No placeholder, emoji, copied Aave asset, or hand-drawn replacement was added.
- Copy: phase, authority, local transport, out-of-band authentication, remote
  disabled, and funds-none boundaries are explicit. Offer acceptance and funds
  execution remain absent.
- Full-view and focused same-input comparisons found no actionable P0/P1/P2
  fidelity issue. Console inspection returned zero warnings or errors in the
  application-ready desktop and mobile states.

Final repository gate: `pnpm run check` 208/208;
schema checks 32 contracts; Tenant handoff conformance 3 valid + 5 invalid;
transport 14/14; security 21/21; PostgreSQL integration 53/53.

Final result: passed.

## Agent SDK Runtime Surface — 2026-07-15

- The Developer / Agent Runtime workspace now presents the durable
  `IpoOneAgentMcpClient` quick start rather than implying that the anonymous
  demo HTTP client is the reviewed Agent integration path.
- The existing Aave-inspired information hierarchy remains intact: dark
  protocol summary band, bounded white panels, paired desktop cards, and one
  stacked mobile column. No new visual token, asset, or icon system was added.
- Desktop browser inspection at 1280px showed the full handoff, MCP registry,
  SDK code, workflow guarantees, and request log without clipping or
  page-level overflow.
- At 390x844, `scrollWidth === clientWidth === 390`; the SDK code block uses
  `overflow-x: auto` inside its card (`326px` client width, `412px` content)
  without widening the page. The workflow guarantee card and telemetry remain
  readable in the stacked layout.
- Browser console inspection returned no warning or error entries. Static UI
  and handoff tests passed 7/7.
- Final repository evidence: full check 213/213; transport 18/18; security
  21/21; PostgreSQL 53/53; schema count 33.

Final result: passed.
