# IPO.ONE V9 product traceability v1

Status: `IMPLEMENTED_UNVERIFIED`  
Task: `PRODUCT-002`  
Source baseline: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

This document is the human-readable review view of
`product/traceability/ipo-one.v9-product-traceability.v1.json`. The JSON
manifest is the machine authority for later V9 implementation tasks. The
repaired V9 reference prototype is an intent and interaction source only; it is
not a runtime, financial, release, or security authority.

## Classification contract

| Classification | Meaning |
| --- | --- |
| `REAL_LOCAL` | A checked-in local no-real-funds capability has a server operation or another explicit reviewed local authority, an adapter, and tests. |
| `REAL_TESTNET_READ` | A read-only Testnet capability is catalogued, access controlled, integrated into the product action, and has no mutation or funds authority. |
| `SIMULATION_ONLY` | The reference prototype can demonstrate the interaction, but its browser state or generated artifact is not server truth. |
| `SPECIFIED_DISABLED` | The capability is specified but deliberately disabled behind a named task or human gate. |
| `ABSENT` | No current product operation implements the action. |

The current matrix contains 38 `REAL_LOCAL`, zero `REAL_TESTNET_READ`, 12
`SIMULATION_ONLY`, 7 `SPECIFIED_DISABLED`, and 8 `ABSENT` actions. Zero
`REAL_TESTNET_READ` is intentional: a read-only chain observer exists in the
repository, but there is no catalogued and access-controlled V9 product action
that exposes its live output.

## Runtime binding contract

Every one of the 71 closed Tenant catalog operations has exactly one binding
in the machine manifest. Each binding records:

- request and result schema versions;
- the concrete handler module;
- the authorization-policy module;
- the admission and quota-policy module;
- durable core projection and event/outbox persistence modules;
- the HTTP UI/transport adapter;
- affected handler, transport, SDK, MCP, Provider, or browser tests.

The static gate imports the runtime catalog, handler registry, AuthZ policies,
and admission policies. It rejects missing or extra bindings, schema drift,
handler-kind drift, actor or capability drift, resource drift, quota drift,
public exposure, funds authority, nonexistent file references, and V9 actions
that claim unbound operations.

## Destination and action matrix

| Destination | Action ID | Classification | Server operations | Successor |
| --- | --- | --- | --- | --- |
| Overview | `overview.resume_owned_workspace` | `REAL_LOCAL` | `pilotReadWorkspaceResume, pilotReadHumanSelf` | V9-001 |
| Overview | `overview.submit_feedback` | `REAL_LOCAL` | `pilotSubmitPilotFeedback` | V9-001 |
| Overview | `overview.portfolio_totals_and_available_credit` | `ABSENT` | — | V9-001 |
| Request Credit | `request_credit.establish_human_subject_and_consent` | `REAL_LOCAL` | `pilotCreateHumanSubject, pilotCreateConsent, pilotReadConsent, pilotReadIdentityReference` | V9-002 |
| Request Credit | `request_credit.intent_decision_offer` | `REAL_LOCAL` | `pilotRequestCredit, pilotReadCreditApplication, pilotEvaluateCreditApplication` | V9-002 |
| Request Credit | `request_credit.accept_and_execute_sandbox_offer` | `REAL_LOCAL` | `pilotAcceptCreditOffer, pilotExecuteSandboxObligation` | V9-002 |
| Request Credit | `request_credit.bank_transfer_rail` | `SPECIFIED_DISABLED` | — | V9-002, REALVALUE-001 |
| Request Credit | `request_credit.best_available_router` | `ABSENT` | — | V9-002 |
| Request Credit | `request_credit.open_official_fee_policy` | `SPECIFIED_DISABLED` | — | V9-009 |
| Repay & Settle | `repay_settle.read_owned_obligation` | `REAL_LOCAL` | `pilotReadOwnObligation` | V9-003 |
| Repay & Settle | `repay_settle.post_sandbox_repayment` | `REAL_LOCAL` | `pilotPostSandboxRepayment` | V9-003 |
| Repay & Settle | `repay_settle.advance_servicing_clock` | `REAL_LOCAL` | `workerAdvanceSandboxServicing` | V9-003 |
| Repay & Settle | `repay_settle.payoff_quote` | `ABSENT` | — | V9-003 |
| Repay & Settle | `repay_settle.schedule_future_payment` | `ABSENT` | — | V9-003, V9-006 |
| Repay & Settle | `repay_settle.browser_receipt_exports` | `SIMULATION_ONLY` | — | V9-009 |
| Repay & Settle | `repay_settle.trading_facility_settlement` | `REAL_LOCAL` | `tradingRequestClose, tradingRunSettlement, tradingReadSettlement` | TC-104 |
| Credit Passport | `credit_passport.read_decision_passport` | `REAL_LOCAL` | `pilotReadCreditApplication` | V9-004 |
| Credit Passport | `credit_passport.private_artifact_lifecycle` | `REAL_LOCAL` | `pilotCreateCreditPassportArtifact, pilotReadOwnCreditPassportArtifact, pilotVerifyCreditPassportArtifact, pilotRevokeCreditPassportArtifact` | V9-004 |
| Credit Passport | `credit_passport.trading_no_funds_evidence` | `REAL_LOCAL` | `tradingCreateAccountBindingChallenge, tradingImportHyperliquidHistory, tradingFinalizeEvidenceSnapshot, tradingReadCreditProfile` | TC-101 |
| Credit Passport | `credit_passport.improvement_plan` | `ABSENT` | — | V9-004 |
| Obligations | `obligations.inspect_owned_obligation_and_evidence` | `REAL_LOCAL` | `pilotReadWorkspaceResume, pilotReadOwnObligation, pilotReadOwnObligationEvidence` | V9-005 |
| Obligations | `obligations.list_all_owned_obligations` | `ABSENT` | — | V9-005 |
| Obligations | `obligations.export_audit_receipt` | `SIMULATION_ONLY` | — | V9-009 |
| Agent Console | `agent_console.create_and_bind_agent` | `REAL_LOCAL` | `pilotCreateAgentSubject, pilotCreateAgentAccountChallenge, pilotSubmitAgentAccountProof, pilotReadAgentAccountBinding, pilotReadAgentSelf` | V9-006, WALLET-001 |
| Agent Console | `agent_console.manage_sandbox_mandate` | `REAL_LOCAL` | `pilotCreateDraftMandate, pilotReadMandate, pilotActivateSandboxMandate, pilotRevokeDraftMandate` | V9-006 |
| Agent Console | `agent_console.shared_credit_lifecycle` | `REAL_LOCAL` | `pilotRequestCredit, pilotReadCreditApplication, pilotEvaluateCreditApplication, pilotAcceptCreditOffer, pilotExecuteSandboxObligation, pilotPostSandboxRepayment, pilotReadOwnObligation, pilotReadOwnObligationEvidence, pilotSubmitPilotFeedback` | V9-006 |
| Agent Console | `agent_console.x402_credit_demo` | `SIMULATION_ONLY` | — | V9-006, V9-007 |
| Agent Console | `agent_console.edit_active_mandate` | `ABSENT` | — | V9-006 |
| Agent Console | `agent_console.remote_mcp_a2a` | `SPECIFIED_DISABLED` | — | V9-006 |
| Agent Console | `agent_console.export_events` | `SIMULATION_ONLY` | — | V9-009 |

V9-006 productizes the existing `REAL_LOCAL` Agent Console bindings without
adding authority. The workspace derives `agent_console_presentation.v1` from
the exact Principal-controlled Subject, hash-only AccountBinding, Mandate,
`agent_pilot_capability_manifest.v1`, `agent_mcp_registry.v2`, and authenticated
Tenant catalog. It displays 11 local stdio MCP tools, three typed local SDK
workflows, loopback OpenAPI discovery, and the explicit absence of remote MCP,
A2A, production workload credentials, public endpoints, real Provider
execution, real funds, and active-Mandate editing.

| Capital Network | `capital_network.provider_sandbox_loop` | `REAL_LOCAL` | `pilotReadProviderIntent, pilotAcknowledgeProviderIntent, workerProcessInbox` | V9-007 |
| Capital Network | `capital_network.matching_demo` | `REAL_LOCAL` | `tradingCreateCapitalRequest, tradingCreateProviderMandate, tradingListCompatibleMandates, tradingCreateMatchProposal, tradingAcceptMatchAsProvider, tradingAcceptMatchAsSubject` | TC-102 |
| Capital Network | `capital_network.synthetic_facility` | `REAL_LOCAL` | `tradingCreateFacility, tradingContributeSubjectCollateral, tradingRecordProviderFunding, tradingActivateFacility, tradingSubmitOrderIntent, tradingCancelOrderIntent, tradingReadFacilityState` | TC-103 |
| Capital Network | `capital_network.join_and_fund_network` | `SPECIFIED_DISABLED` | — | V9-007, REALVALUE-001 |
| Capital Network | `capital_network.earnings_waterfall` | `SIMULATION_ONLY` | — | V9-007, V9-009 |
| Wallet & Permissions | `wallet_permissions.human_wallet_authentication` | `REAL_LOCAL` | — | WALLET-001, WALLET-002 |
| Wallet & Permissions | `wallet_permissions.consent_controls` | `REAL_LOCAL` | `pilotReadConsent, pilotRevokeConsent` | WALLET-001 |
| Wallet & Permissions | `wallet_permissions.agent_binding_and_mandate_state` | `REAL_LOCAL` | `pilotReadAgentAccountBinding, pilotReadMandate, pilotRevokeDraftMandate` | WALLET-001 |
| Wallet & Permissions | `wallet_permissions.asset_and_session_key_grants` | `SIMULATION_ONLY` | — | WALLET-001, WALLET-003 |
| Wallet & Permissions | `wallet_permissions.eip6963_multiwallet_discovery` | `REAL_LOCAL` | — | WALLET-001 |
| Wallet & Permissions | `wallet_permissions.mobile_qr_contract_wallet` | `SPECIFIED_DISABLED` | — | WALLET-003 |
| Wallet & Permissions | `wallet_permissions.invalidate_session_on_provider_change` | `REAL_LOCAL` | — | WALLET-002 |
| Activity & Proofs | `activity_proofs.read_and_verify_evidence` | `REAL_LOCAL` | `pilotReadOwnObligationEvidence, pilotReadEvidence` | V9-005 |
| Activity & Proofs | `activity_proofs.testnet_chain_observation` | `ABSENT` | — | V9-005 |
| Activity & Proofs | `activity_proofs.browser_activity_export` | `SIMULATION_ONLY` | — | V9-009 |
| Activity & Proofs | `activity_proofs.trading_facility_proof` | `REAL_LOCAL` | `tradingIssuePerformanceProof, tradingReadFacilityEvidence` | TC-104 |
| Credit Track Record | `credit_track_record.read_evidence_derived_record` | `REAL_LOCAL` | `pilotReadOwnObligationEvidence, pilotReadCreditApplication` | V9-004 |
| Credit Track Record | `credit_track_record.import_wallet_history` | `SIMULATION_ONLY` | — | V9-004, WALLET-003 |
| Credit Track Record | `credit_track_record.simulate_impact` | `SIMULATION_ONLY` | — | V9-004 |
| Credit Track Record | `credit_track_record.generate_report` | `SIMULATION_ONLY` | — | V9-009 |
| Reports & Exports | `reports_exports.generate_official_artifact` | `ABSENT` | — | V9-009 |
| Reports & Exports | `reports_exports.prototype_downloads` | `SIMULATION_ONLY` | — | V9-009 |
| Reports & Exports | `reports_exports.verify_calculation` | `ABSENT` | — | V9-009 |
| Risk & Operations | `risk_operations.read_portfolio_health_feedback_and_queue` | `REAL_LOCAL` | `pilotReadTenantRisk, pilotReadPilotHealth, pilotReadPilotFeedbackSummary, pilotReadServicingQueue` | V9-008 |
| Risk & Operations | `risk_operations.freeze_subject` | `REAL_LOCAL` | `pilotFreezeSubject` | V9-008 |
| Risk & Operations | `risk_operations.trading_shadow_protection` | `REAL_LOCAL` | `tradingEvaluateRisk, tradingPauseNewRisk, tradingFlattenFacility` | TC-103 |

For `wallet_permissions.mobile_qr_contract_wallet`, WALLET-003 now contains
reviewable ERC-1271 and fixed mobile-connector adapters plus local tests. The
classification remains `SPECIFIED_DISABLED`: the exact connector dependency
and lifecycle have been reviewed, and the approved Base Sepolia contract has
passed real EIP-191 and EIP-712 ERC-1271 acceptance, but mobile/QR runtime
enablement, owner-managed Project configuration, real mobile E2E, and release
approval remain separate disabled gates.
| Risk & Operations | `risk_operations.resolve_sandbox_servicing` | `REAL_LOCAL` | `pilotRestructureSandboxObligation, pilotRepurchaseSandboxObligation, pilotWriteOffSandboxObligation` | V9-008 |
| Risk & Operations | `risk_operations.inspect_checked_in_policy` | `REAL_LOCAL` | — | V9-008 |
| Risk & Operations | `risk_operations.generic_emergency_mutations` | `SPECIFIED_DISABLED` | — | V9-008 |
| Architecture | `architecture.inspect_machine_contracts` | `REAL_LOCAL` | — | V9-008 |
| Architecture | `architecture.export_prototype_map` | `SIMULATION_ONLY` | — | V9-008 |
| Fee and revenue boundaries | `fee_revenue.read_sandbox_economics` | `REAL_LOCAL` | `pilotReadCreditApplication, pilotReadOwnObligation, pilotPostSandboxRepayment` | V9-009 |
| Fee and revenue boundaries | `fee_revenue.production_fee_policy` | `SPECIFIED_DISABLED` | — | V9-009, REALVALUE-001 |
| Fee and revenue boundaries | `fee_revenue.provider_share_and_waterfall` | `SIMULATION_ONLY` | — | V9-007, V9-009 |
| Fee and revenue boundaries | `fee_revenue.pnl_percentage_fee` | `SPECIFIED_DISABLED` | — | V9-009, REALVALUE-001 |

## Hard boundaries carried forward

- The current protocol maturity remains `local_non_funds`.
- All 71 Tenant operations remain non-public and carry
  `fundsAuthority: false`.
- The only release-enabled launch profile remains `public_sandbox`.
- `closed_non_funds_pilot` and `controlled_agent_credit_pilot` remain locked.
- Browser state, prototype downloads, diagrams, simulated matching, score
  projections, and fee examples cannot become financial or Evidence truth.
- Provider execution remains a fixed loopback no-funds sandbox.
- Wallet login is authentication only; it is not an allowance, withdrawal,
  session-key, or arbitrary signing grant.
- `PRODUCT-002` adds no migration, API operation, funds path, Testnet mutation,
  mainnet path, production dependency, deployment, or release approval.

## CI use

Run:

```sh
pnpm run check:product-traceability
```

The gate is also part of `pnpm check`. Later V9 tasks must update the manifest
and its reviewed evidence in the same change whenever an action classification
or binding changes. A UI implementation may not change an action to
`REAL_LOCAL` merely because the screen is clickable.
