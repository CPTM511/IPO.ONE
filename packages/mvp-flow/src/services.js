import { AdminService } from "../../../modules/admin/src/index.js";
import { CreditLearningService } from "../../../modules/credit-learning/src/index.js";
import { EventStore } from "../../../modules/event-audit/src/index.js";
import { IdentityService } from "../../../modules/identity/src/index.js";
import { LockboxService } from "../../../modules/lockbox/src/index.js";
import { ObligationService } from "../../../modules/obligation/src/index.js";
import { PaymentService, RepaymentRouter } from "../../../modules/payment/src/index.js";
import { RiskService } from "../../../modules/risk/src/index.js";
import { SettlementService } from "../../../modules/settlement/src/index.js";
import { SpendPolicyService } from "../../../modules/spend-policy/src/index.js";

export function createMvpServices() {
  const eventStore = new EventStore();
  const identityService = new IdentityService({ eventStore });
  const lockboxService = new LockboxService({ eventStore });
  const obligationService = new ObligationService({ eventStore });
  const spendPolicyService = new SpendPolicyService({ eventStore });
  const riskService = new RiskService({ eventStore, globalSubjectCapMinor: "1000000" });
  const creditLearningService = new CreditLearningService({ eventStore });
  const paymentService = new PaymentService({ eventStore });
  const settlementService = new SettlementService({ eventStore });
  const repaymentRouter = new RepaymentRouter({
    eventStore,
    obligationService,
    lockboxService,
    riskService
  });
  const adminService = new AdminService({ eventStore, riskService, obligationService });

  return {
    eventStore,
    identityService,
    lockboxService,
    obligationService,
    spendPolicyService,
    riskService,
    creditLearningService,
    paymentService,
    settlementService,
    repaymentRouter,
    adminService
  };
}
