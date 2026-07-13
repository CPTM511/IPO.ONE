# Approval

Implements the local non-funds `APPROVAL-001` control boundary: exact-command
ApprovalProposal records, immutable Actor decisions, two-role separation,
short validity windows, authorization-time revalidation, atomic execution
linkage, and a separately gated break-glass lifecycle.

Approval artifacts contain only a proposal ID and version. They are not bearer
authority: the authorization service reloads durable state, verifies the exact
command hash, rechecks both approvers, and requires a freshly revalidated
authorization decision before execution.

The dual-control profile currently requires exactly one Risk Operator and one
Operations Operator. The proposer and command Actor cannot approve. A decision
records the approver's Credential/Membership versions and recent
phishing-resistant MFA evidence; execution revalidates that authority and the
current resource/live-policy versions. Proposal, decisions, execution, Events,
Evidence, outbox, snapshots, and the business write set commit through the same
serializable PostgreSQL unit of work.

Break glass is disabled by default and has a separate, non-upgradable authority
type. Its only actions are credential revoke, Provider pause, risk freeze,
Tenant command pause, and worker delivery pause. Activation requires two
configured hardware-key custodians. Only a configured requester with current
phishing-resistant authentication can mint an exact-resource authorization;
the authorization is bound to that Actor, client, Credential version, Policy,
and incident version and must be revalidated against live incident state before
use. Closing or expiring the incident invalidates it. It cannot be refreshed,
lasts at most 30 minutes, and opens a review due within 24 hours.

Run the explicit drift and behavior gates with:

```sh
pnpm run check:approval-policy
node --test modules/approval/test/*.test.js
pnpm run test:postgres
```

The module does not activate production roles, real funds, deployment access,
KYC/KYP, or break-glass custody. Named custodians, review ownership, notification
delivery, hardware-key enrollment, and a protected deployment approval remain
deployment gates.
