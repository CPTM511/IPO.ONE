# IPO.ONE Closed Non-Funds Pilot Release Runbook

This is the reviewed deployment boundary for the authenticated, durable Human
and Agent no-real-funds product at `https://ipo.one`. It does not authorize
real lending, custody, withdrawals, mainnet assets, external Provider execution,
or production Human credit.

The machine-readable target is `stack.v1.json`. The Cloud Run service and
migration Job must use the same immutable image digest and exact green commit.
Runtime identities cannot migrate the database, mutate secrets, deploy services,
or hold any funds/chain/custody permission.

## Current cloud observation (2026-07-18)

- Project Owner access is active for `liumao8844@gmail.com`.
- `ipo-one-closed-pilot-db` exists in `asia-southeast1` as PostgreSQL 17,
  regional HA, deletion protected, with 14 backups retained and seven days of
  PITR logs.
- The database uses a public endpoint with no authorized networks,
  `connectorEnforcement=REQUIRED`, and `ENCRYPTED_ONLY`. This is the reviewed
  Cloud Run built-in Auth Proxy path: applications connect only through the
  `/cloudsql/PROJECT:REGION:INSTANCE` Unix socket and never directly to the IP.
- No required Secret Manager secret, Workload Identity Federation pool, closed
  pilot Cloud Run service, or notification channel was observed.
- The existing public service, backend, certificate and DNS remain the rollback
  path. Do not alter their traffic until the candidate passes every check.

## Exact provisioning order

All mutations run from the protected release environment with a reviewed
change ticket. Commands below intentionally omit secret values.

1. Verify `ipo-one-closed-pilot-db` has no authorized network, requires Cloud
   SQL connectors and encrypted transport, and retains regional HA/deletion
   protection, 14 backups and seven PITR days. Do not enable a direct database
   connection path.
2. Create the runtime, migrator and protected deploy service accounts. Grant
   runtime/migrator only `roles/cloudsql.client` plus log/metric write. Grant
   Secret Accessor on each exact secret, never at project scope. Runtime cannot
   read `ipo-one-migration-database-url`; migrator cannot read Human/Agent
   authentication secrets.
3. Create the ten secrets named in `stack.v1.json` with user-managed
   `asia-southeast1` replication. Add values through the approved secret-entry
   path and pin every Cloud Run reference to a numeric enabled version.
   `ipo-one-identity-config` is mounted through
   `IPO_ONE_IDENTITY_CONFIG_FILE`; `ipo-one-edge-assertion-key` is mounted
   through `IPO_ONE_EDGE_ASSERTION_KEY_FILE`.
4. Start the candidate with the reviewed wallet-only identity configuration.
   SIWE accounts are pre-provisioned by exact CAIP-10 identifier and wallet
   claims do not create authority. Google/OIDC can be added only after its client
   is registered with the sole production redirect
   `https://ipo.one/auth/v1/callback?provider=google`, its numeric secret version
   is mounted, and the immutable IdP approval SHA is updated.
5. Build from the exact green commit, scan, and resolve the Artifact Registry
   image to `@sha256:...`. Render both templates with only reviewed values and
   reject any unresolved `${...}` placeholder.
6. Ensure all three database DSNs use
   `postgresql://USER:PASSWORD@/DATABASE?host=/cloudsql/ipo-one-public-sandbox-cptm511:asia-southeast1:ipo-one-closed-pilot-db`,
   with distinct least-privilege users. Execute the idempotent bootstrap Job;
   it applies migrations, creates the closed roles, seeds the reviewed Tenant
   and Credentials, then verifies both roles. Runtime startup must verify both
   least-privilege database roles and the exact migration head; runtime never
   migrates or seeds.
7. Import `cloud-armor-policy.yaml`, create the separate NEG/backend, attach
   managed TLS, enable request logging without optional fields, and create at
   least readiness, 5xx, latency and saturation alerts with a real notification
   channel and named on-call owner. The load-balancer backend must overwrite
   `x-ipo-one-edge-assertion` on every origin request with the base64url encoding
   of the exact raw bytes mounted from `ipo-one-edge-assertion-key`; client input
   with that name is never forwarded. Configure this value through the protected
   release secret-substitution path without printing it to logs or shell history.
   Agent mTLS termination must similarly overwrite
   `x-ipo-one-client-cert-sha256` with the verified client-certificate SHA-256.
8. Deploy `ipo-one-closed-pilot` with zero production traffic. Verify `/livez`,
   `/readyz`, OIDC, SIWE, Human lifecycle, Agent mTLS lifecycle, reconciliation,
   restart recovery, logs, rate limits and denied origin access.
9. Create a backup, restore it to an isolated temporary instance, verify the
    migration head and clean reconciliation, record immutable evidence, then
    delete the drill instance. A configured backup without a successful restore
    is not evidence.
10. Run the read-only cloud audit below. Complete
    `closed-non-funds-pilot.pending.json` only with real immutable evidence and
    approvers, then make the reviewed launch-policy revision. Finally switch the
    existing HTTPS URL map to the new backend. Preserve the previous Cloud Run
    revision, URL map and database restore point.

Cloud SQL hardening shape:

```sh
gcloud sql instances patch ipo-one-closed-pilot-db \
  --project ipo-one-public-sandbox-cptm511 \
  --clear-authorized-networks \
  --connector-enforcement REQUIRED \
  --ssl-mode ENCRYPTED_ONLY \
  --availability-type REGIONAL \
  --deletion-protection \
  --backup-start-time 18:00 \
  --retained-backups-count 14 \
  --enable-point-in-time-recovery \
  --retained-transaction-log-days 7
```

Google documents the Cloud Run built-in Cloud SQL Auth Proxy Unix socket as an
automatically encrypted public-IP path. Connector enforcement rejects direct
database connections:

- <https://cloud.google.com/sql/docs/postgres/connect-run>
- <https://cloud.google.com/sql/docs/postgres/language-connectors>
- <https://cloud.google.com/sdk/gcloud/reference/sql/instances/patch>

## Evidence and release checks

The audit is read-only and emits no secret values. Output is permitted only to
an ignored `*.local.json` file.

```sh
node scripts/audit-closed-pilot-cloud.mjs \
  --expected-sha "$(git rev-parse HEAD)" \
  --expected-image "$IMAGE_URI" \
  --output deploy/approvals/closed-pilot-cloud.local.json

pnpm run launch:verify -- \
  --evidence deploy/approvals/closed-non-funds-pilot.local.json \
  --profile closed_non_funds_pilot \
  --expected-sha "$(git rev-parse HEAD)"
```

The first command must report `ready: true`. The second must remain blocked
until the policy is reviewed and unlocked; an evidence file cannot self-approve
deployment.

## Rollback

Before traffic cutover, record the exact previous URL map, backend, Cloud Run
revision, image digest and database restore point. On failure: move traffic back
to the previous backend/revision, revoke the candidate's IdP and Agent
credentials, preserve logs and Evidence, restore from the recorded database
point only when data integrity requires it, and open the incident record. Never
restore service by enabling the `run.app` URL, broadening ingress, disabling
RLS, using an owner database credential, or relaxing authentication/WAF checks.
