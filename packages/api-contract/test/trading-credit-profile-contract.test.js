import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import {
  PrincipalStatus,
  SubjectStatus,
  SubjectType,
  createTradingAccountBindingChallenge,
  finalizeTradingEvidenceSnapshot,
  importSyntheticTradingHistory
} from "../../domain/src/index.js";
import schema from "../../../schemas/v2/trading-credit-profile.schema.json" with { type: "json" };

const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const HASH_C = `0x${"c".repeat(64)}`;
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
ajv.addFormat("date-time", {
  type: "string",
  validate(value) {
    return (
      typeof value === "string" &&
      /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
      Number.isFinite(new Date(value).getTime())
    );
  }
});
const validate = ajv.compile(schema);

for (const subjectType of [SubjectType.HUMAN, SubjectType.AGENT]) {
  test(`TC-101 ${subjectType} runtime profile satisfies the closed JSON Schema`, () => {
    const challenge = createTradingAccountBindingChallenge({
      tenantId: "tenant_contract",
      subject: {
        subjectId: `subject_${subjectType}`,
        subjectType,
        primaryPrincipalId: "principal_contract",
        status: SubjectStatus.ACTIVE
      },
      principal: {
        principalId: "principal_contract",
        status: PrincipalStatus.ACTIVE
      },
      requestedByActorId: `actor_${subjectType}`,
      challengeNonce: HASH_A,
      now: new Date("2026-07-25T00:00:00.000Z")
    });
    const imported = importSyntheticTradingHistory({
      profile: challenge,
      requestedByActorId: `actor_${subjectType}`,
      challengeEventId: "event_challenge_contract",
      challengeEvidenceHash: HASH_B,
      now: new Date("2026-07-25T00:01:00.000Z")
    });
    const finalized = finalizeTradingEvidenceSnapshot({
      profile: imported,
      sourceProjectionHash: HASH_C,
      historyImportEventId: "event_import_contract",
      historyImportEvidenceHash: HASH_A,
      sourceFinality: "finalized",
      now: new Date("2026-07-25T00:02:00.000Z")
    });
    assert.equal(validate(challenge), true, JSON.stringify(validate.errors));
    assert.equal(validate(imported), true, JSON.stringify(validate.errors));
    assert.equal(validate(finalized), true, JSON.stringify(validate.errors));
  });
}
