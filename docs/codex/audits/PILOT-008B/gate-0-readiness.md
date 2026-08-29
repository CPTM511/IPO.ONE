# PILOT-008B Gate 0 readiness Evidence

Date: 2026-08-30

Verdict: `GATE 0 REBASED — TECHNICAL READINESS IN PROGRESS; ACTIVATION BLOCKED`

Prerequisite: `PILOT-008A` local commit
`bb72a66f8627f9751c493f464a814bb53da9f403`

## Founder-selected stack

The previous Cloud SQL preference is withdrawn. The smallest selected stack is:

```text
IPO.ONE
  -> existing Vercel project ipo-one-internal
  -> Vercel Node Functions and bounded Vercel Cron
  -> existing Vercel-managed Neon PostgreSQL project ipo-one-m1-b-sandbox
```

No Cloud SQL, Cloud Run, GCP Secret Manager, second PostgreSQL provider or
second deployment control plane is required by current repository truth.

## Sanitized read-only observation

No connection string, password, token, private identifier or secret value was
printed or recorded. The two production PostgreSQL variables are stored as
Vercel `sensitive` values and cannot be exported from the CLI by design.

| Observation | Verified state |
| --- | --- |
| Vercel project | `ipo-one-internal`, ready |
| Hosted readiness | release `316de8f0c2188c5f4d0b15a1cffbc50713b2972e`, role `primary`, profile `closed_non_funds_pilot`, real funds false |
| PostgreSQL provider | Neon |
| Neon organization | managed by Vercel, Launch plan |
| Neon project | `ipo-one-m1-b-sandbox`, active |
| Region | `aws-us-east-1` |
| Branch | one `main` branch, ready |
| PostgreSQL | version 17 over TLS |
| Applied migration head | `0069_auth_reference_hash_key_rotation` (69 migrations) |
| Candidate migration head | `0070_pilot_cases` (approved additive migration, not yet applied) |
| Public schema | 157 tables |
| Tenant isolation | 152 tenant-scoped tables; 152 RLS enabled; 152 FORCE RLS |
| Policies | 163 public-schema policies |
| Core durable schema | 12/12 expected core tables present |
| Durable state | present; about 49,572 rows across PostgreSQL statistics, 54 populated tables |

The hosted readiness endpoint uses the repository's production runtime, which
requires the distinct Gateway and Authentication PostgreSQL connections. Its
ready state and release binding, combined with the exact Neon schema and
migration history above, confirm that the existing Neon project is the durable
IPO.ONE source of truth. There is no evidence of a second active PostgreSQL
source of truth.

## GCP requirements now not applicable

The following former blockers were implementation details of an unselected
architecture and are now `NOT APPLICABLE`:

- Cloud SQL instance stopped;
- Cloud Run service and Job absent;
- GCP billing and Compute API disabled;
- GCP Secret Manager unavailable; and
- GCP edge/WAF Evidence absent.

Their underlying provider-neutral gates remain. Vercel runtime/TLS/firewall,
Vercel sensitive environment values, Neon durability/restore, Tenant RLS,
runtime logging and monitoring must still be proven on the selected stack.

## Genuine blockers retained

- exact merged candidate SHA, green CI and Vercel deployment receipt;
- additive migration `0070` receipt and rollback target;
- hosted tenant/authn/authz acceptance;
- Neon backup/restore drill Evidence;
- reconciliation, synthetic and alert-delivery Evidence;
- Vercel edge/firewall and runtime observability Evidence;
- independent security review or an explicit Founder policy decision changing
  that requirement;
- Legal/Privacy, jurisdiction, retention and participant approval;
- named operational ownership, support channel, on-call, incident, restore and
  rollback procedures;
- monthly cost ceiling and billing owner; and
- launch-policy revision and distinct Founder activation decision.

One person may hold multiple non-independent operational roles. Independent
Security must remain genuinely independent and is not fabricated here.

## Authority boundary

The Founder decision authorizes selecting this existing stack, technical
readiness deployment, approved additive migrations and non-secret Evidence
collection. It does not authorize participant credentials, invitation,
cohort access, launch-policy unlock, traffic activation, real funds, Pool
economic writes, mainnet, signer or external Venue execution, unrestricted
transfer, `PILOT-008C`, `HL-TESTNET-001`, `RISK-003B` or M3.
