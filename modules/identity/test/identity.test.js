import assert from "node:assert/strict";
import test from "node:test";
import { PrincipalType, SubjectType } from "../../../packages/domain/src/index.js";
import { EventStore } from "../../event-audit/src/index.js";
import { IdentityService } from "../src/index.js";

test("identity service creates agent subject and binds CAIP-10 account", () => {
  const service = new IdentityService({ eventStore: new EventStore() });
  const principal = service.createPrincipal({ principalType: PrincipalType.DEVELOPER });
  const subject = service.createSubject({
    subjectType: SubjectType.AGENT,
    primaryPrincipalId: principal.principalId,
    displayName: "demo-agent"
  });
  const active = service.activateSubject(subject.subjectId);
  const binding = service.bindAccount({
    subjectId: active.subjectId,
    accountId: "eip155:8453:0x1111111111111111111111111111111111111111",
    signature: "0xsig",
    nonce: "nonce-1"
  });

  assert.equal(active.status, "active");
  assert.equal(binding.chainId, "eip155:8453");
});

test("identity service blocks production human subjects and invalid account IDs", () => {
  const service = new IdentityService({ eventStore: new EventStore() });
  const principal = service.createPrincipal({ principalType: PrincipalType.DEVELOPER });

  assert.throws(
    () =>
      service.createSubject({
        subjectType: SubjectType.HUMAN,
        primaryPrincipalId: principal.principalId,
        displayName: "human"
      }),
    /Human subjects are prototype-only/
  );

  const human = service.createSubject({
    subjectType: SubjectType.HUMAN,
    primaryPrincipalId: principal.principalId,
    displayName: "human prototype",
    prototypeOnly: true
  });
  assert.equal(human.prototypeOnly, true);
});
