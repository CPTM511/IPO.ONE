import {
  DomainError,
  flattenTradingFacility,
  hashId,
  submitTradingOrderIntent
} from "../../../packages/domain/src/index.js";
import {
  HyperliquidExecutionActionKind,
  HyperliquidExecutionNonceState,
  HyperliquidTestnetExecutionGateway,
  InMemoryHyperliquidExecutionRepository,
  SimulatedHyperliquidExchangeTransport,
  SimulatedIsolatedHyperliquidSigner
} from "../../hyperliquid-execution/src/index.js";
import {
  HyperliquidReconciliationObservationKind,
  HyperliquidReconciliationStatus,
  HyperliquidTestnetReconciliationService,
  HyperliquidVenueOrderStatus,
  InMemoryHyperliquidReconciliationRepository,
  ScriptedHyperliquidVenueObservationAdapter,
  SimulatedHyperliquidReconciliationCommandGuard,
  SimulatedHyperliquidReconciliationKernelResolver,
  createSimulatedHyperliquidVenueObservation
} from "../../hyperliquid-reconciliation/src/index.js";
import { calculateTestnetSettlementWaterfall } from "../../hyperliquid-settlement/src/index.js";
import {
  acceptAgentCreditOffer,
  applyAgentCreditRepayment,
  createAgentCreditIdentity,
  createAgentCreditOffer
} from "./credit.js";
import {
  AGENT_CREDIT_EXECUTION_POLICY,
  agentCreditExecutionCapabilityDescriptor,
  authorizeAgentExecutionIntent
} from "./policy.js";

const HASH = /^0x[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;
const PREPARED_TTL_MS = 30_000;

function clone(value) {
  return structuredClone(value);
}

function exact(value, keys, code = "invalid_agent_credit_execution_input") {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new DomainError(code, "input has an invalid closed shape");
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !ID.test(value)) {
    throw new DomainError(
      "invalid_agent_credit_execution_input",
      `${name} is invalid`
    );
  }
  return value;
}

function hash(name, value) {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new DomainError(
      "invalid_agent_credit_execution_input",
      `${name} is invalid`
    );
  }
  return value;
}

function initialState({ finalEquityMinor }) {
  return {
    finalEquityMinor,
    runId: null,
    stage: "EMPTY",
    identity: null,
    offerState: null,
    credit: null,
    binding: null,
    orderIntent: null,
    prepared: [],
    executions: [],
    reconciliation: null,
    waterfall: null,
    repayment: null,
    performance: null,
    evidence: [],
    denials: [],
    frozen: false,
    reconciliationBlocked: false,
    schemaVersion: "agent_credit_execution_runtime_state.v1"
  };
}

export class AgentCreditExecutionRuntime {
  #state;
  #clock;
  #executionRepository;
  #reconciliationRepository;
  #executionTransport;
  #crashPoint;

  constructor({
    clock = Date.now,
    crashPoint = null,
    finalEquityMinor = "1100",
    snapshot = null,
    ...unknown
  } = {}) {
    if (
      Object.keys(unknown).length !== 0 ||
      typeof clock !== "function" ||
      ![null, "during_repayment"].includes(crashPoint) ||
      !/^(?:0|[1-9][0-9]{0,77})$/.test(finalEquityMinor)
    ) {
      throw new DomainError(
        "invalid_agent_credit_execution_configuration",
        "closed deterministic runtime configuration is required"
      );
    }
    this.#clock = clock;
    this.#crashPoint = crashPoint;
    this.#state = snapshot?.state
      ? clone(snapshot.state)
      : initialState({ finalEquityMinor });
    this.#executionRepository = new InMemoryHyperliquidExecutionRepository(
      snapshot?.executionRepository
    );
    this.#reconciliationRepository =
      new InMemoryHyperliquidReconciliationRepository(
        snapshot?.reconciliationRepository
      );
    this.#executionTransport = new SimulatedHyperliquidExchangeTransport();
  }

  get creditProvider() {
    return Object.freeze({
      authenticate: (input) => this.authenticate(input),
      discoverCapabilities: (input) => this.discoverCredit(input),
      requestCredit: (input) => this.requestCredit(input),
      readOffer: (input) => this.readOffer(input),
      acceptOffer: (input) => this.acceptOffer(input),
      readFacility: (input) => this.readFacility(input),
      repay: (input) => this.repay(input),
      readEvidence: (input) => this.readEvidence(input),
      readPerformance: (input) => this.readPerformance(input)
    });
  }

  get executionVenue() {
    return Object.freeze({
      discoverCapabilities: (input) => this.discoverVenue(input),
      bindAccount: (input) => this.bindAccount(input),
      readAccount: (input) => this.readAccount(input),
      prepareExecution: (input) => this.prepareExecution(input),
      submitExecution: (input) => this.submitExecution(input),
      readExecution: (input) => this.readExecution(input),
      reconcile: (input) => this.reconcile(input)
    });
  }

  now(offsetMs = 0) {
    return new Date(this.#clock() + offsetMs);
  }

  exportSnapshot() {
    return clone({
      state: this.#state,
      executionRepository: this.#executionRepository.exportSnapshot(),
      reconciliationRepository:
        this.#reconciliationRepository.exportSnapshot(),
      schemaVersion: "agent_credit_execution_runtime_snapshot.v1"
    });
  }

  inspect() {
    return clone({
      state: this.#state,
      executionSubmissionCount: this.#executionTransport.submissionHashes.length,
      executionRepository: this.#executionRepository.exportSnapshot(),
      reconciliationRepository:
        this.#reconciliationRepository.exportSnapshot()
    });
  }

  appendEvidence(kind, payload) {
    const core = {
      kind,
      runId: this.#state.runId,
      subjectId: this.#state.identity?.subject.subjectId ?? null,
      principalRelationshipId:
        this.#state.identity?.principal.principalId ?? null,
      mandateId: this.#state.identity?.mandate.mandateId ?? null,
      creditIntentId: this.#state.offerState?.intent.creditIntentId ?? null,
      creditOfferId: this.#state.offerState?.offer.creditOfferId ?? null,
      obligationId: this.#state.credit?.obligation.obligationId ?? null,
      facilityId: this.#state.credit?.facility.tradingFacilityId ?? null,
      authorizationVersion:
        AGENT_CREDIT_EXECUTION_POLICY.authorizationVersion,
      policyVersion: AGENT_CREDIT_EXECUTION_POLICY.policyVersion,
      payload,
      occurredAt: this.now().toISOString(),
      provenance: "L0_LOCAL_NO_FUNDS",
      finality: "local_deterministic",
      productionFundsMoved: false,
      mainnetInteraction: false,
      testnetAssetUsed: false
    };
    const evidenceHash = hashId("agent_credit_execution_evidence", core);
    const value = {
      evidenceId: `agent_credit_evidence_${evidenceHash.slice(2)}`,
      evidenceHash,
      ...core,
      schemaVersion: "agent_credit_execution_evidence.v1"
    };
    this.#state.evidence.push(value);
    return clone(value);
  }

  deny(operation, reasonCode, details = {}) {
    const core = {
      operation,
      reasonCode,
      runId: this.#state.runId,
      facilityId: this.#state.credit?.facility.tradingFacilityId ?? null,
      details,
      deniedAt: this.now().toISOString(),
      adapterInvoked: false,
      externalExecution: false,
      economicMutation: false,
      authorityExpanded: false,
      silentRetry: false,
      duplicateSettlement: false
    };
    const denialHash = hashId("agent_credit_execution_denial", core);
    this.#state.denials.push({
      denialEvidenceId: `agent_credit_denial_${denialHash.slice(2)}`,
      denialHash,
      ...core,
      schemaVersion: "agent_credit_execution_denial_evidence.v1"
    });
    throw new DomainError(reasonCode, "The requested Agent operation is denied");
  }

  requireRun(runId) {
    identifier("runId", runId);
    if (this.#state.runId !== null && this.#state.runId !== runId) {
      this.deny("run", "agent_credit_cross_run_denied", { runId });
    }
  }

  authenticate(input) {
    exact(input, ["economicAgentWallet", "runId"]);
    const runId = identifier("runId", input.runId);
    const wallet = identifier("economicAgentWallet", input.economicAgentWallet);
    const economicAgentWalletHash = hashId("economic_agent_wallet", wallet);
    if (this.#state.identity) {
      if (
        this.#state.runId !== runId ||
        this.#state.identity.economicAgentWalletHash !== economicAgentWalletHash
      ) {
        this.deny("authenticate", "economic_agent_wallet_mismatch");
      }
    } else {
      this.#state.runId = runId;
      this.#state.identity = createAgentCreditIdentity({
        economicAgentWalletHash,
        now: this.now(),
        runId
      });
      this.#state.stage = "AUTHENTICATED";
      this.appendEvidence("AGENT_AUTHENTICATED", {
        economicAgentWalletHash,
        ipoOneSubject: this.#state.identity.subject.subjectId
      });
    }
    return clone({
      authenticatedSubject: this.#state.identity.subject.subjectId,
      economicAgentWalletHash,
      ipoOneSubject: this.#state.identity.subject.subjectId,
      schemaVersion: "agent_credit_authentication_receipt.v1"
    });
  }

  discoverCredit({ runId, ...unknown }) {
    if (Object.keys(unknown).length !== 0) this.deny("discover", "invalid_discovery");
    this.requireRun(runId);
    return clone({
      provider: "IPO.ONE",
      operations: [
        "requestCredit",
        "readOffer",
        "acceptOffer",
        "readFacility",
        "repay",
        "readEvidence",
        "readPerformance"
      ],
      sharedKernel: true,
      productionAuthority: false,
      fundsAuthority: false,
      schemaVersion: "agent_credit_provider_capabilities.v1"
    });
  }

  discoverVenue({ runId, ...unknown }) {
    if (Object.keys(unknown).length !== 0) this.deny("discover", "invalid_discovery");
    this.requireRun(runId);
    return clone(agentCreditExecutionCapabilityDescriptor());
  }

  requestCredit(input) {
    exact(input, [
      "authenticatedSubject",
      "purposeCode",
      "requestedPrincipalMinor",
      "runId"
    ]);
    this.requireRun(input.runId);
    if (
      !this.#state.identity ||
      input.authenticatedSubject !== this.#state.identity.subject.subjectId ||
      input.purposeCode !== "trading_capital" ||
      !/^[1-9][0-9]{0,77}$/.test(input.requestedPrincipalMinor) ||
      BigInt(input.requestedPrincipalMinor) >
        BigInt(AGENT_CREDIT_EXECUTION_POLICY.execution.maxFacilityExposureMinor)
    ) {
      this.deny("requestCredit", "agent_credit_intent_denied");
    }
    if (this.#state.offerState) {
      this.deny("requestCredit", "agent_credit_duplicate_intent_denied");
    }
    this.#state.offerState = createAgentCreditOffer({
      identity: this.#state.identity,
      requestedPrincipalMinor: input.requestedPrincipalMinor,
      now: this.now()
    });
    this.#state.stage = "OFFERED";
    this.appendEvidence("CAPITAL_PARTNER_OFFERED", {
      offerHash: this.#state.offerState.offer.creditOfferHash,
      termsHash: this.#state.offerState.offer.termsHash
    });
    return clone({
      offerId: this.#state.offerState.offer.creditOfferId,
      status: "offered",
      schemaVersion: "agent_credit_request_receipt.v1"
    });
  }

  readOffer(input) {
    exact(input, ["offerId", "runId"]);
    this.requireRun(input.runId);
    if (input.offerId !== this.#state.offerState?.offer.creditOfferId) {
      this.deny("readOffer", "agent_credit_offer_unavailable");
    }
    const offer = this.#state.offerState.offer;
    return clone({
      offerId: offer.creditOfferId,
      offerHash: offer.creditOfferHash,
      termsHash: offer.termsHash,
      approvedPrincipalMinor: offer.approvedPrincipalMinor,
      capitalPartnerId: offer.capitalPartnerId,
      permittedPurposeCode: offer.permittedPurposeCode,
      status: offer.status,
      schemaVersion: "agent_credit_offer_view.v1"
    });
  }

  acceptOffer(input) {
    exact(input, ["expectedOfferHash", "expectedTermsHash", "offerId", "runId"]);
    this.requireRun(input.runId);
    const offer = this.#state.offerState?.offer;
    if (
      !offer ||
      this.#state.credit ||
      input.offerId !== offer.creditOfferId ||
      input.expectedOfferHash !== offer.creditOfferHash ||
      input.expectedTermsHash !== offer.termsHash
    ) {
      this.deny("acceptOffer", "agent_credit_offer_acceptance_denied");
    }
    this.#state.credit = acceptAgentCreditOffer({
      identity: this.#state.identity,
      offerState: this.#state.offerState,
      now: this.now()
    });
    this.#state.stage = "FACILITY_ACTIVE";
    this.appendEvidence("FACILITY_ACTIVATED", {
      obligationHash: this.#state.credit.obligation.obligationHash,
      facilityHash: this.#state.credit.facility.facilityHash,
      capitalControllerHash: hashId("capital_controller", {
        facilityHash: this.#state.credit.facility.facilityHash
      }),
      venueApiSignerReferenceHash: hashId("venue_api_signer_reference", {
        facilityHash: this.#state.credit.facility.facilityHash
      }),
      agentCustody: false
    });
    return clone({
      facilityId: this.#state.credit.facility.tradingFacilityId,
      obligationId: this.#state.credit.obligation.obligationId,
      status: "active",
      schemaVersion: "agent_credit_offer_accepted.v1"
    });
  }

  readFacility(input) {
    exact(input, ["facilityId", "runId"]);
    this.requireRun(input.runId);
    const facility = this.#state.credit?.facility;
    if (input.facilityId !== facility?.tradingFacilityId) {
      this.deny("readFacility", "agent_credit_facility_unavailable");
    }
    return clone({
      facilityId: facility.tradingFacilityId,
      facilityHash: facility.facilityHash,
      obligationId: facility.obligationId,
      authorizationVersion:
        AGENT_CREDIT_EXECUTION_POLICY.authorizationVersion,
      lifecycleStatus: facility.lifecycleStatus,
      riskState: facility.riskState,
      maxOrderNotionalMinor:
        AGENT_CREDIT_EXECUTION_POLICY.execution.maxOrderNotionalMinor,
      withdrawalAllowed: false,
      transferAllowed: false,
      agentCustodyAllowed: false,
      schemaVersion: "agent_credit_facility_view.v1"
    });
  }

  bindAccount(input) {
    exact(input, ["authorizationVersion", "facilityId", "runId"]);
    this.requireRun(input.runId);
    const facility = this.#state.credit?.facility;
    if (
      input.facilityId !== facility?.tradingFacilityId ||
      input.authorizationVersion !==
        AGENT_CREDIT_EXECUTION_POLICY.authorizationVersion
    ) {
      this.deny("bindAccount", "controlled_account_binding_denied");
    }
    if (!this.#state.binding) {
      const bindingHash = hashId("controlled_venue_capital_account", {
        facilityHash: facility.facilityHash,
        policyVersion: AGENT_CREDIT_EXECUTION_POLICY.policyVersion
      });
      this.#state.binding = {
        bindingId: `controlled_venue_binding_${bindingHash.slice(2, 34)}`,
        bindingHash,
        facilityId: facility.tradingFacilityId,
        capitalControllerHash: hashId("capital_controller", {
          facilityHash: facility.facilityHash
        }),
        venueApiSignerReferenceHash: hashId("venue_api_signer_reference", {
          facilityHash: facility.facilityHash
        }),
        agentCustody: false,
        withdrawalAuthority: false,
        transferAuthority: false,
        keyExportable: false,
        schemaVersion: "controlled_venue_capital_account.v1"
      };
      this.appendEvidence("CONTROLLED_ACCOUNT_BOUND", {
        bindingHash,
        agentCustody: false
      });
    }
    return clone(this.#state.binding);
  }

  readAccount(input) {
    exact(input, ["bindingId", "runId"]);
    this.requireRun(input.runId);
    if (input.bindingId !== this.#state.binding?.bindingId) {
      this.deny("readAccount", "controlled_account_unavailable");
    }
    return clone(this.#state.binding);
  }

  executionGateway() {
    const facility = this.#state.credit.facility;
    const binding = this.#state.binding;
    return new HyperliquidTestnetExecutionGateway({
      repository: this.#executionRepository,
      bindingResolver: {
        async resolve() {
          return {
            facilityId: facility.tradingFacilityId,
            facilityHash: facility.facilityHash,
            accountBindingHash: binding.bindingHash,
            signerReferenceHash: binding.venueApiSignerReferenceHash,
            simulationOnly: true,
            liveSignerAvailable: false,
            apiWalletApproved: false,
            keyExportable: false
          };
        }
      },
      policyEvaluator: {
        async evaluate(input) {
          return {
            approved: true,
            policyDecisionHash: hashId(
              "agent_credit_execution_gateway_policy",
              input
            ),
            actionKind: input.actionKind,
            serverReduceOnlyProven:
              input.actionKind ===
              HyperliquidExecutionActionKind.REDUCE_ONLY_ORDER,
            killSwitchOpen: true,
            simulationOnly: true
          };
        }
      },
      signer: new SimulatedIsolatedHyperliquidSigner(),
      transport: this.#executionTransport,
      clock: this.#clock
    });
  }

  prepareExecution(input) {
    exact(input, ["executionIntent", "facilityId", "runId", "sequence"]);
    this.requireRun(input.runId);
    const facility = this.#state.credit?.facility;
    if (
      input.facilityId !== facility?.tradingFacilityId ||
      !this.#state.binding ||
      !Number.isSafeInteger(input.sequence) ||
      input.sequence < 1
    ) {
      this.deny("prepareExecution", "agent_credit_execution_scope_denied");
    }
    let decision;
    try {
      decision = authorizeAgentExecutionIntent({
        facility,
        intent: input.executionIntent,
        mandate: this.#state.identity.mandate,
        now: this.now(),
        reconciliationBlocked: this.#state.reconciliationBlocked,
        frozen: this.#state.frozen
      });
    } catch (error) {
      this.deny(
        "prepareExecution",
        error.code ?? "agent_credit_execution_action_denied"
      );
    }
    if (decision.actionKind === "reduceOnlyOrder") {
      const opened = this.#state.executions.find(
        ({ role }) => role === "open"
      );
      if (
        !opened ||
        opened.record.executionId !== decision.openExecutionId ||
        opened.record.nonceState !== HyperliquidExecutionNonceState.CONFIRMED
      ) {
        this.deny("prepareExecution", "agent_credit_close_parent_denied");
      }
    }
    if (decision.actionKind === "order") {
      const submitted = submitTradingOrderIntent(facility, {
        submittedByActorId: this.#state.identity.principal.principalId,
        direction: "long",
        syntheticNotionalMinor: decision.requestedNotionalMinor,
        expectedStateHash: facility.stateHash,
        expectedVersion: facility.version,
        now: this.now()
      });
      this.#state.credit.facility = submitted.facility;
      this.#state.orderIntent = submitted.orderIntent;
    }
    const currentFacility = this.#state.credit.facility;
    const action = decision.reduceOnly
      ? {
          kind: HyperliquidExecutionActionKind.REDUCE_ONLY_ORDER,
          assetIndex:
            AGENT_CREDIT_EXECUTION_POLICY.execution.btcAssetIndex,
          side: "sell",
          limitPx: "1000",
          size: "0.01",
          timeInForce: "Ioc"
        }
      : {
          kind: HyperliquidExecutionActionKind.ORDER,
          assetIndex:
            AGENT_CREDIT_EXECUTION_POLICY.execution.btcAssetIndex,
          side: "buy",
          limitPx: "1000",
          size: "0.01",
          timeInForce: "Gtc"
        };
    const core = {
      facilityId: currentFacility.tradingFacilityId,
      facilityHash: currentFacility.facilityHash,
      facilityVersion: currentFacility.version,
      orderIntentId: this.#state.orderIntent.tradingOrderIntentId,
      orderIntentHash: this.#state.orderIntent.orderIntentHash,
      orderIntentVersion: this.#state.orderIntent.version,
      action,
      policyDecisionHash: decision.policyDecisionHash,
      sequence: input.sequence,
      runId: input.runId,
      expiresAt: new Date(this.#clock() + PREPARED_TTL_MS).toISOString()
    };
    const preparedExecutionHash = hashId(
      "agent_credit_prepared_execution",
      core
    );
    const prepared = {
      preparedExecutionId:
        `agent_credit_prepared_${preparedExecutionHash.slice(2, 34)}`,
      preparedExecutionHash,
      ...core,
      submitted: false,
      schemaVersion: "agent_credit_prepared_execution.v1"
    };
    this.#state.prepared.push(prepared);
    this.#state.stage = decision.reduceOnly ? "CLOSE_PREPARED" : "OPEN_PREPARED";
    this.appendEvidence("EXECUTION_PREPARED", {
      preparedExecutionHash,
      actionKind: action.kind,
      sequence: input.sequence
    });
    return clone(prepared);
  }

  async submitExecution(input) {
    exact(input, [
      "preparedExecutionHash",
      "preparedExecutionId",
      "runId"
    ]);
    this.requireRun(input.runId);
    const prepared = this.#state.prepared.find(
      ({ preparedExecutionId }) =>
        preparedExecutionId === input.preparedExecutionId
    );
    if (
      !prepared ||
      prepared.preparedExecutionHash !== input.preparedExecutionHash ||
      new Date(prepared.expiresAt).getTime() < this.#clock()
    ) {
      this.deny("submitExecution", "stale_or_mutated_execution_denied");
    }
    if (prepared.submitted) {
      this.deny("submitExecution", "execution_replay_denied");
    }
    const record = await this.executionGateway().execute({
      facilityId: prepared.facilityId,
      facilityHash: prepared.facilityHash,
      facilityVersion: prepared.facilityVersion,
      orderIntentId: prepared.orderIntentId,
      orderIntentHash: prepared.orderIntentHash,
      orderIntentVersion: prepared.orderIntentVersion,
      idempotencyKey: prepared.preparedExecutionId,
      action: prepared.action
    });
    prepared.submitted = true;
    const role = prepared.action.kind === HyperliquidExecutionActionKind.ORDER
      ? "open"
      : "close";
    this.#state.executions.push({ role, record });
    if (role === "close") {
      const flattened = flattenTradingFacility(
        this.#state.credit.facility,
        [this.#state.orderIntent],
        {
          flattenedByActorId: "system_agent_credit_risk_guardian",
          reasonCode: "testnet_close",
          expectedStateHash: this.#state.credit.facility.stateHash,
          expectedVersion: this.#state.credit.facility.version,
          now: this.now()
        }
      );
      this.#state.credit.facility = flattened.facility;
      this.#state.orderIntent = flattened.orderIntents[0];
      this.#state.stage = "POSITIONS_CLOSED";
    } else {
      this.#state.stage = "POSITION_OPEN";
    }
    this.appendEvidence(role === "open" ? "POSITION_OPENED" : "POSITION_CLOSED", {
      executionId: record.executionId,
      executionHash: record.executionHash,
      actionKind: record.actionKind,
      cloid: record.cloid,
      nonceState: record.nonceState,
      externalOrderSubmitted: false
    });
    return clone({
      executionId: record.executionId,
      executionHash: record.executionHash,
      role,
      status: record.nonceState,
      schemaVersion: "agent_credit_execution_receipt.v1"
    });
  }

  readExecution(input) {
    exact(input, ["executionId", "runId"]);
    this.requireRun(input.runId);
    const value = this.#state.executions.find(
      ({ record }) => record.executionId === input.executionId
    );
    if (!value) this.deny("readExecution", "agent_credit_execution_unavailable");
    return clone({
      executionId: value.record.executionId,
      executionHash: value.record.executionHash,
      role: value.role,
      status: value.record.nonceState,
      reconciled: value.record.reconciled,
      schemaVersion: "agent_credit_execution_view.v1"
    });
  }

  reconciliationSnapshot(close) {
    const facility = this.#state.credit.facility;
    return {
      executionId: close.executionId,
      executionHash: close.executionHash,
      executionNonceState: close.nonceState,
      nonce: close.nonce,
      actionKind: close.actionKind,
      actionHash: close.actionHash,
      cloid: close.cloid,
      facilityId: facility.tradingFacilityId,
      facilityHash: facility.facilityHash,
      facilityStateHash: facility.stateHash,
      facilityVersion: facility.version,
      orderIntentId: this.#state.orderIntent.tradingOrderIntentId,
      orderIntentHash: this.#state.orderIntent.orderIntentHash,
      orderIntentStateHash: this.#state.orderIntent.orderStateHash,
      orderIntentVersion: this.#state.orderIntent.version,
      subjectId: facility.subjectId,
      obligationId: facility.obligationId,
      accountBindingHash: this.#state.binding.bindingHash,
      signerReferenceHash:
        this.#state.binding.venueApiSignerReferenceHash,
      requestedSize: "0.01",
      requestedNotionalMinor:
        this.#state.credit.obligation.originalPrincipalMinor,
      canonicalLedgerStateHash: hashId("agent_credit_ledger_state", {
        principalLedgerTransactionId:
          this.#state.credit.principalLedgerTransaction.ledgerTransactionId
      }),
      ledgerTransactionCount: 1,
      riskSnapshotHash: hashId("agent_credit_risk_snapshot", {
        state: "FLATTEN"
      }),
      riskState: "FLATTEN",
      simulationOnly: true,
      externalOrderSubmitted: false,
      canonicalLedger: true,
      secondLedgerCreated: false,
      capturedAt: this.now().toISOString(),
      schemaVersion:
        "hyperliquid_testnet_reconciliation_kernel_snapshot.v1"
    };
  }

  async reconcile(input) {
    exact(input, ["facilityId", "runId"]);
    this.requireRun(input.runId);
    const facility = this.#state.credit?.facility;
    const closed = this.#state.executions.find(({ role }) => role === "close");
    if (
      input.facilityId !== facility?.tradingFacilityId ||
      !closed ||
      facility.lifecycleStatus !== "flattened" ||
      facility.openOrderCount !== 0 ||
      facility.syntheticExposureMinor !== "0"
    ) {
      this.#state.reconciliationBlocked = true;
      this.deny("reconcile", "reconciliation_blocked");
    }
    if (this.#state.reconciliation) {
      return clone(this.#state.reconciliation);
    }
    const snapshot = this.reconciliationSnapshot(closed.record);
    const observation = createSimulatedHyperliquidVenueObservation(
      {
        executionHash: snapshot.executionHash,
        facilityHash: snapshot.facilityHash,
        actionHash: snapshot.actionHash,
        cloid: snapshot.cloid,
        kind: HyperliquidReconciliationObservationKind.NORMALIZED_STATE,
        venueStatus: HyperliquidVenueOrderStatus.FILLED,
        cumulativeFilledSize: "0.01",
        cumulativeFillNotionalMinor:
          this.#state.credit.obligation.originalPrincipalMinor,
        venueOrderReferenceHash: hashId("agent_credit_venue_order", {
          executionHash: snapshot.executionHash
        }),
        orderStateHash: hashId("agent_credit_venue_order_state", {
          executionHash: snapshot.executionHash
        }),
        positionStateHash: hashId("agent_credit_position_state", {
          exposureMinor: "0"
        }),
        accountStateHash: hashId("agent_credit_account_state", {
          finalEquityMinor: this.#state.finalEquityMinor
        }),
        freshness: "FRESH",
        complete: true,
        reasonCode: "l0_close_confirmed"
      },
      { clock: this.#clock }
    );
    const service = new HyperliquidTestnetReconciliationService({
      repository: this.#reconciliationRepository,
      commandGuard: new SimulatedHyperliquidReconciliationCommandGuard(),
      kernelResolver: new SimulatedHyperliquidReconciliationKernelResolver({
        snapshots: [snapshot]
      }),
      observationAdapter: new ScriptedHyperliquidVenueObservationAdapter({
        steps: [observation]
      }),
      maxPollAttempts: 1,
      circuitBreakerFailureThreshold: 1,
      clock: this.#clock
    });
    const result = await service.reconcile({
      executionId: snapshot.executionId,
      executionHash: snapshot.executionHash,
      idempotencyKey: `agent-credit-reconcile-${input.runId}`
    });
    if (result.status !== HyperliquidReconciliationStatus.RECONCILED) {
      this.#state.reconciliationBlocked = true;
      this.deny("reconcile", "reconciliation_blocked");
    }
    this.#state.reconciliation = result;
    this.#state.stage = "RECONCILED";
    this.appendEvidence("VENUE_RECONCILED", {
      reconciliationId: result.reconciliationId,
      reconciliationHash: result.reconciliationHash,
      status: result.status,
      finalEquityMinor: this.#state.finalEquityMinor
    });
    return clone({
      reconciliationId: result.reconciliationId,
      reconciliationHash: result.reconciliationHash,
      status: result.status,
      finalEquityMinor: this.#state.finalEquityMinor,
      schemaVersion: "agent_credit_reconciliation_receipt.v1"
    });
  }

  repay(input) {
    exact(input, [
      "expectedReconciliationHash",
      "facilityId",
      "reconciliationId",
      "runId"
    ]);
    this.requireRun(input.runId);
    const reconciliation = this.#state.reconciliation;
    const facility = this.#state.credit?.facility;
    if (
      !reconciliation ||
      reconciliation.status !== HyperliquidReconciliationStatus.RECONCILED ||
      input.expectedReconciliationHash !==
        reconciliation.reconciliationHash ||
      input.reconciliationId !== reconciliation.reconciliationId ||
      input.facilityId !== facility?.tradingFacilityId
    ) {
      this.deny("repay", "canonical_repayment_reconciliation_denied");
    }
    if (this.#state.repayment) {
      this.deny("repay", "repayment_replay_denied");
    }
    const capital =
      BigInt(facility.requiredProviderFundingMinor) +
      BigInt(facility.requiredSubjectCollateralMinor);
    const pnl = BigInt(this.#state.finalEquityMinor) - capital;
    const waterfall = calculateTestnetSettlementWaterfall({
      templateType: "credit",
      providerContributionMinor: facility.requiredProviderFundingMinor,
      subjectContributionMinor: facility.requiredSubjectCollateralMinor,
      finalEquityMinor: this.#state.finalEquityMinor,
      realizedPnlMinor: pnl.toString(),
      venueCostMinor: "0",
      closingCostMinor: "0",
      fixedReturnBps: 0,
      performanceParticipationBps: 0,
      durationDays: 30,
      ipoOneFeeBps: 0
    });
    if (waterfall.providerPrincipalReturnMinor === "0") {
      this.deny("repay", "no_repayable_equity");
    }
    this.#state.repaymentPlan = {
      reconciliationHash: reconciliation.reconciliationHash,
      providerPrincipalReturnMinor: waterfall.providerPrincipalReturnMinor,
      waterfallHash: hashId("agent_credit_repayment_waterfall", waterfall),
      preparedAt: this.now().toISOString(),
      economicMutationCreated: false,
      schemaVersion: "agent_credit_repayment_plan.v1"
    };
    if (this.#crashPoint === "during_repayment") {
      throw new DomainError(
        "simulated_agent_credit_restart",
        "simulated restart after durable repayment plan and before mutation"
      );
    }
    const repayment = applyAgentCreditRepayment({
      obligation: this.#state.credit.obligation,
      amountMinor: waterfall.providerPrincipalReturnMinor,
      actorId: this.#state.binding.capitalControllerHash,
      now: this.now()
    });
    this.#state.credit.obligation = repayment.obligation;
    this.#state.waterfall = waterfall;
    const residualReleaseMinor = this.#state.frozen
      ? "0"
      : waterfall.subjectTotalAllocationMinor;
    const residualReleasedAfterRepayment = this.#state.frozen === false;
    this.#state.repayment = {
      repayment: repayment.repayment,
      ledgerTransaction: repayment.ledgerTransaction,
      sequence: [
        "close_positions",
        "cancel_pending_orders",
        "reconcile_venue",
        "canonical_repayment",
        "residual_release"
      ],
      residualReleaseMinor,
      residualReleasedAfterRepayment,
      schemaVersion: "agent_credit_repayment_result.v1"
    };
    const outstanding = repayment.obligation.outstandingPrincipalMinor;
    this.#state.performance = {
      obligationStatus: repayment.obligation.status,
      outstandingPrincipalMinor: outstanding,
      repaidPrincipalMinor: repayment.repayment.appliedPrincipalMinor,
      realizedPnlMinor: waterfall.realizedPnlMinor,
      providerPrincipalShortfallMinor:
        waterfall.providerPrincipalShortfallMinor,
      subjectFirstLossMinor: waterfall.subjectFirstLossMinor,
      creditState: outstanding === "0" ? "REPAID" : "LOSS_OUTSTANDING",
      riskState: this.#state.frozen
        ? "FROZEN"
        : outstanding === "0" ? "NORMAL" : "NEW_CAPACITY_HELD",
      servicingState:
        outstanding === "0" ? "SETTLED" : "PARTIALLY_REPAID",
      futureCapacity:
        outstanding === "0" && !this.#state.frozen
          ? "POLICY_ELIGIBLE"
          : "HELD_FOR_REVIEW",
      canonicalLedger: true,
      schemaVersion: "agent_credit_performance_proof.v1"
    };
    this.#state.stage = outstanding === "0" ? "SETTLED" : "PARTIAL_REPAYMENT";
    this.appendEvidence("CANONICAL_REPAYMENT_POSTED", {
      repaymentEventId: repayment.repayment.repaymentId,
      repaymentHash: repayment.repayment.repaymentHash,
      repaymentResult: this.#state.stage,
      appliedPrincipalMinor: repayment.repayment.appliedPrincipalMinor,
      outstandingPrincipalMinor: outstanding,
      ledgerTransactionId: repayment.ledgerTransaction.ledgerTransactionId,
      residualReleaseMinor,
      residualReleasedAfterRepayment
    });
    return clone({
      repaymentEventId: repayment.repayment.repaymentId,
      appliedPrincipalMinor: repayment.repayment.appliedPrincipalMinor,
      outstandingPrincipalMinor: outstanding,
      obligationStatus: repayment.obligation.status,
      residualReleaseMinor,
      residualReleasedAfterRepayment,
      schemaVersion: "agent_credit_repayment_receipt.v1"
    });
  }

  readEvidence(input) {
    exact(input, ["facilityId", "runId"]);
    this.requireRun(input.runId);
    if (input.facilityId !== this.#state.credit?.facility.tradingFacilityId) {
      this.deny("readEvidence", "agent_credit_evidence_unavailable");
    }
    return clone({
      items: this.#state.evidence,
      denialItems: this.#state.denials,
      count: this.#state.evidence.length,
      schemaVersion: "agent_credit_execution_evidence_list.v1"
    });
  }

  readPerformance(input) {
    exact(input, ["facilityId", "runId"]);
    this.requireRun(input.runId);
    if (
      input.facilityId !== this.#state.credit?.facility.tradingFacilityId ||
      !this.#state.performance
    ) {
      this.deny("readPerformance", "agent_credit_performance_unavailable");
    }
    return clone(this.#state.performance);
  }

  freeze(reasonCode = "operator_freeze") {
    identifier("reasonCode", reasonCode);
    this.#state.frozen = true;
    this.#state.stage = "FROZEN";
    return this.appendEvidence("FACILITY_FROZEN", { reasonCode });
  }
}

export function createAgentCreditExecutionRuntime(input) {
  return new AgentCreditExecutionRuntime(input);
}
