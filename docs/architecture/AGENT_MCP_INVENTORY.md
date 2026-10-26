# Existing MCP tool, protocol and authorization inventory

Generated from existing adapters, Tenant protocol schemas/catalog and authorization policy.
This is a drift snapshot, not an authority registry or a new tool surface.
Full schema references and SHA-256 bindings, operation metadata and authorization
fields are in [agent-mcp-registry.json](agent-mcp-registry.json).

Only the 15 main Agent tools belong to the existing local stdio Host. Other families
are enumerated separately; their existence grants no activation or remote exposure.
AuthenticationContext is created by the Host; all tool arguments (including Subject
and authority references) are untrusted. AgentTenantCommandClient validates the
canonical envelope and injects context. Gateway admission, current credential/
membership/object checks, exact command hash, commit-time revalidation, atomic
audit and durable idempotency remain authoritative. Runtime Offer acceptance pins
the current Offer/terms/acknowledgement hashes in the existing domain handlers.

Schema bindings resolve local definitions before hashing. Tool schemas are discovery
contracts; canonical request/result schemas and domain authorization remain mandatory.
Regenerate intentionally with `node scripts/check-agent-mcp-registry.mjs --write`;
review all policy/schema changes before accepting a regenerated snapshot.

## agent — 15 tools

| Tool → operation | Result schema | Capability / resource | Ownership / actors | Protocol / policy idempotency; live checks |
| --- | --- | --- | --- | --- |
| `ipo_one_read_self` → `pilotReadAgentSelf` | tenant_agent_subject_view.v2 | subject.read.self / subject | actor / agent | prohibited / optional; none in policy; domain checks still apply |
| `ipo_one_request_credit` → `pilotRequestCredit` | tenant_credit_intent_created.v1 | credit.request / subject | actor / human, agent | required / required; credit_authority, risk, cap, freeze |
| `ipo_one_read_credit_application` → `pilotReadCreditApplication` | tenant_credit_application_view.v2 | credit.read.self / credit_intent | actor / human, agent | prohibited / optional; none in policy; domain checks still apply |
| `ipo_one_evaluate_credit_application` → `pilotEvaluateCreditApplication` | tenant_credit_application_evaluated.v2 | credit.evaluate.self / credit_intent | actor / human, agent | required / required; credit_intent_state |
| `ipo_one_submit_account_proof` → `pilotSubmitAgentAccountProof` | tenant_agent_account_proof_verified.v1 | agent_account.proof.submit.self / subject | actor / agent | required / required; none in policy; domain checks still apply |
| `ipo_one_read_account_binding` → `pilotReadAgentAccountBinding` | tenant_agent_account_binding_view.v1 | agent_account.binding.read.self / subject | actor / human, agent | prohibited / optional; none in policy; domain checks still apply |
| `ipo_one_read_obligation` → `pilotReadOwnObligation` | tenant_owned_obligation_view.v1 | obligation.read.owned / obligation | actor / human, agent | prohibited / optional; none in policy; domain checks still apply |
| `ipo_one_read_obligation_evidence` → `pilotReadOwnObligationEvidence` | tenant_owned_obligation_evidence_view.v1 | evidence.read.owned / evidence | actor / human, agent | prohibited / optional; none in policy; domain checks still apply |
| `ipo_one_accept_credit_offer` → `pilotAcceptCreditOffer` | tenant_credit_offer_accepted.v1 | credit.offer.accept.self / credit_offer | actor / human, agent | required / required; credit_offer_state |
| `ipo_one_execute_sandbox_obligation` → `pilotExecuteSandboxObligation` | tenant_sandbox_obligation_executed.v1 | credit.execute.sandbox.self / obligation | actor / human, agent | required / required; obligation_execution_state |
| `ipo_one_post_sandbox_repayment` → `pilotPostSandboxRepayment` | tenant_sandbox_repayment_posted.v1 | repayment.post.sandbox.self / obligation | actor / human, agent | required / required; obligation_repayment_state |
| `ipo_one_read_credit_registry_evidence` → `pilotReadCreditRegistryEvidence` | tenant_credit_registry_evidence_view.v1 | credit_registry.evidence.read.tenant / credit_registry_evidence | tenant / human, agent, risk_operator, operations_operator, auditor | prohibited / prohibited; none in policy; domain checks still apply |
| `ipo_one_read_credit_state` → `pilotReadOwnCreditState` | tenant_owned_credit_state_view.v1 | credit_passport.read.self / subject | actor / human, agent | prohibited / optional; none in policy; domain checks still apply |
| `ipo_one_file_pilot_case` → `pilotFileCase` | tenant_pilot_case_filed.v1 | pilot.case.file.self / subject | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_list_pilot_cases` → `pilotListOwnCases` | tenant_pilot_case_list.v1 | pilot.case.read.self / subject | actor / human, agent | prohibited / prohibited; none in policy; domain checks still apply |

## wallet-execution — 13 tools

| Tool → operation | Result schema | Capability / resource | Ownership / actors | Protocol / policy idempotency; live checks |
| --- | --- | --- | --- | --- |
| `ipo_one_wallet_prepare_account_binding` → `walletPrepareAccountBinding` | tenant_execution_account_binding_challenge_created.v1 | wallet.account_binding.prepare.owned / subject | actor / human, agent | required / required; subject_state, chain_policy |
| `ipo_one_wallet_submit_account_binding` → `walletSubmitAccountBinding` | tenant_execution_account_binding_verified.v1 | wallet.account_binding.submit.owned / subject | actor / human, agent | required / required; subject_state, chain_policy |
| `ipo_one_wallet_read_account_bindings` → `walletReadAccountBindings` | tenant_execution_account_bindings_view.v1 | wallet.account_binding.read.owned / subject | actor / human, agent | prohibited / prohibited; subject_state |
| `ipo_one_wallet_revoke_account_binding` → `walletRevokeAccountBinding` | tenant_execution_account_binding_revoked.v1 | wallet.account_binding.revoke.owned / subject | actor / human, agent | required / required; subject_state, account_binding |
| `ipo_one_wallet_discover_capabilities` → `walletDiscoverCapabilities` | wallet_capability_descriptor_list.v1 | wallet.capabilities.discover / wallet_adapter | tenant / human, agent | prohibited / prohibited; adapter_state, chain_policy |
| `ipo_one_wallet_prepare_grant` → `walletPrepareGrant` | tenant_wallet_grant_prepared.v1 | wallet.grant.prepare.owned / subject | actor / human | required / required; subject_state, mandate, spend_policy, credit_line, obligation, account_binding, chain_policy |
| `ipo_one_wallet_activate_grant` → `walletActivateGrant` | tenant_wallet_grant_activated.v1 | wallet.grant.activate.owned / delegated_wallet_grant | actor / human | required / required; grant_state, mandate, spend_policy, credit_line, obligation, account_binding, chain_policy, freeze |
| `ipo_one_wallet_read_grant` → `walletReadGrant` | tenant_wallet_grant_view.v1 | wallet.grant.read.owned / delegated_wallet_grant | actor / human, agent | prohibited / prohibited; grant_state |
| `ipo_one_wallet_revoke_grant` → `walletRevokeGrant` | tenant_wallet_grant_revoked.v1 | wallet.grant.revoke.owned / delegated_wallet_grant | actor / human | required / required; grant_state |
| `ipo_one_wallet_prepare_execution` → `walletPrepareExecution` | tenant_wallet_execution_prepared.v1 | wallet.execution.prepare.owned / delegated_wallet_grant | actor / human, agent | required / required; grant_state, mandate, spend_policy, credit_line, obligation, account_binding, adapter_state, chain_policy, freeze |
| `ipo_one_wallet_approve_execution` → `walletApproveExecution` | tenant_wallet_execution_approved.v1 | wallet.execution.approve.owned / wallet_execution | actor / human | required / required; execution_state, grant_state, freeze |
| `ipo_one_wallet_submit_execution` → `walletSubmitExecution` | tenant_wallet_execution_submission_blocked.v1 | wallet.execution.submit.owned / wallet_execution | actor / human, agent | required / required; execution_state, grant_state, mandate, spend_policy, credit_line, obligation, account_binding, adapter_state, chain_policy, freeze |
| `ipo_one_wallet_read_execution` → `walletReadExecution` | tenant_wallet_execution_view.v1 | wallet.execution.read.owned / wallet_execution | actor / human, agent | prohibited / prohibited; execution_state |

## venue-execution — 8 tools

| Tool → operation | Result schema | Capability / resource | Ownership / actors | Protocol / policy idempotency; live checks |
| --- | --- | --- | --- | --- |
| `ipo_one_venue_discover_capabilities` → `venueDiscoverCapabilities` | venue_capability_descriptor_list.v1 | venue.capabilities.discover / venue_adapter | tenant / human, agent | prohibited / prohibited; adapter_state, venue_policy |
| `ipo_one_venue_read_binding` → `venueReadBinding` | tenant_venue_binding_view.v1 | venue.binding.read.owned / venue_binding | actor / human, agent | prohibited / prohibited; binding_state |
| `ipo_one_venue_prepare_delegate` → `venuePrepareDelegate` | tenant_venue_delegate_prepared.v1 | venue.delegate.prepare.owned / venue_binding | actor / human | required / required; binding_state, mandate, facility, venue_policy, freeze |
| `ipo_one_venue_activate_delegate` → `venueActivateDelegate` | tenant_venue_delegate_activation_blocked.v1 | venue.delegate.activate.owned / venue_delegate | actor / human | required / required; delegate_state, binding_state, mandate, facility, venue_policy, freeze |
| `ipo_one_venue_revoke_delegate` → `venueRevokeDelegate` | tenant_venue_delegate_revocation_blocked.v1 | venue.delegate.revoke.owned / venue_delegate | actor / human | required / required; delegate_state, binding_state, freeze |
| `ipo_one_venue_prepare_execution` → `venuePrepareExecution` | tenant_venue_execution_prepared.v1 | venue.execution.prepare.owned / venue_delegate | actor / human, agent | required / required; delegate_state, binding_state, mandate, facility, order_intent, venue_policy, freeze |
| `ipo_one_venue_submit_execution` → `venueSubmitExecution` | tenant_venue_execution_submission_blocked.v1 | venue.execution.submit.owned / venue_execution | actor / human, agent | required / required; execution_state, delegate_state, binding_state, mandate, facility, order_intent, venue_policy, freeze |
| `ipo_one_venue_read_execution` → `venueReadExecution` | tenant_venue_execution_view.v1 | venue.execution.read.owned / venue_execution | actor / human, agent | prohibited / prohibited; execution_state |

## trading-capital — 28 tools

| Tool → operation | Result schema | Capability / resource | Ownership / actors | Protocol / policy idempotency; live checks |
| --- | --- | --- | --- | --- |
| `ipo_one_trading_create_account_binding_challenge` → `tradingCreateAccountBindingChallenge` | tenant_trading_account_binding_challenge_created.v2 | trading.account_challenge.create.self / subject | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_import_hyperliquid_history` → `tradingImportHyperliquidHistory` | tenant_trading_history_imported.v2 | trading.history_import.self / trading_credit_profile | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_finalize_evidence_snapshot` → `tradingFinalizeEvidenceSnapshot` | tenant_trading_evidence_snapshot_finalized.v2 | trading.evidence_finalize.self / trading_credit_profile | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_read_credit_profile` → `tradingReadCreditProfile` | tenant_trading_credit_profile_view.v2 | trading.credit_profile.read.self / trading_credit_profile | actor / human, agent | prohibited / prohibited; none in policy; domain checks still apply |
| `ipo_one_trading_create_capital_request` → `tradingCreateCapitalRequest` | tenant_trading_capital_request_created.v1 | trading.capital_request.create.self / trading_credit_profile | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_create_provider_mandate` → `tradingCreateProviderMandate` | tenant_trading_provider_mandate_created.v1 | trading.provider_mandate.create.owned / provider | actor / provider | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_list_compatible_mandates` → `tradingListCompatibleMandates` | trading_compatible_mandate_list.v1 | trading.compatible_mandate.list.self / trading_capital_request | actor / human, agent | prohibited / prohibited; none in policy; domain checks still apply |
| `ipo_one_trading_create_match_proposal` → `tradingCreateMatchProposal` | tenant_trading_match_proposal_created.v1 | trading.match_proposal.create.self / trading_capital_request | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_accept_match_as_provider` → `tradingAcceptMatchAsProvider` | tenant_trading_match_provider_accepted.v1 | trading.match.accept.provider / trading_match_proposal | actor / provider | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_accept_match_as_subject` → `tradingAcceptMatchAsSubject` | tenant_trading_match_subject_accepted.v1 | trading.match.accept.subject / trading_match_proposal | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_create_facility` → `tradingCreateFacility` | tenant_trading_facility_created.v1 | trading.facility.create.self / trading_match_proposal | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_contribute_subject_collateral` → `tradingContributeSubjectCollateral` | tenant_trading_subject_collateral_recorded.v1 | trading.facility.collateral.record.self / trading_facility | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_record_provider_funding` → `tradingRecordProviderFunding` | tenant_trading_provider_funding_recorded.v1 | trading.facility.funding.record.provider / trading_facility | actor / provider | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_activate_facility` → `tradingActivateFacility` | tenant_trading_facility_activated.v1 | trading.facility.activate.self / trading_facility | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_submit_order_intent` → `tradingSubmitOrderIntent` | tenant_trading_order_intent_submitted.v1 | trading.order_intent.submit.self / trading_facility | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_cancel_order_intent` → `tradingCancelOrderIntent` | tenant_trading_order_intent_canceled.v1 | trading.order_intent.cancel.self / trading_order_intent | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_read_facility_state` → `tradingReadFacilityState` | trading_facility_state.v1 | trading.facility.read.bound / trading_facility | actor / human, agent, provider | prohibited / prohibited; none in policy; domain checks still apply |
| `ipo_one_trading_evaluate_risk` → `tradingEvaluateRisk` | tenant_trading_facility_risk_evaluated.v1 | trading.facility.risk.evaluate.tenant / trading_facility | tenant / risk_operator, operations_operator | required / required; risk, reconciliation |
| `ipo_one_trading_pause_new_risk` → `tradingPauseNewRisk` | tenant_trading_facility_new_risk_paused.v1 | trading.facility.pause.tenant / trading_facility | tenant / risk_operator, operations_operator | required / required; risk, reconciliation |
| `ipo_one_trading_flatten_facility` → `tradingFlattenFacility` | tenant_trading_facility_flattened.v1 | trading.facility.flatten.tenant / trading_facility | tenant / risk_operator, operations_operator | required / required; risk, reconciliation |
| `ipo_one_trading_request_close` → `tradingRequestClose` | tenant_trading_facility_close_requested.v1 | trading.facility.close_request.self / trading_facility | actor / human, agent | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_run_settlement` → `tradingRunSettlement` | tenant_trading_settlement_finalized.v1 | trading.settlement.run.worker / trading_facility_close_request | tenant / system_worker | required / required; risk, reconciliation |
| `ipo_one_trading_read_settlement` → `tradingReadSettlement` | trading_settlement_view.v1 | trading.settlement.read.bound / trading_settlement | actor / human, agent, provider | prohibited / prohibited; none in policy; domain checks still apply |
| `ipo_one_trading_issue_performance_proof` → `tradingIssuePerformanceProof` | tenant_trading_performance_proof_issued.v1 | trading.performance_proof.issue.bound / trading_settlement | actor / human, agent, provider | required / required; none in policy; domain checks still apply |
| `ipo_one_trading_read_facility_evidence` → `tradingReadFacilityEvidence` | trading_facility_evidence.v1 | trading.facility.evidence.read.bound / trading_facility | actor / human, agent, provider | prohibited / prohibited; none in policy; domain checks still apply |
| `ipo_one_agent_create_secured_facility_authorization` → `agentCreateSecuredFacilityAuthorization` | tenant_agent_secured_facility_authorization_created.v1 | agent.facility_authorization.create.owned / trading_facility | actor / human | required / required; none in policy; domain checks still apply |
| `ipo_one_agent_read_secured_facility_authorization` → `agentReadSecuredFacilityAuthorization` | tenant_agent_secured_facility_authorization_ready.v1 | agent.facility_authorization.read.bound / trading_facility | actor / human, agent | prohibited / prohibited; none in policy; domain checks still apply |
| `ipo_one_agent_revoke_secured_facility_authorization` → `agentRevokeSecuredFacilityAuthorization` | tenant_agent_secured_facility_authorization_revoked.v1 | agent.facility_authorization.revoke.owned / trading_facility | actor / human | required / required; none in policy; domain checks still apply |

## secured-pool — 2 tools

| Tool → operation | Result schema | Capability / resource | Ownership / actors | Protocol / policy idempotency; live checks |
| --- | --- | --- | --- | --- |
| `ipo_one_read_secured_pool` → `pilotReadOwnSecuredPool` | tenant_secured_pool_workspace.v1 | pool.read.self / subject | actor / human, agent | prohibited / prohibited; pool_binding, pool_reconciliation |
| `ipo_one_review_secured_pool_action` → `pilotReviewSecuredPoolAction` | tenant_secured_pool_action_review.v1 | pool.action.review.self / subject | actor / human, agent | prohibited / prohibited; pool_binding, pool_oracle, pool_reconciliation, pool_risk_control |
