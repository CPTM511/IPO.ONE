import { realTradingCreditProfileView } from "../trading-capital-real-evidence.js";
import { fail } from "./shared.js";

export function assertExistingProfile(profile) {
  const current = realTradingCreditProfileView(profile);
  if (
    current.stage !== "finalized" ||
    current.testnetOnly !== true ||
    current.realFunds !== false ||
    current.productionAuthority !== false ||
    current.fundsAuthority !== false ||
    current.creditApproval !== false ||
    current.evidenceAuthority?.active !== true ||
    current.evidenceAuthority.authorizing !== false ||
    current.accountBinding?.status !== "active" ||
    current.evidenceSnapshot?.sourceFinality !== "finalized" ||
    current.evidenceSnapshot.authorizing !== false ||
    current.factorScorecard?.shadowRisk?.authorizing !== false ||
    current.factorScorecard.shadowRisk.economicStateMutation !== false ||
    current.factorScorecard.shadowRisk.newRiskAuthority !== false ||
    current.factorScorecard.shadowRisk.fundsAuthority !== false ||
    current.factorScorecard.shadowRisk.evidenceSnapshotHash !==
      current.evidenceSnapshot.snapshotHash ||
    current.factorScorecard.shadowRisk.historyHash !==
      current.historyImport?.historyHash
  ) {
    fail("finalized Trading Credit Profile safety boundary is invalid");
  }
  return current;
}
