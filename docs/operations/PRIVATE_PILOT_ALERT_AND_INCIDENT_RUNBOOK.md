# IPO.ONE Private-Pilot Alert and Incident Runbook

Status: Local no-real-funds response baseline with durable internal alert and
synthetic-run storage. Notification delivery, named owners, hosted scheduling,
product acknowledgement/resolution permissions, production access, and
real-value actions remain open.

Policy: `modules/operations-control/policy/private-pilot-alert-policy.v1.json`

## Purpose and Boundary

Use this runbook to interpret `operational_alert.v1` candidates and internal
`operational_alert_state.v1` projections produced by the local private-pilot
runtime. Durable state proves replay-safe occurrence history, not notification
delivery, acknowledgement, incident declaration, authorization, approval, or command.

The evaluator never freezes or unfreezes a Subject, pauses a Provider, changes
a credit limit, repairs a projection, writes off an Obligation, releases a
deployment, or moves funds. Every action below is manual and must pass the
existing Authentication, Authorization, Approval, Admission, and Evidence
boundaries for the target environment.

## Common Intake

1. Confirm `schemaVersion=operational_alert.v1` for a candidate or
   `schemaVersion=operational_alert_state.v1` for durable state,
   `policyVersion=ops_001b.v1`, `environment=closed-pilot`,
   `sandboxOnly=true`, and `productionFundsMoved=false`.
2. Open the referenced runbook using `runbookRef`. Do not infer source identity
   by brute-forcing `scopeRefHash` or `evidenceRefHashes`.
3. Resolve source Evidence through an authorized, tenant-scoped operator tool.
   Do not copy PII, credentials, wallet proofs, raw account identifiers, or
   request payloads into the incident record.
4. Preserve release identity, alert ID/fingerprint, first/last observation,
   occurrence count, Evidence hashes, and the operator's separately authorized
   incident/change reference.
5. Treat `actionCodes` as required review steps. They never grant the capability
   to execute the corresponding product command.
6. Keep readiness fail-closed until the specific closure evidence below exists.

## Routing Matrix

| Runbook reference | Signal | Route | Readiness effect | Initial manual posture |
| --- | --- | --- | --- | --- |
| `OPS-RUNBOOK-RECONCILIATION` | Failed full reconciliation | Page | Fail closed | Preserve Evidence; stop affected writers; use the reconciliation runbook |
| `OPS-RUNBOOK-CHAIN-FINALITY` | Invalidated payment-chain Evidence | Page | Fail closed | Stop applying the affected payment; verify finality and replay state |
| `OPS-RUNBOOK-BREAK-GLASS` | Break-glass incident activated | Page | Fail closed | Verify exact scope, custodians, expiry, and protective-only action set |
| `OPS-RUNBOOK-ADMISSION` | Authenticated admission store unavailable | Page | Fail closed | Keep private commands fail-closed; inspect the quota-store boundary |
| `OPS-RUNBOOK-SYNTHETIC-LIFECYCLE` | Full lifecycle synthetic failed | Page | Fail closed | Preserve release/check Evidence and diagnose the failed stage |
| `OPS-RUNBOOK-SERVICING-DEFAULT` | Obligation entered default | Risk queue | Review required | Open a servicing case; verify DPD and permitted resolution options |
| `OPS-RUNBOOK-SERVICING-WRITEOFF` | Write-off executed | Risk queue | Review required | Confirm dual-control, Ledger, servicing, and Evidence linkage |

There is intentionally no numeric time, exposure, loss, or stop-loss threshold
in this baseline. Those values require an approved SLO/risk policy and named
owners. Event presence alone creates the candidate.

## OPS-RUNBOOK-RECONCILIATION

Follow `docs/operations/RECONCILIATION_RUNBOOK.md`. A failed summary blocks
private-pilot readiness. Preserve the run and discrepancy Evidence; stop the
affected writer class; use dry-run projection planning first. Never edit Event,
Evidence, Ledger, or snapshot rows. Repair requires the existing exact-command
approval path, and closure requires a new full reconciliation with zero critical
discrepancies plus linked incident/change Evidence.

## OPS-RUNBOOK-CHAIN-FINALITY

Treat `payment_chain_invalidated` as a reversal of chain confidence, not as a
new repayment fact. Stop applying the affected payment/Obligation writer path,
preserve the finality proof and canonical payment reference through authorized
Evidence reads, then run the chain replay/reorg checks described in
`docs/security/IPO_ONE_CHAIN_001B_TESTNET_RUNBOOK_v0.1.md`. Do not resubmit a
transaction, rotate a key, deploy a contract, or switch a provider from this
alert. Closure requires a reviewed canonical replacement/final state and
reconciliation with no unexplained divergence.

## OPS-RUNBOOK-BREAK-GLASS

Confirm the durable incident is active, unexpired, separately confirmed by the
configured custodians, and restricted to the recorded protective resources and
actions. Break glass cannot approve deployment, change notification targets,
unfreeze, increase exposure, withdraw, or move funds. Preserve every custodian
decision and action Evidence. Closure requires the existing incident close plus
independent post-incident review; expiration alone is not closure.

## OPS-RUNBOOK-ADMISSION

Keep authenticated private commands fail-closed. Do not bypass admission,
disable RLS, increase hard ceilings, reuse another Tenant's lease, or retry a
high-impact command automatically. Inspect store health, lease expiry, database
connectivity, and low-cardinality telemetry using the sequence in
`docs/operations/ABUSE_CONTROL_RUNBOOK.md`. After recovery, prove a bounded
admission, exact replay, denial behavior, and no resource-count drift before
restoring the affected surface.

## OPS-RUNBOOK-SYNTHETIC-LIFECYCLE

Bind the failure to the immutable release/check Evidence. Identify
`failureStage` across Human Offer, Agent Offer, Offer parity, Human
Obligation/repayment, Agent Obligation/repayment, receipt linkage, Obligation
parity, and full reconciliation. Resolve the hashed evidence through authorized
source systems; raw receipts and executor messages are deliberately absent.
Do not reset production-like state or relabel the historical DEMO as a passing
commercial flow. A single diagnostic rerun may be used only after the cause is
understood; closure requires a complete no-funds lifecycle on the same reviewed
release and no unexplained reconciliation difference. OPS-001C provides the
callable runner and durable Tenant-RLS result store, but hosted scheduling and
external notification delivery are not implemented.

## OPS-RUNBOOK-SERVICING-DEFAULT

Open a tenant-scoped servicing case through an approved operator surface.
Verify the trusted-clock DPD calculation, oldest unpaid installment, current
servicing state hash, repayment allocation, and Evidence before proposing an
action. Available sandbox resolutions remain restructure, repurchase, and
write-off under their current exact-state and dual-control policies. Do not send
a borrower notice, start collections, infer legal default, or execute a
resolution directly from the alert. Closure requires cure or an approved
resolution plus updated Obligation, Ledger where applicable, and Evidence.

## OPS-RUNBOOK-SERVICING-WRITEOFF

Confirm the write-off used the exact current servicing-state hash, approved
proposal/version, distinct authorized decision set, single execution record,
balanced write-off Ledger transaction, and servicing action/Event/Evidence
links. Do not treat a write-off as debt forgiveness, tax treatment, legal
notice, or permission to alter prior events. Close the review only after
reconciliation passes and the incident/change record retains the approval,
execution, servicing, Ledger, and Evidence references.

## Closure and Handoff Evidence

Every closed incident or servicing case must retain:

- alert ID and fingerprint;
- policy and release versions;
- bounded source Evidence references;
- authorized incident/change reference;
- actions taken through their real command/audit records;
- reconciliation or lifecycle verification result; and
- reviewer identity through the approved private identity system.

OPS-001C does not provide the final reviewer identity system, acknowledgement/
resolution command permissions, scheduler, or notification provider. Until
named recipients, named owners, escalation rota, retention, protected scheduled
checks, and deployment evidence are configured and tested, the closed-pilot
operations gate remains open.
