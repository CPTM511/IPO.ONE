import { AdminService } from "../../../modules/admin/src/index.js";
import { MandateService } from "../../../modules/authorization/src/index.js";
import { CreditLearningService } from "../../../modules/credit-learning/src/index.js";
import { EventStore } from "../../../modules/event-audit/src/index.js";
import { IdentityService } from "../../../modules/identity/src/index.js";
import { LockboxService } from "../../../modules/lockbox/src/index.js";
import { LedgerService } from "../../../modules/ledger/src/index.js";
import { ObligationService } from "../../../modules/obligation/src/index.js";
import { PaymentService, RepaymentRouter } from "../../../modules/payment/src/index.js";
import { PluginRegistryService } from "../../../modules/plugin-registry/src/index.js";
import { RailService, SandboxRailAdapter } from "../../../modules/rail/src/index.js";
import { RiskService } from "../../../modules/risk/src/index.js";
import { SettlementService } from "../../../modules/settlement/src/index.js";
import { SpendPolicyService } from "../../../modules/spend-policy/src/index.js";
import { MVP_ASSET_ID, MVP_ASSET_SCALE, MVP_RAIL_ID } from "./constants.js";

export function createMvpServices({ railEventRepository } = {}) {
  const eventStore = new EventStore();
  const mandateService = new MandateService({ eventStore });
  const ledgerService = new LedgerService({ eventStore });
  const pluginRegistryService = new PluginRegistryService({ eventStore });
  const identityService = new IdentityService({ eventStore, allowUnverifiedDemoBindings: true });
  const lockboxService = new LockboxService({ eventStore, ledgerService });
  const obligationService = new ObligationService({ eventStore });
  const spendPolicyService = new SpendPolicyService({ eventStore, authorizationService: mandateService });
  const sandboxRailAdapter = new SandboxRailAdapter({
    railId: MVP_RAIL_ID,
    sourceAssets: [{ assetId: MVP_ASSET_ID, scale: MVP_ASSET_SCALE }],
    destinationAssets: [{ assetId: MVP_ASSET_ID, scale: MVP_ASSET_SCALE }]
  });
  const railService = new RailService({
    eventStore,
    eventRepository: railEventRepository,
    policyDecisionService: spendPolicyService,
    authorizationService: mandateService,
    adapters: [sandboxRailAdapter]
  });
  const riskService = new RiskService({
    eventStore,
    authorizationService: mandateService,
    globalSubjectCapMinor: "1000000"
  });
  const creditLearningService = new CreditLearningService({ eventStore });
  const paymentService = new PaymentService({ railService });
  const settlementService = new SettlementService({ railService });
  const repaymentRouter = new RepaymentRouter({
    eventStore,
    obligationService,
    lockboxService,
    riskService
  });
  const adminService = new AdminService({ eventStore, riskService, obligationService });

  return {
    eventStore,
    mandateService,
    ledgerService,
    pluginRegistryService,
    identityService,
    lockboxService,
    obligationService,
    spendPolicyService,
    railService,
    riskService,
    creditLearningService,
    paymentService,
    settlementService,
    repaymentRouter,
    adminService
  };
}
