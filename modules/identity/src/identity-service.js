import {
  AccountPurpose,
  CreditEventType,
  PrincipalType,
  PrincipalStatus,
  SubjectStatus,
  SubjectType,
  SubjectTransitions,
  assertCAIP10,
  assertEnumValue,
  assertNonEmptyString,
  assertNoRawPiiReference,
  assertTransition,
  chainIdFromCAIP10,
  createAccountBinding,
  createCreditEvent,
  createPrincipal,
  createSubject,
  createWalletAccount,
  enumValues,
  hashId
} from "../../../packages/domain/src/index.js";
import { DomainError } from "../../../packages/domain/src/index.js";

export class IdentityService {
  constructor({ eventStore, accountBindingVerifier, allowUnverifiedDemoBindings = false }) {
    this.eventStore = eventStore;
    this.accountBindingVerifier = accountBindingVerifier;
    this.allowUnverifiedDemoBindings = allowUnverifiedDemoBindings;
    this.principals = new Map();
    this.subjects = new Map();
    this.accountBindings = new Map();
    this.accountHashToSubject = new Map();
  }

  createPrincipal(input) {
    assertEnumValue("principalType", input.principalType, enumValues(PrincipalType));
    assertNoRawPiiReference(input);
    const principal = createPrincipal(input);
    this.principals.set(principal.principalId, principal);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.PRINCIPAL_CREATED,
        payload: { principalId: principal.principalId, principalHash: principal.principalHash }
      })
    );
    return structuredClone(principal);
  }

  createSubject(input) {
    assertEnumValue("subjectType", input.subjectType, enumValues(SubjectType));
    assertNonEmptyString("displayName", input.displayName);
    const principal = this.principals.get(input.primaryPrincipalId);
    if (!principal || principal.status !== PrincipalStatus.ACTIVE) {
      throw new DomainError("principal_not_active", "subject requires an active principal", {
        principalId: input.primaryPrincipalId
      });
    }
    if (input.subjectType === SubjectType.HUMAN && input.prototypeOnly !== true) {
      throw new DomainError("human_production_lending_blocked", "Human subjects are prototype-only in MVP");
    }
    assertNoRawPiiReference(input.metadata ?? {});

    const subject = createSubject(input);
    this.subjects.set(subject.subjectId, subject);
    principal.linkedSubjectIds.push(subject.subjectId);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.SUBJECT_CREATED,
        subjectId: subject.subjectId,
        payload: {
          subjectId: subject.subjectId,
          subjectHash: subject.subjectHash,
          subjectType: subject.subjectType,
          primaryPrincipalId: subject.primaryPrincipalId
        }
      })
    );
    return structuredClone(subject);
  }

  activateSubject(subjectId) {
    const subject = this.#requireSubject(subjectId);
    assertTransition("subject", SubjectTransitions, subject.status, SubjectStatus.ACTIVE);
    const previousStatus = subject.status;
    subject.status = SubjectStatus.ACTIVE;
    subject.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.SUBJECT_STATUS_CHANGED,
        subjectId,
        payload: { subjectId, previousStatus, newStatus: subject.status }
      })
    );
    return structuredClone(subject);
  }

  suspendSubject(subjectId, reason) {
    const subject = this.#requireSubject(subjectId);
    assertTransition("subject", SubjectTransitions, subject.status, SubjectStatus.SUSPENDED);
    const previousStatus = subject.status;
    subject.status = SubjectStatus.SUSPENDED;
    subject.updatedAt = new Date().toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.SUBJECT_STATUS_CHANGED,
        subjectId,
        payload: { subjectId, previousStatus, newStatus: subject.status, reason }
      })
    );
    return structuredClone(subject);
  }

  bindAccount({ subjectId, accountId, signature, nonce, purpose = AccountPurpose.PRIMARY }) {
    const subject = this.#requireSubject(subjectId);
    if (subject.status !== SubjectStatus.ACTIVE) {
      throw new DomainError("subject_not_active", "only active subjects can bind accounts", { subjectId });
    }
    assertCAIP10(accountId);
    assertNonEmptyString("signature", signature);
    assertNonEmptyString("nonce", nonce);

    let verificationMethod = "demo_unverified";
    if (this.accountBindingVerifier) {
      const verified = this.accountBindingVerifier({ subjectId, accountId, signature, nonce, purpose });
      if (verified !== true) {
        throw new DomainError("account_binding_verification_failed", "account binding signature verification failed", {
          subjectId
        });
      }
      verificationMethod = "verified_signature";
    } else if (!this.allowUnverifiedDemoBindings) {
      throw new DomainError(
        "account_binding_verifier_required",
        "account binding requires a configured verifier outside explicit demo mode",
        { subjectId }
      );
    }

    const account = createWalletAccount({ accountId, purpose, verificationMethod });
    if (this.accountHashToSubject.has(account.accountHash)) {
      throw new DomainError("account_already_bound", "CAIP-10 account is already bound", {
        accountHash: account.accountHash
      });
    }

    const signatureHash = hashId("signature", { signature, nonce, chainId: chainIdFromCAIP10(accountId) });
    const binding = createAccountBinding({ subjectId, account, signatureHash, nonce });
    this.accountBindings.set(binding.accountBindingId, binding);
    this.accountHashToSubject.set(account.accountHash, subjectId);
    subject.linkedAccountIds.push(binding.accountBindingId);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.WALLET_BOUND,
        subjectId,
        chainId: binding.chainId,
        payload: {
          subjectId,
          accountHash: binding.accountHash,
          purpose,
          signatureHash,
          nonce,
          verificationMethod
        }
      })
    );
    return structuredClone(binding);
  }

  getSubject(subjectId) {
    return structuredClone(this.#requireSubject(subjectId));
  }

  getPrincipal(principalId) {
    const principal = this.principals.get(principalId);
    if (!principal) throw new DomainError("principal_not_found", "principal not found", { principalId });
    return structuredClone(principal);
  }

  listSubjects() {
    return [...this.subjects.values()].map((subject) => structuredClone(subject));
  }

  #requireSubject(subjectId) {
    const subject = this.subjects.get(subjectId);
    if (!subject) throw new DomainError("subject_not_found", "subject not found", { subjectId });
    return subject;
  }
}
