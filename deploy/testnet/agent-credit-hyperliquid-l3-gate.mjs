export const AGENT_CREDIT_HYPERLIQUID_L3_PROFILE = Object.freeze({
  capability: "REQ-TRADE-005",
  mode: "L3_LIVE_TESTNET",
  venue: "hyperliquid",
  origin: "https://api.hyperliquid-testnet.xyz",
  path: "/exchange",
  market: "BTC",
  assetIndex: 3,
  maximumNotionalUsd: "10",
  maximumLeverage: 1,
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
  const origin =
    env.IPO_ONE_HYPERLIQUID_EXCHANGE_ORIGIN ??
    AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.origin;
  const venue = env.IPO_ONE_EXECUTION_VENUE ?? "hyperliquid";
  check("ci_disabled", env.CI !== "true" && env.GITHUB_ACTIONS !== "true");
  check("testnet_origin_exact", origin === AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.origin);
  check("venue_exact", venue === "hyperliquid");
  check(
    "no_raw_secret_ingress",
    RAW_SECRET_NAMES.every((name) => !env[name])
  );
  check("mainnet_authority_false", AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.mainnetAuthority === false);
  check("real_funds_authority_false", AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.realFundsAuthority === false);

  const requiresExactRun = operation !== "preflight";
  const runId = env.IPO_ONE_HYPERLIQUID_TESTNET_RUN_ID;
  const approval = env.IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_RUN;
  const account = env.IPO_ONE_HYPERLIQUID_TESTNET_ACCOUNT_ADDRESS?.toLowerCase();
  const apiWallet = env.IPO_ONE_HYPERLIQUID_TESTNET_API_WALLET_ADDRESS?.toLowerCase();
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
      SIGNER_REFERENCE.test(
        env.IPO_ONE_HYPERLIQUID_TESTNET_SIGNER_REFERENCE ?? ""
      )
    );
    const requestedAction = env.IPO_ONE_HYPERLIQUID_ACTION;
    check(
      "action_allowlisted",
      requestedAction !== undefined &&
        AGENT_CREDIT_HYPERLIQUID_L3_PROFILE.allowedActions.includes(requestedAction)
    );
    if (operation === "run-once") check("opening_action_exact", requestedAction === "order");
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
