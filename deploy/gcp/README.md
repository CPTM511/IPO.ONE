# IPO.ONE Public Sandbox Deployment Runbook

This runbook publishes the **no-real-funds public sandbox** at `https://ipo.one`.
It does not authorize production credit, custody, private tenant data, KYC/KYP
processing, Human lending, or external payment execution.

## Target Boundary

```text
Human + Agent clients
        |
     ipo.one
        |
Global external HTTPS load balancer
  + managed certificate
  + modern TLS policy
  + Cloud Armor
        |
Serverless NEG
        |
Cloud Run (load-balancer ingress only; default URL disabled)
        |
Non-root, immutable IPO.ONE public-sandbox image
```

Google recommends a global external Application Load Balancer for a production
custom domain in front of Cloud Run. Direct Cloud Run domain mapping remains a
Preview feature and is not the selected path.

## Required Human Inputs

Do not execute a deployment until the named owners approve:

| Input | Required decision |
| --- | --- |
| GCP project | Project ID/number, billing owner, organization policy, and Artifact Registry |
| Region | Data-residency and latency-approved Cloud Run region |
| Identities | Dedicated deploy identity and zero-role runtime service account |
| Edge | Cloud Armor thresholds, WAF rollout, log policy, and alert recipients |
| Security | Public HTTPS contact, incident owner, takedown owner, and retention |
| DNS | GoDaddy account owner, exact root A change, TTL, rollback owner |

Use GitHub OIDC Workload Identity Federation for deployment. Do not create or
store a long-lived Google service-account JSON key in GitHub or this repository.

## 0. Verify the Release Authorization Contract

The versioned policy is `deploy/launch-policy.v1.json`. The committed
`deploy/approvals/public-sandbox.pending.json` file is intentionally invalid and
must remain pending. Record actual evidence only in an ignored `*.local.json`
file or approved private change-control system.

Before any build, cloud, edge, or DNS mutation, verify the exact candidate:

```sh
pnpm run launch:verify -- \
  --evidence deploy/approvals/public-sandbox.local.json \
  --profile public_sandbox \
  --expected-sha "$(git rev-parse HEAD)"
```

The verifier requires an immutable CI run, digest image, fresh named gates,
exact capability boundary, and protected-environment approval reference. A
passing file is necessary but not sufficient: GitHub Environment protection,
cloud IAM, Security/Release Owner review, and DNS change approval remain the
authoritative controls. Closed private and real-value profiles are
policy-locked and cannot be unlocked by editing an evidence file.

## 1. Build an Immutable Image

Use Node 24.18.0 and pnpm 11.1.3. Build from the exact green Git commit:

```sh
git status --short
export PROJECT_ID="<approved-project-id>"
export REGION="<approved-region>"
export RELEASE_SHA="$(git rev-parse HEAD)"
docker build --build-arg BUILD_REVISION="$RELEASE_SHA" \
  --tag "$REGION-docker.pkg.dev/$PROJECT_ID/ipo-one/public-sandbox:$RELEASE_SHA" .
docker push "$REGION-docker.pkg.dev/$PROJECT_ID/ipo-one/public-sandbox:$RELEASE_SHA"
```

Resolve the pushed image to its registry digest and use the digest form for
`IMAGE_URI`; a mutable tag is not a release identity.

Before release, verify the pinned distroless runtime's keyless signature with
the identity published by the distroless project:

```sh
cosign verify \
  gcr.io/distroless/nodejs24-debian13@sha256:70a2c12a0d76018b54d7bd01c5e3677632eeed9f890ba318d6db55fc54cf3baa \
  --certificate-oidc-issuer https://accounts.google.com \
  --certificate-identity keyless@distroless.iam.gserviceaccount.com
```

Enable Artifact Analysis scanning on the repository. Do not promote an image
with an unreviewed critical/high finding, an unknown base-image provenance, or
a mutable deployment reference. Record any time-bounded exception with an owner
and remediation date; “the scanner could not run” is a failed gate.

## 2. Render and Review Cloud Run

Set only approved, non-secret values. The runtime currently needs no cloud API
permission and no secret volume.

```sh
export PROJECT_NUMBER="<approved-project-number>"
export SERVICE_ACCOUNT_EMAIL="<runtime-service-account>"
export IMAGE_URI="<artifact-registry-image@sha256:digest>"
export SECURITY_CONTACT_URL="https://github.com/CPTM511/IPO.ONE/security"
envsubst < deploy/gcp/cloud-run-service.yaml.tmpl > /tmp/ipo-one-cloud-run.yaml
grep -n '\${' /tmp/ipo-one-cloud-run.yaml
gcloud run services replace /tmp/ipo-one-cloud-run.yaml --region "$REGION"
```

The `grep` command must return no unresolved placeholder. Review the rendered
file before `gcloud run services replace`. The template deliberately sets:

- `internal-and-cloud-load-balancing` ingress;
- disabled default `run.app` URL;
- public invoker for the public sandbox only;
- one minimum and ten maximum instances;
- startup, liveness, and readiness probes;
- exact `public_sandbox` and no-real-funds startup contract.

## 3. Configure the Edge

Create a serverless NEG for the Cloud Run service, a global backend service, a
reserved global IPv4 address, URL map, target HTTPS proxy, and forwarding rule.
Attach all of these before DNS cutover:

- Google-managed certificate for `ipo.one` (and `www.ipo.one` only if approved);
- TLS policy with minimum TLS 1.2 and a modern profile;
- staged HSTS beginning at one day without `includeSubDomains`; increase only
  after every subdomain and rollback path is inventoried;
- Cloud Armor policy with a conservative per-client throttle;
- WAF SQLi/XSS rules in preview first, promoted only after false-positive review;
- request logging with query and request-body logging disabled;
- alerting for 5xx rate, latency, instance saturation, probe failures, and
  Cloud Armor deny/rate events.
- a separate port 80 frontend whose URL map performs only a permanent HTTPS redirect.

The application has process-level limits, but those are not DDoS protection.
Cloud Armor and load-balancer quotas must be tested independently.

## 4. Verify Before DNS

Test through the load-balancer IP while sending the production Host. Confirm
the certificate only after DNS validation is active.

Required evidence:

```text
GET /livez                              -> 200
GET /readyz                             -> 200 and expected release SHA
GET /.well-known/ipo-one.json           -> realFundsEnabled=false
GET /                                   -> 200, HSTS, CSP, expected release SHA
GET /openapi.json                       -> 200
Host: attacker.invalid                  -> not routed or 421
direct public run.app URL               -> unavailable
HTTP :80                                -> edge redirect to HTTPS
```

Run the complete Agent flow through both the UI and SDK against the candidate.
Verify that logs contain request IDs but no body, query value, session ID, raw
IP in application logs, secret, or private data.

## 5. GoDaddy DNS Cutover

As observed on 2026-07-12, GoDaddy nameservers are authoritative and the root A
record points to `54.251.69.243`; HTTP and HTTPS did not return a service. Recheck
immediately before changing DNS because this external state can drift.

1. Lower only the root A TTL to 300 seconds at least one prior TTL in advance.
2. Preserve NS, MX, SPF/TXT, and every mail-related record.
3. Replace only the root `@` A value with the reserved load-balancer IPv4.
4. Add `www` only if it is in the certificate, Host allowlist, and redirect plan.
5. Verify from multiple resolvers, then run the launch checks below.

Never delegate nameservers or delete mail records for this launch.

## 6. Launch and Rollback

Launch checks:

```sh
dig +short ipo.one A
curl --fail --show-error --silent https://ipo.one/livez
curl --fail --show-error --silent https://ipo.one/readyz
curl --fail --show-error --silent https://ipo.one/.well-known/ipo-one.json
curl --fail --show-error --silent https://ipo.one/openapi.json
```

Rollback order:

1. Shift Cloud Run traffic to the last known-good immutable revision.
2. If the edge is faulty, restore the last known-good URL map/backend policy.
3. If the entire new boundary is faulty, restore the prior reviewed DNS A value.
4. Preserve logs and release evidence; open an incident record before retrying.

Do not “fix forward” by changing ingress to `all`, enabling the default URL,
disabling Host/HTTPS checks, or committing credentials.

## Production No-Go

Public reachability is not commercial-pilot authorization. AuthN/tenant/RBAC,
durable non-Rail state, reconciliation, signed Mandates, certified adapters,
legal/privacy/risk controls, backup/restore, on-call, and independent security
review remain mandatory before private customer data or real value.
