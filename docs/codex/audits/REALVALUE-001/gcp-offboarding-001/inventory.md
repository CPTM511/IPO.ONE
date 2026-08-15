# GCP-OFFBOARDING-001 inventory and recovery record

Observed at: `2026-07-27T01:26:32Z`  
Project: `ipo-one-public-sandbox-cptm511`  
Region: `asia-southeast1`  
Action requested by: IPO.ONE Founder  
Intent: stop the temporary GCP deployment and its material recurring cost
before moving the no-real-funds internal-test surface to Vercel.

This record contains no secret value, credential, database content, reusable
signature, or private key.

## Data recovery point

Cloud SQL instance:

- name: `ipo-one-closed-pilot-db`
- engine: PostgreSQL `17.10`
- state before stop: `RUNNABLE`
- topology: regional HA
- deletion protection: enabled
- storage: 20 GiB PD-SSD
- activation policy before stop: `ALWAYS`
- latest successful automated backup ID: `1785088800000`
- backup start: `2026-07-26T18:39:11.043Z`
- backup completion: `2026-07-26T18:40:42.334Z`
- backup location: `asia`
- retained backups configured: 14
- PITR configured: seven days

The approved offboarding action is to set activation policy to `NEVER`, not to
delete the instance or its backups. This stops database compute while retaining
a reversible database recovery path. Storage and backup retention can continue
to incur a smaller charge.

## Cloud Run resources before offboarding

| Resource | Release | Minimum instances |
| --- | --- | --- |
| `ipo-one-public-sandbox` | `00598584f437f71ebb1dd8a3517585ad8fc96ce9` | 1 |
| `ipo-one-closed-pilot` | `20e142bb14690296eac754946a876ead879a45ca` | 1 |
| Job `ipo-one-closed-pilot-migrate` | closed-pilot migration job | on demand |

Both services use immutable Artifact Registry digests. The source templates,
runbooks, image digests, service accounts, Secret Manager metadata, and
Artifact Registry images remain the recovery definition after service removal.

## Global edge resources before offboarding

| Type | Resource |
| --- | --- |
| Global forwarding rules | `ipo-one-http-forwarding-rule`, `ipo-one-https-forwarding-rule` |
| Reserved global IPv4 | `ipo-one-public-ip` = `136.68.214.66` |
| Target proxies | `ipo-one-http-proxy`, `ipo-one-https-proxy` |
| URL maps | `ipo-one-http-redirect-map`, `ipo-one-https-map` |
| Backend | `ipo-one-backend` |
| Serverless NEG | `ipo-one-serverless-neg` |
| Managed certificate | `ipo-one-managed-cert` for `ipo.one`, `www.ipo.one` |
| TLS policy | `ipo-one-modern-tls` |
| Cloud Armor | `ipo-one-edge-policy` |
| Uptime check | `ipo-one-readyz-GbIFXcF-glk` |

The public DNS A record is external to this GCP project. Releasing
`136.68.214.66` leaves the existing `ipo.one` A record stale until the DNS owner
removes or changes it. The record must not be treated as a valid rollback
address after release.

## Recovery sources retained

- `deploy/gcp/cloud-run-service.yaml.tmpl`
- `deploy/gcp/closed-pilot/cloud-run-service.yaml.tmpl`
- `deploy/gcp/closed-pilot/cloud-run-migration-job.yaml.tmpl`
- `deploy/gcp/closed-pilot/stack.v1.json`
- `deploy/gcp/README.md`
- `deploy/gcp/closed-pilot/README.md`
- Artifact Registry repository `ipo-one`
- Cloud Build bucket `ipo-one-public-sandbox-cptm511_cloudbuild`
- Secret Manager secret metadata and numeric versions
- Runtime, migration, build, and deployment service accounts

These retained resources may continue to incur storage or low-volume metadata
charges. They do not keep Cloud Run instances or Cloud SQL compute running.

## Offboarding completion

Completed at: `2026-07-27`

- Cloud SQL `ipo-one-closed-pilot-db` now reports `state=STOPPED` and
  `activationPolicy=NEVER`.
- Cloud Run services `ipo-one-public-sandbox` and
  `ipo-one-closed-pilot` were deleted.
- Cloud Run Job `ipo-one-closed-pilot-migrate` was deleted.
- All five IPO.ONE alert policies and the `ipo-one-readyz` uptime check were
  deleted.
- Both global forwarding rules, both target proxies, both URL maps, the
  backend service, serverless NEG, managed certificate, TLS policy, Cloud Armor
  policy, and reserved global IPv4 address were deleted.
- Post-action read-only listings returned no Cloud Run service, Cloud Run Job,
  forwarding rule, reserved global address, backend service, target proxy, URL
  map, serverless NEG, SSL certificate, SSL policy, security policy, uptime
  check, or alert policy in the project.

The Cloud SQL instance, successful backups, Artifact Registry images, secrets,
service accounts, and Cloud Build bucket remain. This is intentional for
recovery and means the project is not guaranteed to have a zero-dollar bill:
database/storage, backup, registry, secret-version, build-bucket, logging, or
other retained storage charges can remain. The material always-on compute and
global load-balancer resources observed in this inventory are stopped or
removed.
