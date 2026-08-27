const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const POSITIVE_MINOR = /^[1-9][0-9]{0,77}$/;

const CREDIT_METHODS = Object.freeze([
  "authenticate",
  "discoverCapabilities",
  "requestCredit",
  "readOffer",
  "acceptOffer",
  "readFacility",
  "repay",
  "readEvidence",
  "readPerformance",
  "readCreditOutcome",
  "readCreditState"
]);

const VENUE_METHODS = Object.freeze([
  "discoverCapabilities",
  "bindAccount",
  "readAccount",
  "prepareExecution",
  "submitExecution",
  "readExecution",
  "reconcile"
]);

function exact(value, keys, message) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new TypeError(message);
  }
  return value;
}

function port(name, value, methods) {
  if (
    !value ||
    typeof value !== "object" ||
    methods.some((method) => typeof value[method] !== "function")
  ) {
    throw new TypeError(`${name} does not satisfy the closed Agent port`);
  }
  return value;
}

function identifier(name, value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function amount(value) {
  if (typeof value !== "string" || !POSITIVE_MINOR.test(value)) {
    throw new TypeError("requestedPrincipalMinor is invalid");
  }
  return value;
}

function immutable(value) {
  return Object.freeze(structuredClone(value));
}

export class ReferenceEconomicAgent {
  #economicAgentWallet;
  #creditProvider;
  #executionVenue;

  constructor({ economicAgentWallet, creditProvider, executionVenue, ...unknown }) {
    if (Object.keys(unknown).length !== 0) {
      throw new TypeError("reference Agent configuration has an open shape");
    }
    this.#economicAgentWallet = identifier(
      "economicAgentWallet",
      economicAgentWallet
    );
    this.#creditProvider = port(
      "CreditProvider",
      creditProvider,
      CREDIT_METHODS
    );
    this.#executionVenue = port(
      "ExecutionVenue",
      executionVenue,
      VENUE_METHODS
    );
  }

  async run(input) {
    exact(
      input,
      ["requestedPrincipalMinor", "runId"],
      "reference Agent run input has an invalid closed shape"
    );
    const runId = identifier("runId", input.runId);
    const requestedPrincipalMinor = amount(input.requestedPrincipalMinor);
    const authentication = await this.#creditProvider.authenticate({
      economicAgentWallet: this.#economicAgentWallet,
      runId
    });
    const creditCapabilities =
      await this.#creditProvider.discoverCapabilities({ runId });
    const venueCapabilities =
      await this.#executionVenue.discoverCapabilities({ runId });
    const requested = await this.#creditProvider.requestCredit({
      authenticatedSubject: authentication.authenticatedSubject,
      purposeCode: "trading_capital",
      requestedPrincipalMinor,
      runId
    });
    const offer = await this.#creditProvider.readOffer({
      offerId: requested.offerId,
      runId
    });
    const accepted = await this.#creditProvider.acceptOffer({
      expectedOfferHash: offer.offerHash,
      expectedTermsHash: offer.termsHash,
      offerId: offer.offerId,
      runId
    });
    const facility = await this.#creditProvider.readFacility({
      facilityId: accepted.facilityId,
      runId
    });
    const binding = await this.#executionVenue.bindAccount({
      authorizationVersion: facility.authorizationVersion,
      facilityId: facility.facilityId,
      runId
    });
    const account = await this.#executionVenue.readAccount({
      bindingId: binding.bindingId,
      runId
    });

    const preparedOpen = await this.#executionVenue.prepareExecution({
      executionIntent: {
        kind: "open",
        market: "BTC",
        requestedNotionalMinor: requestedPrincipalMinor
      },
      facilityId: facility.facilityId,
      runId,
      sequence: 1
    });
    const opened = await this.#executionVenue.submitExecution({
      preparedExecutionHash: preparedOpen.preparedExecutionHash,
      preparedExecutionId: preparedOpen.preparedExecutionId,
      runId
    });
    const openState = await this.#executionVenue.readExecution({
      executionId: opened.executionId,
      runId
    });

    const preparedClose = await this.#executionVenue.prepareExecution({
      executionIntent: {
        kind: "close",
        market: "BTC",
        openExecutionId: opened.executionId
      },
      facilityId: facility.facilityId,
      runId,
      sequence: 2
    });
    const closed = await this.#executionVenue.submitExecution({
      preparedExecutionHash: preparedClose.preparedExecutionHash,
      preparedExecutionId: preparedClose.preparedExecutionId,
      runId
    });
    const reconciliation = await this.#executionVenue.reconcile({
      facilityId: facility.facilityId,
      runId
    });
    const repayment = await this.#creditProvider.repay({
      expectedReconciliationHash: reconciliation.reconciliationHash,
      facilityId: facility.facilityId,
      reconciliationId: reconciliation.reconciliationId,
      runId
    });
    const evidence = await this.#creditProvider.readEvidence({
      facilityId: facility.facilityId,
      runId
    });
    const performance = await this.#creditProvider.readPerformance({
      facilityId: facility.facilityId,
      runId
    });
    const creditOutcome = await this.#creditProvider.readCreditOutcome({
      facilityId: facility.facilityId,
      runId
    });
    const creditState = await this.#creditProvider.readCreditState({
      facilityId: facility.facilityId,
      runId
    });

    return immutable({
      account,
      authentication,
      binding,
      closed,
      creditCapabilities,
      creditOutcome,
      creditState,
      evidence,
      facility,
      openState,
      performance,
      repayment,
      runId,
      venueCapabilities,
      schemaVersion: "reference_economic_agent_run.v1"
    });
  }
}

export function createReferenceEconomicAgent(input) {
  return new ReferenceEconomicAgent(input);
}
