# B1 — Six-language core journey

2026-11-07 · Founder approved in the current conversation after A2/B0 review.

Target: local implementation and visible local verification, followed by a
reviewable candidate. No deployment is included in this iteration.
Authority: current workspace Constitution v2.0, authorization register v1.0,
engineering standard v1.1; PRD section 5.2 and Jarvis v1.1 R02/AT09.
Application source starts at published b01782f, retaining WEB-027 Precision
Terminal. Existing root-workspace changes are preserved in place. Current
governance files are copied into this isolated candidate for correct routing.

Scope: English, Chinese, Spanish, French, Russian and Vietnamese for the
existing Human login, application/Offer review and confirmation, repayment,
history, Evidence, credit record, shared navigation and blocking/recovery copy.
Public navigation, headline and login are included. The illustrative marketing
animation, longer editorial sections and non-Human operator workspaces retain
their English source, explicitly marked `lang=en`; they are not B1 completion
claims. The animation is not an operable credit workflow or a user record.
Use local dictionaries and presentation-only locale preference. Do not alter
server identities, authorization, terms, numeric inputs, currencies, hashes,
requests, receipts, accounting or canonical records. No external translation
service, dependency, credential, financial activation or production change.

Implementation: focused pure localization/catalog modules plus a small legacy
DOM presentation adapter. Match only owned source copy; never translate raw
record values, code, inputs, IDs or receipts. Dynamic templates preserve bound
values. Raw provider diagnostics remain separately identified; blocking errors
have localized actionable summaries. Locale changes do not replay requests.

Acceptance: complete selected Human journey in every language; dictionaries
have matching keys/placeholders and missing copy blocks six-language release;
switch/refresh restores locale without changing economic or authenticated
state; error/rejection/unknown-result recovery remains actionable; native
language names, keyboard/focus, 390/1440 widths, zoom and existing light/dark
preferences remain usable. Run UI baseline, relevant unit/transport/browser
regressions and visible acceptance. Test-host fixtures are explicitly local
synthetic projections, never deployed persistence evidence. Professional
financial/legal translation review remains a separate release requirement.

Migration: none. Rollback: remove the presentation modules/asset registrations
and selector; language preference is non-authoritative. Existing runtime stays
available through Founder review. Record exact diff, actual checks, URL and
remaining acceptance in output/b1-six-language; do not claim deployed completion.

## Local completion record

2026-11-07: the local candidate implements the scoped Human core. Dictionaries
contain 1,174 six-language entries with matching placeholders. Availability and
domain-error branches are included in the missing-copy gate. The gate is part
of the existing `lint` command. Native language names, allowlisted preferences,
exact minor-unit currency formatting and explicit UTC dates are implemented.

Files: `apps/web/src/product-{copy,i18n,localization,error-presentation}.js`,
`product-localization.css`, app/history/snapshot/sign-in presentation, the fixed
tenant asset allowlist, `scripts/check-product-i18n.mjs`, its web unit test and
the existing transport-conformance asset checks. No new dependency, protocol,
migration, wallet/network activation, fee or launch-policy change.

Security verification: language round trips preserve inputs, exact Offer hashes
and valid acknowledgment without protocol replay. An edited stale Offer stays
blocked and cannot revive acknowledgment. Existing wallet authority, timeouts,
cross-account/session invalidation and record isolation regressions pass.
Provider names and original service diagnostics remain unaltered. Language
storage is optional and cannot grant authentication, role or economic authority.

Evidence and review: see `output/b1-six-language/RESULT.md`, JSON journeys,
layout matrix, test logs, served-asset hashes and terminology review draft.
Founder review: <http://127.0.0.1:4331/?preview_data=fixture#request-credit>.
This uses the unchanged in-memory synthetic browser-test host, not production
services or durable persistence. Restarting that host resets its test data.

Release remains **BLOCKED — NOT COMPLETE**: professional financial/legal copy
review has no named language reviewers or sign-off yet, and this B1 candidate
has not been published or verified on deployed durable services. B2–B5, Agent
operator translation, the full Jarvis version and partner acceptance remain
separate work. This record does not grant deployment or financial permission.


## 2026-11-08 continuation

Founder instructed continuation of the plan and confirmed: “已经请专业人员审核完毕，放行”. Record this as Founder-attested completion/clearance of the professional copy review for the B1 candidate; no reviewer identity, document or independent verification is invented. The underlying Jarvis v1.1 source requires professional review for contract/regulatory text, a uniform financial glossary and manual sampling for general copy. It does not require professional certification of every button.

Continue the bounded B1 no-real-funds release preparation/verification within the existing hosting and security boundaries. No fees, wallets/networks, funds, legal-market permission or privileged role activation is included. A later deployed verdict still requires exact deployment and durable-service browser evidence.

Semantic review found role-mismatch messages missing from localization and an ambiguous standalone Principal role label. Fix only presentation: explicit Principal Controller role names, localized recovery messages and the visible authenticated-runtime gate; preserve all role checks, logout requirements and financial values. Add regression coverage for both roles, unknown roles and all six languages. Prior 2026-11-07 evidence remains historical at its original SHA.

The local semantic fix also inventories gateway-denial labels and clarifies the existing Spanish/Russian early-repayment copy to preserve partial/full repayment and principal allocation. No economic policy or amount changes.
