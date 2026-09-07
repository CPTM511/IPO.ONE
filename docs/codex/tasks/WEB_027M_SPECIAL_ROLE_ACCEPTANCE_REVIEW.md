# WEB-027M — Remaining local role and servicing acceptance prerequisites

Status: APPROVED for the exact local scope by the Founder on 2026-09-07 ("确认，同意，搞！"). Implementation and acceptance in progress.

Implementation finding: the existing policy requires two approvers (Risk and Operations), both distinct from the proposer/command actor. The exact approved Operations grant has no `approval.decide`, and the approved identity set contains only one Operations actor. No grant or separation rule will be silently broadened. A separate Operations reviewer remains a concrete authorization gap for final execution; the approved three roles and existing policy can still be implemented and tested.

## Context and verified facts

The Founder delegated role acceptance on 2026-09-07. WEB-027L therefore performs the available Human, Principal/Agent, Capital Partner and Risk journeys itself. Founder clicks are not a general prerequisite for this delegated software acceptance.

The actual candidate database has active Human, Principal, Agent, Capital Partner, Risk and System Worker memberships. It has **no Operations or Auditor membership**, no distinct second privileged approver, and no granted `approval.*` capability for the current Risk actor. Current Risk servicing queue is empty. The existing freeze UI only selects adverse queue cases. It does not provide a way to select a non-adverse Agent for credential-compromise protection. These are concrete runtime prerequisites; assuming another role in an acceptance report cannot create them.

The shared servicing commands already exist: `pilotRestructureSandboxObligation`, `pilotRepurchaseSandboxObligation`, `pilotWriteOffSandboxObligation`. Their original exact-command, state/version/hash, reason, expiry and distinct Operations/Risk approval requirements remain binding. Existing PostgreSQL tests cover these domain/persistence paths; they do not prove browser usability.

## Proposed bounded change for review

1. Add dedicated invited **local-only** Operations, Auditor and approval-only Risk Reviewer workspaces and visible login/MFA. Use distinct synthetic actors, credentials, wallet keys and native Passkeys; no role union and no public privileged registration. Proposed exact origins: `http://localhost:8939` for Operations and `http://localhost:8940` for Auditor and `http://localhost:8941` for Risk Reviewer, after checking port availability. Existing ports 8935–8938, original services 8895–8898 and hosted configuration retain their scopes.
2. Provision Operations only with existing capabilities required for the servicing queue, exact proposal lifecycle and the three sandbox servicing commands: `servicing.queue.read`, `servicing.restructure.sandbox`, `servicing.repurchase.sandbox`, `servicing.writeoff.sandbox`, `approval.propose`, `approval.read`, `approval.cancel`. Give the distinct new Risk Reviewer only `approval.read`, `approval.decide` and `servicing.queue.read`, bounded to the isolated acceptance resources. Preserve the original Risk actor and credential ceiling unchanged. Auditor remains read-only, limited to `risk.read.tenant`, `pilot.case.read.tenant` and `approval.read` for this acceptance tranche. Validate every grant against its existing role policy; do not weaken the policy to fit a grant.
3. Expose existing proposal/decision/servicing mechanisms through versioned authorized operations and visible controls where the UI/transport adapter is absent. Show exact affected plan, balances, schedule version, reason and expiry. Selection/read cannot mutate. An Operations proposal and a different Risk actor's explicit confirmation must both be recorded before the exact servicing command executes. Same actor, stale state, revoked session, mismatched resource and expired/reused approval are denied.
4. Add an authorized, bounded local Risk Agent selector for the existing `pilotFreezeSubject` capability, with no Human PII and no general Subject enumeration for ordinary roles. Use one newly created disposable local Agent for an actual visible freeze. This adds read/discovery exposure and therefore is included in the review, rather than silently bypassing the current queue-only UI. No unfreeze, limit increase or other new risk action.
5. Reuse the existing exact WebAuthn verifier and durable session checks. An additive migration may extend the selected-role constraints and enrollments; do not modify applied migration checksums or authentication claims. No additional dependency is proposed. Record exact new IDs, grants and revocation before activation, with secret material only in the protected ignored local runtime directory.

## Acceptance and test command

Use actual deployed local services and PostgreSQL, visible clicks, distinct signed actors and current MFA. Verify proposal/approval/execution, wrong-role and same-actor rejection, replay/expiry/state-change rejection, refresh/logout/login/process recovery, immutable original schedule and Evidence, and read-only Auditor behavior. A write-off must not appear repaid; a repurchase must not fabricate payment; restructuring preserves prior schedules. Use legitimately matured synthetic positions and trusted server/worker time; do not change database dates or system clocks to manufacture final acceptance.

Run applicable authentication/security/transport tests, schema/protocol/type checks, isolated PostgreSQL regression and visible browser acceptance on the installed SHA. Any unavailable eligible position or missing surface remains explicitly open; unit fixtures are not deployed acceptance.

## Likely files / migration / rollback

Local identity and host provisioning, selected-role authentication constraints, native privileged step-up composition, existing approval/servicing adapters, workspace manifest and role UI. Add migration at the next verified unused number only if required. Candidate database is strictly `ipo_one_web027_candidate`; implementation uses a separate local gate. Rollback disables the new hosts/enrollments and revokes the added test credentials and sessions while retaining every event, proposal, decision, schedule and audit record. Do not rewrite terminal state.

## Non-goals and authority boundary

No formal deployment, public exposure, real funds, chain transactions, signer, external Provider, venue, risk pricing/threshold changes, automatic approval, production capability grants, broad role union or removal of dual control. Configured Pool/Provider/venue acceptance, physical wallet/device coverage and formal hosted SHA acceptance remain separate explicit rows.

This review is required by the approved WEB-027 directive §2.2: “若正确修复涉及权限模型或迁移，应提交具体方案供单独审阅”. WEB-027K explicitly approved K1/K2 and did not grant the remaining special roles. The Founder's delegated testing instruction is already applied; this document asks only about the **new privileged runtime configuration**, not permission to perform existing QA or a request that the Founder test manually.
