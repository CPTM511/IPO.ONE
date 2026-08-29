# PILOT-008B Gate 0 readiness Evidence

Date: 2026-08-29

Verdict: `GATE 0 READY — DEPLOYMENT/ACTIVATION BLOCKED`

Prerequisite: `PILOT-008A` local commit
`bb72a66f8627f9751c493f464a814bb53da9f403`

## Repository truth

- The prerequisite commit exists locally but is not an ancestor of the current
  `origin/main`; therefore there is no exact merged deployment candidate.
- No immutable CI run, image digest, migration receipt or new rollback target
  exists for `PILOT-008B`.
- `deploy/closed-pilot/operations.v1.json` remains correctly bound to the
  historical July local release candidate at
  `129f8bb28ff53d6dfb4e175b953a537b987a2a84`; it is not relabeled as current.
- Launch policy v1.3.3 keeps
  `closed_non_funds_pilot.releaseEnabled=false`.
- All eight launch Evidence gates remain pending and the checked-in provider
  recommendation still has provisioning blocked.
- The provider sources require a new decision: the July recommendation names
  Neon, while the later GCP stack and existing resource use Cloud SQL. Gate 0
  does not silently choose or provision either option.

## Read-only cloud observation

The current project was queried through non-mutating `gcloud ... describe` and
`... list` commands. No secret values, IAM policy contents or participant data
were requested or recorded.

| Observation | Current state |
| --- | --- |
| GCP project | active |
| Closed-pilot PostgreSQL | PostgreSQL 17, regional HA, deletion protected, connector enforcement required, encrypted-only, 14 backups, PITR enabled, stopped |
| Closed-pilot Cloud Run service | absent |
| Closed-pilot Cloud Run Job | absent |
| Runtime and migrator service-account names | present |
| Billing | disabled |
| Secret Manager inspection | unavailable because billing is disabled |
| Compute API / proposed edge policy | API disabled; no edge policy Evidence |
| Activation Evidence | none |

The stopped database and disabled services were not started. Billing, APIs,
secrets, IAM, edge configuration and Cloud Run were not changed.

## Gate 0 contract

`deploy/closed-pilot/pilot-008b-gate0.v1.json` records:

- five unavailable release bindings: merged candidate, green CI, immutable
  image, migration receipt and rollback target;
- eighteen pending human/provider/operations inputs;
- eight pending launch gates;
- fourteen permission-expanding authorities fixed to false; and
- current cloud observation classified as read-only and non-authorizing.

The validator cross-checks that record against launch policy, the pending
approval template, topology, provider selection and the historical operations
source. It rejects premature authority, invented approval, candidate readiness,
profile enablement, stronger cloud claims and unknown fields.

## Verification

- `check:pilot-008b-gate0`: passed;
- targeted deployment-topology unit tests: 5 passed, 0 failed;
- source and boundary lint: passed;
- deploy topology: passed with launch blocked;
- closed-pilot operations: passed with cloud mutation and launch disabled; and
- launch policy: passed with pending Evidence failing closed.

## Required next decisions

No deployment turn may begin until the Founder supplies or names the accountable
owners for provider/topology and cost, jurisdiction and Legal/Privacy,
retention, support and on-call, incident/restore/rollback, notifications,
secret management, independent security review and participant references.
After `PILOT-008A` is merged and CI is green, a separate exact decision must
bind the resulting SHA, image digest, migration plan and rollback target.

Zero-traffic deployment verification, profile unlock and traffic cutover are
three separate future actions; approval of this Gate 0 record authorizes none
of them.
