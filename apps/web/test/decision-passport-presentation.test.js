import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compactDecisionProofHash,
  createHumanDecisionPassportPresentation,
  hasVerifiedHumanDecisionPassport
} from "../src/decision-passport-presentation.js";

const fixtures = JSON.parse(await readFile(
  new URL("../../../api/tenant-protocol/conformance/tenant-protocol.v1.fixtures.json", import.meta.url),
  "utf8"
));

function validDecision() {
  return structuredClone(
    fixtures.validResults.find(
      ({ operationId, response }) =>
        operationId === "pilotEvaluateCreditApplication" &&
        response.decision?.authorityType === "consent"
    ).response.decision
  );
}

test("Human Decision Passport presentation preserves one closed verified product truth", () => {
  const decision = validDecision();
  const presentation = createHumanDecisionPassportPresentation(decision);
  assert.equal(hasVerifiedHumanDecisionPassport(decision), true);
  assert.equal(Object.isFrozen(presentation), true);
  assert.equal(Object.isFrozen(presentation.reasons), true);
  assert.equal(Object.isFrozen(presentation.sources), true);
  assert.deepEqual(Object.keys(presentation).sort(), [
    "asOf",
    "decisionPassportHash",
    "evidenceSummary",
    "featureSetVersion",
    "featureSnapshotHash",
    "policyHash",
    "policyVersion",
    "reasons",
    "riskStateHash",
    "schemaVersion",
    "sources",
    "status"
  ]);
  assert.equal(presentation.status, "approved");
  assert.equal(presentation.policyVersion, "credit-application-rules.v1");
  assert.equal(presentation.featureSetVersion, "credit-application-evidence-features.v1");
  assert.equal(presentation.schemaVersion, "risk_decision_passport.v1");
  assert.equal(presentation.evidenceSummary, "5/5 finalized");
  assert.deepEqual(
    presentation.reasons.map(({ code }) => code),
    decision.reasonCodes
  );
  assert.deepEqual(
    presentation.sources.map(({ role }) => role),
    ["credit_intent", "subject", "principal", "authority", "human_identity_reference"]
  );
  assert.equal(presentation.sources.every(({ sourceFinality }) => sourceFinality === "finalized"), true);
  assert.equal(compactDecisionProofHash(decision.decisionPassport.policyHash), "0xaaaaaaaa…aaaaaa");
  assert.equal(compactDecisionProofHash("unsafe"), "Unavailable");
});

test("Human Decision Passport presentation fails closed on provenance or safety drift", () => {
  const mutations = [
    (decision) => { decision.reasonCodes[0] = "unknown_reason"; },
    (decision) => { decision.decisionPassport.reasonLineage[0].reasonCode = "sandbox_rules_v1_approved"; },
    (decision) => { decision.decisionPassport.sourceEvidence[0].sourceFinality = "observed"; },
    (decision) => { decision.decisionPassport.sourceEvidence.pop(); },
    (decision) => { decision.decisionPassport.sourceEvidence[0].role = "subject"; },
    (decision) => { decision.decisionPassport.policyVersion = "credit-application-rules.v2"; },
    (decision) => { decision.decisionPassport.policyHash = "0x1234"; },
    (decision) => { decision.decisionPassport.productionAuthority = true; },
    (decision) => { decision.decisionPassport.nonAuthorizing = false; },
    (decision) => { decision.decisionPassport.sandboxOnly = false; },
    (decision) => { decision.decisionPassport.asOf = "not-a-time"; }
  ];

  for (const mutate of mutations) {
    const decision = validDecision();
    mutate(decision);
    assert.equal(createHumanDecisionPassportPresentation(decision), null);
    assert.equal(hasVerifiedHumanDecisionPassport(decision), false);
  }
});
