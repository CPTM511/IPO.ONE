# IPO.ONE Public Sandbox Deployment Evidence v0.1

Version: v0.1

Evidence date: 2026-07-13

Environment: Public no-real-funds sandbox

Public origin: `https://ipo.one`

## Scope and Claim

This record documents the hosted release of the anonymous, synthetic-data
IPO.ONE public sandbox. It proves the observed release identity, DNS change,
cloud boundary, edge controls, monitoring configuration, and live Human/Agent
checks listed below.

It does not authorize or certify real funds, production credit, custody,
private tenant data, KYC/KYP processing, Human lending, external Provider
execution, smart contracts, or financial decisions. It is not an independent
penetration test, formal verification, cloud audit, or zero-vulnerability claim.

## Immutable Release Identity

| Evidence | Value |
| --- | --- |
| Repository | `CPTM511/IPO.ONE` |
| Release commit | `00598584f437f71ebb1dd8a3517585ad8fc96ce9` |
| GitHub Quality Gate | Run `29234107882`, successful |
| Cloud Build | `7cd93d44-d5d4-4e01-a8e9-d25d80df5519`, successful |
| Image | `asia-southeast1-docker.pkg.dev/ipo-one-public-sandbox-cptm511/ipo-one/public-sandbox@sha256:53186cf01d969e8e12988f6164f8f069bb0b180d853fe73a3d95f7342a602105` |
| Cloud Run revision | `ipo-one-public-sandbox-00001-szw` |
| Runtime release header | `X-IPO-ONE-Release: 00598584f437f71ebb1dd8a3517585ad8fc96ce9` |

Artifact Analysis completed successfully for the deployed image. At evidence
time its effective-severity summary was 0 Critical, 0 High, 5 Low, and 7
Minimal findings. This is a point-in-time published-advisory scanner result;
unknown, newly disclosed, or independently discoverable vulnerabilities remain
possible.

## Cloud Runtime and Edge

| Resource | Verified configuration |
| --- | --- |
| GCP project | `ipo-one-public-sandbox-cptm511` (`94790935766`) |
| Region | `asia-southeast1` |
| Cloud Run service | `ipo-one-public-sandbox` |
| Runtime identity | `ipo-one-runtime@ipo-one-public-sandbox-cptm511.iam.gserviceaccount.com`; no project roles; no user-managed keys |
| Ingress | `internal-and-cloud-load-balancing` |
| Default origin | `run.app` URL disabled |
| Capacity | Minimum 1, maximum 10 instances |
| Global address | `136.68.214.66` |
| Serverless NEG | `ipo-one-serverless-neg` |
| Backend | `ipo-one-backend`; 30-second timeout; request logging enabled |
| TLS | `ipo-one-managed-cert` active for `ipo.one` and `www.ipo.one`; modern policy; minimum TLS 1.2 |
| Cloud Armor | `ipo-one-edge-policy`; unknown-host deny, 300 requests/minute/IP throttle, SQLi/XSS preview rules |

HTTP port 80 redirects approved hosts permanently to HTTPS. Unknown hosts are
sent to the protected backend and denied rather than receiving the redirect.
The application independently enforces its Host, trusted-proxy HTTPS, HSTS,
release, origin, and no-real-funds startup contract.

## DNS Change and Preservation

GoDaddy remains authoritative through `ns47.domaincontrol.com` and
`ns48.domaincontrol.com`.

| Record | Post-cutover result |
| --- | --- |
| Root A | `136.68.214.66`, TTL 600, returned by both authoritative servers |
| Root AAAA | None |
| `www` CNAME | `ipo.one.` |
| `apiv1` A | Preserved at `54.251.69.243` |
| MX | `smtp.secureserver.net.` priority 0; `mailstore1.secureserver.net.` priority 10 |
| SPF/TXT | Preserved: `v=spf1 include:secureserver.net -all` |

Only the approved root A value changed. The rollback value is
`54.251.69.243`. NS, MX, TXT/SPF, mail, `www`, and `apiv1` records were not
modified.

## Hosted Verification

The following checks passed with normal certificate validation:

| Check | Result |
| --- | --- |
| `GET https://ipo.one/livez` | `200`, `{"ok":true}` |
| `GET https://ipo.one/readyz` | `200`, public-sandbox mode and exact release SHA |
| `GET https://ipo.one/` | `200`, Human control plane |
| `GET https://ipo.one/openapi.json` | `200`, OpenAPI 3.1.2 contract |
| `GET https://ipo.one/.well-known/ipo-one.json` | `200`; real funds, production credit, and Human credit disabled; synthetic data only |
| `GET https://ipo.one/.well-known/security.txt` | `200`, canonical disclosure contact |
| `GET https://www.ipo.one/readyz` | `200`, valid managed certificate |
| `GET http://ipo.one/livez` | `301` to HTTPS |
| Unknown HTTPS Host at the load balancer | `403` from Cloud Armor |
| Direct default Cloud Run origin | Unavailable |

Responses included HSTS, same-origin Content Security Policy, frame denial,
MIME protection, no-referrer policy, restricted browser permissions, request
correlation, and the immutable release header.

## Human and Agent Evidence

The repository Agent smoke suite was executed against `https://ipo.one` and
completed Subject creation, account binding, Lockbox creation, credit decision,
allowlisted Provider spend, settlement, revenue capture, automatic repayment,
credit evaluation, replay proof, negative API cases, session isolation, and
OpenAPI checks. The final obligation was `fully_repaid`, the Transfer Intent was
`settled`, the Ledger was balanced, and no production funds moved.

The live Human control plane was inspected at 1440x900 and 390x844. Its one-click
verified flow reached 6 of 6 lifecycle steps, showed active Agent, Lockbox, and
Mandate state, zero outstanding balance, balanced Ledger state, replay evidence,
and 63 Evidence envelopes. No horizontal overflow, clipped primary control,
overlap, or blank primary surface was observed.

Repository evidence on the release line included 90 database-free checks, 8
live adversarial HTTP tests, and 14 PostgreSQL integration subtests. The exact
GitHub release commit passed the immutable Quality Gate.

## Monitoring and Logs

- Uptime config `ipo-one-readyz-GbIFXcF-glk` runs every minute from Asia
  Pacific, Europe, and US Oregon. It requires valid TLS, HTTP 200, and the
  `public_sandbox` body marker from `/readyz`.
- Alert policy `4843503573980397259` opens on multi-region readiness failure.
- Alert policy `11323521526202069444` detects Cloud Run 5xx response rate.
- Alert policy `4916486367718398642` detects sustained P99 latency above two seconds.
- Alert policy `11639520404709595079` detects sustained instance count above 8 of 10.
- Alert policy `4580130542078666976` opens on enforced Cloud Armor rate-limit
  events, rate-limits notifications to one per five minutes, and auto-closes
  after 30 minutes without another match.
- Logs-based metric `ipo_one_cloud_armor_denies` counts enforced Cloud Armor
  deny outcomes for surge detection.
- GCP `_Default` log bucket retention is 30 days. Application logs omit request
  bodies, query values, sandbox session IDs, raw IPs, secrets, PII, and stack
  traces; edge request logs retain operational network metadata.

No external notification channel was created because an approved recipient was
not named. Policies can create incidents in Cloud Monitoring, but notification
delivery, incident/takedown ownership, and formal retention approval remain
operations gates.

## Rollback

1. Shift Cloud Run traffic to the last known-good immutable revision if an
   application regression occurs.
2. Restore the last known-good URL map, backend, or Cloud Armor policy if the
   edge boundary is faulty.
3. Restore root A to `54.251.69.243` if the complete new boundary fails.
4. Preserve request, Cloud Armor, deployment, and release evidence before retry.

DNS rollback was not required because both authoritative servers, both managed
certificate domains, readiness, the complete Agent API smoke, and the Human UI
flow passed after cutover.

## Open Gates

- Protected GitHub Environment approval and a passing private
  `launch:verify` evidence file for future automated releases.
- Named monitoring recipients, incident owner, takedown owner, and response rota.
- Formal review of edge-log fields and 30-day retention.
- Independent penetration test and independent cloud-configuration review.
- Production Human/workload IdP, authenticated durable command gateway,
  object authorization, dual control, and break-glass custodians.
- Production database backup/restore, scheduled reconciliation, and disaster recovery.
- Signed Mandates and account proofs, certified remote adapters, custody/fund
  path, capital, legal, risk, privacy, provider, chain, and real-value approvals.

Until those gates are closed, this environment remains a public product and
integration demonstration only.
