import { hashId } from "../../packages/domain/src/index.js";

export const AGENT_CREDIT_HYPERLIQUID_L3_PROFILE = Object.freeze({
  capability: "REQ-TRADE-005",
  mode: "L3_LIVE_TESTNET",
  venue: "hyperliquid",
  environment: "testnet",
  origin: "https://api.hyperliquid-testnet.xyz",
  path: "/exchange",
  market: "BTC",
  assetIndex: 3,
  maximumNotionalUsd: "12",
  maximumLeverage: 1,
  policyVersion: "agent_credit_hyperliquid_testnet.v2",
  authorizationVersion: "agent_credit_authorization.v1",
  allowedActions: Object.freeze([
    "order",
    "cancel",
    "cancelByCloid",
    "modify",
    "scheduleCancel"
  ]),
  mainnetAuthority: false,
  productionAuthority: false,
  realFundsAuthority: false,
  automaticExecution: false,
  schemaVersion: "agent_credit_hyperliquid_l3_profile.v1"
});

const ADDRESS = /^0x(?!0{40}$)[0-9a-f]{40}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const SIGNER_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9:._/%-]{7,255}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;
const OPERATIONS = new Set([
  "preflight",
  "run-once",
  "reconcile",
  "emergency-close"
]);
const WRITE_OPERATIONS = new Set(["run-once", "emergency-close"]);
const RAW_SECRET_NAMES = [
  "IPO_ONE_HYPERLIQUID_PRIVATE_KEY",
  "IPO_ONE_HYPERLIQUID_SEED_PHRASE",
  "IPO_ONE_HYPERCORE_PRIVATE_KEY",
  "IPO_ONE_HYPERCORE_SIGNER_PRIVATE_KEY"
];

const PREPARATION_BINDING_KEYS = Object.freeze([
  "authorizationVersion",
  "expiresAt",
  "facilityId",
  "market",
  "maximumLeverage",
  "maximumNotionalUsd",
  "obligationId",
  "policyVersion"
]);
const PREPARATION_CORE_KEYS = Object.freeze([
  "capability",
  "mode",
  "venue",
  "environment",
  "origin",
  "account",
  "signerReference",
  "facilityId",
  "obligationId",
  "authorizationVersion",
  "policyVersion",
  "action",
  "market",
  "maximumNotionalUsd",
  "maximumLeverage",
  "expiresAt",
  "runId"
]);

function exactObject(value, keys) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key))
  );
}

function environmentAuthority(env) {
  return Object.freeze({
    venue:
      typeof env.IPO_ONE_EXECUTION_VENUE === "string"
        ? env.IPO_ONE_EXECUTION_VENUE
        : null,
    environment:
      typeof env.IPO_ONE_EXECUTION_ENVIRONMENT === "string"
        ? env.IPO_ONE_EXECUTION_ENVIRONMENT
        : null,
    origin:
      typeof env.IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN === "string"
        ? env.IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN
        : null
  });
}

function preparationCore({ binding, gate }) {
  return {
    capability: AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.capability,
    mode: AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.mode,
    venue: gate.environmentAuthority.venue,
    environment: gate.environmentAuthority.environment,
    origin: gate.environmentAuthority.origin,
    account: gate.account,
    signerReference: gate.signerReference,
    facilityId: binding.facilityId,
    obligationId: binding.obligationId,
    authorizationVersion: binding.authorizationVersion,
    policyVersion: binding.policyVersion,
    action: gate.action,
    market: binding.market,
    maximumNotionalUsd: binding.maximumNotionalUsd,
    maximumLeverage: binding.maximumLeverage,
    expiresAt: new Date(binding.expiresAt).toISOString(),
    runId: gate.runId
  };
}

function immutablePreparation(core) {
  const preparationHash = hashId(
    "agent_credit_hyperliquid_l3_preparation",
    core
  );
  return Object.freeze({
    preparationId: `agent_credit_l3_preparation_${preparationHash.slice(2)}`,
    preparationHash,
    idempotencyIdentity: hashId(
      "agent_credit_hyperliquid_l3_idempotency",
      { preparationHash }
    ),
    ...core,
    environmentAuthoritySource: "server_operator_configuration",
    callerEnvironmentAuthorityAccepted: false,
    externalRequestPerformed: false,
    schemaVersion: "agent_credit_hyperliquid_l3_preparation.v1"
  });
}

function deniedRevalidation(reasonCode) {
  return Object.freeze({
    approved: false,
    reasonCode,
    requiresNewPreparation: true,
    signatureCreated: false,
    adapterInvoked: false,
    externalExecution: false,
    economicMutation: false,
    authorityExpanded: false,
    silentRetry: false,
    schemaVersion: "agent_credit_hyperliquid_l3_revalidation.v1"
  });
}

export function evaluateAgentCreditHyperliquidL3Gate({
  operation,
  env = process.env
}) {
  if (!OPERATIONS.has(operation)) {
    throw new Error("agent_credit_l3_unknown_operation");
  }
  const checks = [];
  const blockers = [];
  const check = (id, passed) => {
    checks.push({ id, passed });
    if (!passed) blockers.push(id);
  };
  const authority = environmentAuthority(env);
  check("ci_disabled", env.CI !== "true" && env.GITHUB_ACTIONS !== "true");
  check(
    "venue_present",
    typeof authority.venue === "string" && authority.venue.length > 0
  );
  check(
    "environment_present",
    typeof authority.environment === "string" && authority.environment.length > 0
  );
  check(
    "origin_present",
    typeof authority.origin === "string" && authority.origin.length > 0
  );
  check(
    "venue_exact",
    authority.venue === AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.venue
  );
  check(
    "environment_exact",
    authority.environment === AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.environment
  );
  check(
    "testnet_origin_exact",
    authority.origin === AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.origin
  );
  check(
    "no_raw_secret_ingress",
    RAW_SECRET_NAMES.every((name) => !env[name])
  );
  check(
    "mainnet_authority_false",
    AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.mainnetAuthority === false
  );
  check(
    "real_funds_authority_false",
    AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.realFundsAuthority === false
  );

  const requiresExactRun = operation !== "preflight";
  const runId = env.IPO_ONE_HYPERLIQUID_TESTNET_RUN_ID;
  const approval = env.IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN;
  const account = env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS?.toLowerCase();
  const apiWallet = env.IPO_ONE_HYPERLIQUID_TESTNET_API_WALLET_ADDRESS?.toLowerCase();
  const signerReference = env.IPO_ONE_HYPERLIQUID_TESTNET_SIGNER_REFERENCE;
  const requestedAction = env.IPO_ONE_HYPERLIQUID_ACTION;
  if (requiresExactRun) {
    check("run_id_present", RUN_ID.test(runId ?? ""));
    check("exact_run_approval", RUN_ID.test(runId ?? "") && approval === runId);
    check("account_present", ADDRESS.test(account ?? ""));
    check(
      "distinct_api_wallet_present",
      ADDRESS.test(apiWallet ?? "") && apiWallet !== account
    );
    check(
      "opaque_signer_reference_present",
      SIGNER_REFERENCE.test(signerReference ?? "")
    );
    check(
      "action_allowlisted",
      requestedAction !== undefined &&
        AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.allowedActions.includes(requestedAction)
    );
    if (operation === "run-once") {
      check("opening_action_exact", requestedAction === "order");
    }
    if (operation === "emergency-close") {
      check(
        "emergency_action_restrictive",
        new Set(["cancel", "cancelByCloid", "scheduleCancel"]).has(requestedAction)
      );
    }
  }

  return Object.freeze({
    approved: blockers.length === 0,
    operation,
    writeOperation: WRITE_OPERATIONS.has(operation),
    runId: RUN_ID.test(runId ?? "") ? runId : null,
    account: ADDRESS.test(account ?? "") ? account : null,
    signerReference:
      SIGNER_REFERENCE.test(signerReference ?? "") ? signerReference : null,
    action:
      AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.allowedActions.includes(requestedAction)
        ? requestedAction
        : null,
    environmentAuthority: authority,
    profile: AGENT_CREDIT_HYPERLIQUID_L3_PROFILE,
    checks,
    blockers,
    externalRequestPerformed: false,
    testnetAssetUsed: false,
    realFundsMoved: false,
    mainnetInteraction: false,
    schemaVersion: "agent_credit_hyperliquid_l3_gate_result.v1"
  });
}

export function createAgentCreditHyperliquidL3Preparation({
  binding,
  env
}) {
  if (!exactObject(binding, PREPARATION_BINDING_KEYS)) {
    throw new Error("agent_credit_l3_preparation_binding_invalid");
  }
  const gate = evaluateAgentCreditHyperliquidL3Gate({
    operation: "run-once",
    env
  });
  if (!gate.approved) {
    throw new Error("agent_credit_l3_preparation_gate_blocked");
  }
  if (
    !IDENTIFIER.test(binding.facilityId ?? "") ||
    !IDENTIFIER.test(binding.obligationId ?? "") ||
    binding.authorizationVersion !==
      AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.authorizationVersion ||
    binding.policyVersion !== AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.policyVersion ||
    binding.market !== AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.market ||
    binding.maximumNotionalUsd !==
      AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.maximumNotionalUsd ||
    binding.maximumLeverage !==
      AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.maximumLeverage ||
    !Number.isFinite(new Date(binding.expiresAt).getTime())
  ) {
    throw new Error("agent_credit_l3_preparation_binding_invalid");
  }
  return immutablePreparation(preparationCore({ binding, gate }));
}

export function revalidateAgentCreditHyperliquidL3Preparation({
  binding,
  env,
  preparation
}) {
  const currentAuthority = environmentAuthority(env);
  if (
    !preparation ||
    preparation.venue !== currentAuthority.venue ||
    preparation.environment !== currentAuthority.environment ||
    preparation.origin !== currentAuthority.origin
  ) {
    return deniedRevalidation("EXECUTION_ENVIRONMENT_DRIFT");
  }
  let current;
  try {
    current = createAgentCreditHyperliquidL3Preparation({ binding, env });
  } catch {
    return deniedRevalidation("EXECUTION_PREPARATION_DRIFT");
  }
  if (
    current.preparationHash !== preparation.preparationHash ||
    current.idempotencyIdentity !== preparation.idempotencyIdentity ||
    PREPARATION_CORE_KEYS.some(
      (key) => current[key] !== preparation[key]
    )
  ) {
    return deniedRevalidation("EXECUTION_PREPARATION_DRIFT");
  }
  return Object.freeze({
    approved: true,
    reasonCode: null,
    requiresNewPreparation: false,
    preparationHash: preparation.preparationHash,
    idempotencyIdentity: preparation.idempotencyIdentity,
    signatureCreated: false,
    adapterInvoked: false,
    externalExecution: false,
    economicMutation: false,
    authorityExpanded: false,
    silentRetry: false,
    schemaVersion: "agent_credit_hyperliquid_l3_revalidation.v1"
  });
}
