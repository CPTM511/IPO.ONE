# WEB-026 product experience review

Date: 2026-09-05. UI source: `12675dd70a3fc1d01b81daab783dc3565169e3cc`.

## Experience links

These are isolated synthetic conformance hosts. They do not prove actual account login or durable persistence.

- [Human — next task and credit plan](http://127.0.0.1:4191/?preview_data=fixture#request-credit)
- [Principal / Agent — current task and authority](http://127.0.0.1:4192/?preview_data=fixture#agent-console)
- [Capital Partner — authorized inbox and terms](http://127.0.0.1:4193/?preview_data=fixture#capital-partners)
- [Risk — portfolio and controls](http://127.0.0.1:4194/?preview_data=fixture#risk-operations)
- [Public entry and unavailable-login recovery](http://127.0.0.1:4195/?preview_data=fixture)

Review service: `com.ipoone.web026.review` under the user's launchd session, running `scripts/start-web026-review.mjs` from `/private/tmp/ipo-one-web-013-experience`. It is kept running for Founder review. `launchctl start com.ipoone.web026.review` resumes the existing job; `launchctl stop com.ipoone.web026.review` stops only this review. Ports 4191–4195 are browser-compatible; the initial 4190 attempt was corrected because that port is browser-reserved. Original WEB-012B review on 4186/4187 remains unchanged.

## What changed

- Approved Direction B public presentation runs on the ordinary entry, on top of the latest functional/Whitepaper base instead of the historical WEB-011 backend.
- Role-specific task navigation retains every authorized view under primary or visible More tools controls. Roles and authorization do not change.
- Human: one next-task card, selected-plan summary, explicit payment/review controls, accessible explanation, feedback and case disclosures.
- Principal / Agent: original guarded lifecycle controls lead the page; status, action label and authority management agree with current state. No browser credential or fake Agent execution was added.
- Capital Partner and Risk: consistent readable surfaces, structured terms, portfolio-first Risk layout, responsive financial summaries and preserved unavailable states.
- Correct access-step numbering, dark/light login recovery contrast, focus containment including selects, nested-disclosure focus, and compact mobile header.

## Evidence

| Check | Result |
| --- | --- |
| Web unit suite | 203/203 passed |
| Authenticated transport and static asset checks | 91/91 passed |
| Workspace browser journeys | 24/24 passed |
| Public ten-state interaction and Whitepaper journey | 1/1 passed |
| Visual combinations | Four roles × six widths × two themes; 48 screenshots |
| Responsive checks | 1440, 1058, 1024, 768, 390, 320; no document overflow, compact phone header, readable amounts |
| Recovery | Visible navigation/back/reload; Human summary from host state; retained entered amount through theme change; SIWE reconnect before creation |
| Accessibility checks | Keyboard dialog containment, nested-help focus, reduced motion; existing Pool action at 200% zoom |
| Bundle / lint | 44 authored web modules / 1054 static IDs; source and boundary lint passed |
| Whitepaper | Current Founding Edition III, 48 anchored sections, 7 diagrams, 43-page PDF |

Browser artifacts: `output/playwright/web-026/`. Human, Agent, Capital and Risk desktop/mobile samples were visually inspected in addition to layout assertions. This is not a full assistive-technology or WCAG certification.

## Actual service boundary

Read-only local runtime audit found source/process drift and migrations 0070–0073 missing from the database. Current mounted backend would auto-migrate on restart, including identity and permission changes. No existing backend/container was created, stopped, restarted or replaced; no database or credential change occurred. A previous proposed restart script was replaced by an audit-only command before execution.

The separately reviewed runtime scope, migration effects and rollback requirements are in `../codex/tasks/WEB_026F_LOCAL_RUNTIME_RECONCILIATION_REVIEW.md`.

| Completion state | Evidence |
| --- | --- |
| CODE | Presentation and regression changes committed as 12675dd |
| RUNTIME | Labeled synthetic review hosts running; actual backend integration blocked |
| DEPLOYED | No cloud deployment or actual deployed-SHA acceptance |
| REACHABLE | All role-allowed review views reached by visible clicks |
| VERIFIED | Browser/conformance checks passed; actual login, durable recovery and Founder acceptance pending |

Product verdict: **BLOCKED — NOT COMPLETE**. UI review readiness is not real-account or deployed product completion.
